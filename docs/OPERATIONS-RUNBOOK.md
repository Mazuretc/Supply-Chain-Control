# Lovarus: эксплуатация и восстановление

Целевая схема рассчитана на один Windows Server: IIS принимает HTTPS и раздаёт
React, PostgreSQL работает локально, API и mail worker запущены отдельными
Windows-службами. До исправления loopback bind из раздела 10 доступ к API
порту `3000` обязательно закрывается Windows Firewall. Команды выполняются из
корня релиза, если не указано иное.

## 1. Каталоги и секреты

Рекомендуемая раскладка:

```text
C:\Lovarus\
  current\                 # junction на активный релиз
  releases\<version>\
  shared\server.env        # секреты вне репозитория
  service\                 # WinSW и журналы служб
  backups\                 # локальная копия, дополнительно копировать off-host
```

- `.env.example` в корне содержит только публичную browser-конфигурацию.
  Значения `VITE_*` никогда не должны быть секретами: Vite включает их в JS.
- `server/.env.example` — шаблон, не рабочая конфигурация. Скопируйте его в
  `C:\Lovarus\shared\server.env`, замените все `<...>`, **удалите строку
  `ADMIN_PASSWORD` целиком** и затем копируйте в `server\.env` каждого релиза.
  Bootstrap password никогда не хранится в shared/release env и не передаётся
  долгоживущим API/worker службам.
- Сгенерируйте секреты криптографическим RNG. Для
  `IMAP_CREDENTIALS_KEY` нужны ровно 32 случайных байта в Base64.
- Пароль PostgreSQL в `DATABASE_URL` должен быть URL-encoded.
- После копирования ограничьте ACL файла:

```powershell
icacls C:\Lovarus\shared\server.env /inheritance:r
icacls C:\Lovarus\shared\server.env /grant:r "Administrators:F" "SYSTEM:F"
icacls C:\Lovarus\current\server\.env /inheritance:r
icacls C:\Lovarus\current\server\.env /grant:r "Administrators:F" "SYSTEM:F" "NT SERVICE\LovarusApi:R" "NT SERVICE\LovarusWorker:R"
```

Не храните рабочий `.env`, `pgpass.conf`, дампы и ключи в Git или в каталоге,
раздаваемом IIS.

## 2. PostgreSQL

Установите поддерживаемую версию PostgreSQL и добавьте каталог `bin` в `PATH`.
Доступ по сети не требуется: оставьте `listen_addresses` на loopback и
разрешите в `pg_hba.conf` только локальные подключения, необходимые службам.

Создайте защищённый `pgpass.conf` для администратора развертывания:

```text
127.0.0.1:5432:*:postgres:<ADMIN_PASSWORD>
127.0.0.1:5432:*:lovarus_app:<APPLICATION_PASSWORD>
```

Укажите путь через `$env:PGPASSFILE`; выдайте чтение только учётной записи,
которая выполняет команду. Затем создайте роль и БД (пароль приложения
запрашивается как `SecureString` и не передаётся в аргументах процесса):

```powershell
$env:PGPASSFILE = "C:\Lovarus\shared\pgpass.conf"
.\deploy\postgresql\Initialize-LovarusDatabase.ps1 `
  -PsqlPath "C:\Program Files\PostgreSQL\<version>\bin\psql.exe"
```

Frontend всегда собирается из корня нового релиза точной последовательностью:

```powershell
Set-Location C:\Lovarus\releases\<version>
npm ci
npm run build
Copy-Item .\deploy\iis\web.config .\dist\web.config -Force
```

Backend собирается и мигрируется отдельно:

```powershell
Set-Location C:\Lovarus\releases\<version>\server
npm ci
npm run build
npx prisma migrate deploy
```

При первом развёртывании (или при явно одобренной смене admin password)
bootstrap выполняется интерактивно **до** `npm prune`. Скрипт запрещает
`ADMIN_PASSWORD` в `server\.env`, передаёт пароль seed-процессу только через
временную process environment и удаляет его в `finally`:

```powershell
Set-Location C:\Lovarus\releases\<version>
.\deploy\postgresql\Seed-LovarusAdmin.ps1 `
  -ServerRoot C:\Lovarus\releases\<version>\server
Get-ChildItem Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
Select-String C:\Lovarus\shared\server.env,C:\Lovarus\releases\<version>\server\.env `
  -Pattern '^\s*ADMIN_PASSWORD\s*='
```

Последние две команды не должны вернуть пароль/строку. После успешного seed
сразу закройте bootstrap-сессию терминала и только затем запускайте службы.
Повторный seed меняет существующий admin password и требует change approval.
После optional seed удалите build-only зависимости:

```powershell
Set-Location C:\Lovarus\releases\<version>\server
npm prune --omit=dev
```

Не запускайте `prisma migrate dev` на production. Перед миграцией сделайте
backup. Миграции считаются forward-only; совместимость старой версии
приложения со схемой проверяется до релиза.

## 3. IIS

1. Установите IIS Static Content, URL Rewrite и Application Request Routing.
2. В ARR включите proxy. В URL Rewrite на уровне сервера добавьте разрешённую
   server variable `HTTP_X_FORWARDED_PROTO`.
3. Создайте site с physical path `C:\Lovarus\current\dist`; App Pool:
   `No Managed Code`. Скопируйте `deploy\iis\web.config` в этот каталог.
4. Настройте точные host bindings (не wildcard) для HTTP/HTTPS и доверенный
   внутренний сертификат. Первое rewrite-правило делает permanent HTTP→HTTPS
   redirect. При внешнем TLS terminator оно не создаёт loop, если terminator
   передаёт `X-Forwarded-Proto: https`; иначе это правило нужно отключить на
   IIS и выполнять redirect на terminator.
5. Конфиг передаёт `X-Forwarded-Proto=https` в API; это необходимо для secure
   session cookie при `NODE_ENV=production`.
6. Не публикуйте порт `3000` в Windows Firewall. В `server\.env` оставьте
   `TRUST_PROXY=loopback`.

Правило `/api/*` проксирует запрос без изменения пути на
`127.0.0.1:3000`; остальные неизвестные пути возвращают `index.html` для SPA.
После настройки проверьте, что API-ошибки проходят через IIS без подмены HTML.
Точные команды управления App Pool:

```powershell
$appcmd = "$env:SystemRoot\System32\inetsrv\appcmd.exe"
& $appcmd stop apppool /apppool.name:Lovarus
& $appcmd start apppool /apppool.name:Lovarus
# Для config/static-only обновления без junction switch:
& $appcmd recycle apppool /apppool.name:Lovarus
```

## 4. Службы API и worker

Скачайте проверенный WinSW x64 из утверждённого внутреннего источника и
зафиксируйте его версию/хеш в реестре поставки. После сборки обоих entrypoint:

```powershell
.\deploy\windows-services\Install-LovarusServices.ps1 `
  -InstallRoot C:\Lovarus\current `
  -WinSwPath C:\Installers\WinSW-x64.exe `
  -PostgresServiceName postgresql-x64-<version>
```

Скрипт требует `dist\main.js` и `dist\worker.js`, создаёт две службы с
automatic delayed start, restart-on-failure, rolling logs и виртуальными
учётными записями `NT SERVICE\LovarusApi`/`LovarusWorker`. Для удаления:

```powershell
.\deploy\windows-services\Uninstall-LovarusServices.ps1 -InstallRoot C:\Lovarus\current
```

Удаление служб не удаляет конфигурацию, журнал, релиз или БД.

## 5. Backup и проверка восстановления

Один раз создайте локальный каталог с закрытым ACL. Скрипт удаляет inherited
ACL и оставляет только SYSTEM/Administrators (FullControl) и task account
(Modify):

```powershell
.\deploy\postgresql\Protect-LovarusBackupDirectory.ps1 `
  -BackupDirectory C:\Lovarus\backups `
  -BackupPrincipal "DOMAIN\svc-lovarus"
```

`Backup-LovarusDatabase.ps1` откажется писать в каталог с inherited ACL или
доступом Everyone/Authenticated Users/Builtin Users. Ежедневный dump создаётся
локально, проверяется через `pg_restore --list`, получает обязательный SHA-256
sidecar, затем копируется во внешний каталог через `.partial` и повторно
проверяется по SHA-256:

```powershell
.\deploy\postgresql\Backup-LovarusDatabase.ps1 `
  -BackupDirectory C:\Lovarus\backups `
  -OffHostBackupDirectory \\backup01\lovarus$ `
  -PgBin "C:\Program Files\PostgreSQL\<version>\bin" `
  -PgPassFile C:\Lovarus\shared\pgpass.conf `
  -RetentionDays 30
```

Task account должен иметь `Log on as a batch job`, read к `pgpass.conf` и
Modify к off-host share. Установите обе reproducible задачи (backup 02:00,
monitoring каждые 5 минут) одной командой. Для обычной domain account пароль
запрашивается как credential и передаётся Task Scheduler API; для gMSA/SYSTEM
не указывайте `-TaskCredential`.

```powershell
$taskCredential = Get-Credential "DOMAIN\svc-lovarus"
.\deploy\tasks\Install-LovarusScheduledTasks.ps1 `
  -RepositoryRoot C:\Lovarus\current `
  -TaskUser "DOMAIN\svc-lovarus" `
  -TaskCredential $taskCredential `
  -BackupDirectory C:\Lovarus\backups `
  -OffHostBackupDirectory \\backup01\lovarus$ `
  -PgBin "C:\Program Files\PostgreSQL\<version>\bin" `
  -PgPassFile C:\Lovarus\shared\pgpass.conf `
  -PublicSiteUrl https://lovarus.internal/ `
  -RequireWorkerProgress
Start-ScheduledTask -TaskName Lovarus-DailyBackup
Get-ScheduledTaskInfo -TaskName Lovarus-DailyBackup
Start-ScheduledTask -TaskName Lovarus-Monitoring
Get-ScheduledTaskInfo -TaskName Lovarus-Monitoring
```

`LastTaskResult` обеих задач должен быть `0`. Удаление определений (данные
backup и конфигурация сохраняются):

```powershell
.\deploy\tasks\Uninstall-LovarusScheduledTasks.ps1
```

Не реже раза в неделю и перед значимым релизом проверяйте последний backup:

```powershell
.\deploy\postgresql\Test-LovarusRestore.ps1 `
  -BackupFile C:\Lovarus\backups\<dump>.dump `
  -PgBin "C:\Program Files\PostgreSQL\<version>\bin" `
  -PgPassFile C:\Lovarus\shared\pgpass.conf
```

Отсутствующий, malformed, относящийся к другому filename или несовпадающий
`.sha256` теперь всегда останавливает restore. Скрипт создаёт отдельную БД из
`template0`, восстанавливает с `--exit-on-error`, требует завершённые Prisma
migrations, ровно одного admin, representative SupplierOrder/ErpItem rows и
отсутствие нескольких current deadline для одного поля. Затем тестовая БД
удаляется. Успешный `pg_dump` без этой проверки не считается проверенным
backup. Записывайте дату, dump, SHA-256, версии PostgreSQL/app и результат.

Аварийное восстановление выполняется на изолированном хосте или после
подтверждённой остановки обеих служб: создать пустую БД из `template0`,
проверить sidecar, выполнить `pg_restore --exit-on-error` и application smoke.
До открытия IIS:

1. Запустить API на временном порту с `DATABASE_URL` восстановленной БД и
   существующими production secrets, но `TRUST_PROXY=false`.
2. Убедиться, что процесс подключился к БД; recovery host должен быть
   изолирован firewall, потому что текущий server bind описан в разделе 10.
3. Выполнить unauthenticated `GET /api/admin/auth/session`; ожидаемый `401`
   подтверждает HTTP pipeline без создания authenticated session.
4. Через staging IIS войти существующим admin, открыть список заказов и
   сверить минимум один `supplierOrderNumber` с SQL.
5. Остановить recovery API, удалить временные process variables и только после
   change approval переключить production `DATABASE_URL`.

На isolated recovery host шаги 1–3 выполняются точно так:

```powershell
# Terminal 1; ввести recovery URL, не сохранять его в файле/history.
$env:DATABASE_URL = Read-Host "Recovery DATABASE_URL"
$env:PORT = "3100"
$env:NODE_ENV = "production"
$env:TRUST_PROXY = "false"
Set-Location C:\Lovarus\current\server
node .\dist\main.js
```

```powershell
# Terminal 2; 401 является ожидаемым успешным smoke result.
try {
  Invoke-WebRequest http://127.0.0.1:3100/api/admin/auth/session `
    -UseBasicParsing -TimeoutSec 15 | Out-Null
  throw "Expected HTTP 401, but endpoint allowed an anonymous session."
} catch {
  if (-not $_.Exception.Response -or
      [int]$_.Exception.Response.StatusCode -ne 401) { throw }
}
```

После smoke остановите Terminal 1 (`Ctrl+C`) и выполните
`Remove-Item Env:DATABASE_URL,Env:PORT,Env:NODE_ENV,Env:TRUST_PROXY`.

## 6. Health checks и мониторинг

Проверка с хоста (URL обязательно HTTPS):

```powershell
.\deploy\monitoring\Test-LovarusHealth.ps1 `
  -PublicSiteUrl https://lovarus.internal/ `
  -BackupDirectory C:\Lovarus\backups `
  -OffHostBackupDirectory \\backup01\lovarus$ `
  -PgBin "C:\Program Files\PostgreSQL\<version>\bin" `
  -PgPassFile C:\Lovarus\shared\pgpass.conf `
  -RequireWorkerProgress
```

Она проверяет службы, локальный TCP API, static IIS/HTTPS, PostgreSQL, возраст
backup, обязательные sidecar, наличие/размер/checksum metadata off-host copy,
свободное место и время последнего `MailMessage`/mail-like `Job`. Probe
запрашивает только static site и **не вызывает session endpoints**, поэтому
не создаёт persistent health sessions. До первой реальной обработки можно
не задавать `-RequireWorkerProgress`; после приёмки mail flow флаг обязателен.
Оповещайте после двух последовательных ошибок.

Минимальные сигналы:

- службы не `Running`, WinSW restart loop или новые ошибки в
  `service\logs\LovarusApi`/`LovarusWorker`;
- HTTP probe > 2 секунд или non-2xx;
- backup старше 26 часов, нет off-host копии, weekly restore test просрочен;
- свободное место диска < 20% или < 20 ГБ;
- рост unresolved `ProcessingError`, jobs `FAILED`, либо `RUNNING` дольше
  максимального lease worker;
- отсутствие успешной обработки писем дольше ожидаемого интервала + 2 poll.

Операционные запросы выполняйте read-only пользователем:

```sql
SELECT status, count(*) FROM "Job" GROUP BY status;
SELECT count(*) FROM "ProcessingError" WHERE "resolvedAt" IS NULL;
SELECT id, type, attempts, "startedAt", "lastError"
FROM "Job" WHERE status IN ('RUNNING', 'FAILED')
ORDER BY "updatedAt" DESC LIMIT 50;
```

## 7. Retry и ошибки: эксплуатационный контракт

Worker-фаза должна соблюдать этот контракт; до появления worker это не
подтверждённое runtime-поведение.

- Retry только для transient ошибок: IMAP disconnect/timeout, временная ошибка
  файловой системы, GPT `429`, timeout и `5xx`.
- Не retry автоматически: повреждённый/неподдерживаемый Excel, невалидная дата,
  неизвестный заказ, низкая confidence, ошибка схемы GPT и неверные
  credentials. Они создают понятный `ProcessingError` и требуют исправления.
- Рекомендуемый backoff с jitter: 1, 5, 15, 60 минут, максимум 5 попыток.
  `attempts`, `availableAt` и последняя безопасно очищенная ошибка сохраняются
  в `Job`; секреты и полные тела писем в журнал не попадают.
- Job key обязан быть идемпотентным. Одно письмо нельзя обрабатывать
  параллельно; зависший `RUNNING` возвращается в очередь только после
  истечения lease. Повторный запуск из admin UI использует тот же источник и
  не создаёт повторные сроки/аудит.
- `PENDING` — ожидает/отложен; `RUNNING` — lease активен; `SUCCEEDED` —
  транзакция завершена; `FAILED` — попытки исчерпаны или ошибка permanent.
- Для инцидента сохраните job/error ID, code, timestamps и sanitized message.
  Сначала устраните причину, затем повторите одну ошибку и контролируйте
  идемпотентность; массовый retry без оценки причины запрещён.

## 8. Обновление

Зафиксируйте version и создайте immutable release directory. Не собирайте
внутри `current`:

```powershell
$version = "2026.08.17.1"
$release = "C:\Lovarus\releases\$version"
New-Item -ItemType Directory -Path $release
# Затем распаковать ровно утверждённый artifact в $release.
Copy-Item C:\Lovarus\shared\server.env "$release\server\.env"
icacls "$release\server\.env" /inheritance:r
icacls "$release\server\.env" /grant:r `
  "Administrators:F" "SYSTEM:F" `
  "NT SERVICE\LovarusApi:R" "NT SERVICE\LovarusWorker:R"
if (Select-String "$release\server\.env" -Pattern '^\s*ADMIN_PASSWORD\s*=') {
  throw "ADMIN_PASSWORD must not enter a release."
}
```

Далее: fresh local+off-host backup, weekly restore test, frontend/backend
последовательности из раздела 2 и `prisma migrate deploy`. Если migration не
backward-compatible со старым app, обычный junction rollback запрещён:
заранее одобрите restore-based rollback и возможную потерю данных.

Активация выполняется одним fail-safe скриптом:

```powershell
Set-Location C:\Lovarus
& C:\Lovarus\releases\2026.08.17.1\deploy\release\Switch-LovarusRelease.ps1 `
  -NewRelease C:\Lovarus\releases\2026.08.17.1 `
  -CurrentJunction C:\Lovarus\current `
  -AppPoolName Lovarus `
  -ApiServiceName LovarusApi `
  -WorkerServiceName LovarusWorker
```

Скрипт проверяет artifacts и отсутствие `ADMIN_PASSWORD`, останавливает IIS
App Pool → worker → API, удаляет **только подтверждённый junction**, создаёт и
проверяет новый junction, запускает API, ждёт local TCP, затем worker и IIS.
При ошибке после switch он автоматически возвращает предыдущий target. После:

```powershell
Get-Item C:\Lovarus\current -Force | Select-Object FullName,Target,LinkType
Get-Service LovarusApi,LovarusWorker
.\deploy\monitoring\Test-LovarusHealth.ps1 `
  -PublicSiteUrl https://lovarus.internal/ `
  -BackupDirectory C:\Lovarus\backups `
  -OffHostBackupDirectory \\backup01\lovarus$ `
  -PgBin "C:\Program Files\PostgreSQL\<version>\bin" `
  -PgPassFile C:\Lovarus\shared\pgpass.conf `
  -RequireWorkerProgress
```

Для отдельно одобренной service maintenance точный порядок:

```powershell
$appcmd = "$env:SystemRoot\System32\inetsrv\appcmd.exe"
& $appcmd stop apppool /apppool.name:Lovarus
Stop-Service LovarusWorker
(Get-Service LovarusWorker).WaitForStatus("Stopped",[TimeSpan]::FromSeconds(30))
Stop-Service LovarusApi
(Get-Service LovarusApi).WaitForStatus("Stopped",[TimeSpan]::FromSeconds(30))
Start-Service LovarusApi
(Get-Service LovarusApi).WaitForStatus("Running",[TimeSpan]::FromSeconds(30))
Start-Service LovarusWorker
(Get-Service LovarusWorker).WaitForStatus("Running",[TimeSpan]::FromSeconds(30))
& $appcmd start apppool /apppool.name:Lovarus
& $appcmd recycle apppool /apppool.name:Lovarus
```

Наблюдайте минимум один полный mail poll. Старый release и backup не удалять
до окончания окна отката.

## 9. Откат

Если schema совместима, rollback использует тот же проверяемый switch:

```powershell
Set-Location C:\Lovarus
& C:\Lovarus\releases\2026.08.16.3\deploy\release\Switch-LovarusRelease.ps1 `
  -NewRelease C:\Lovarus\releases\2026.08.16.3 `
  -CurrentJunction C:\Lovarus\current `
  -AppPoolName Lovarus
```

Если автоматический script недоступен, не используйте `Remove-Item -Recurse`.
После остановки App Pool/служб команда ниже откажется трогать обычный каталог:

```powershell
$current = Get-Item C:\Lovarus\current -Force
if (-not ($current.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw "current is not a junction"
}
cmd.exe /d /c 'rmdir "C:\Lovarus\current"'
New-Item -ItemType Junction `
  -Path C:\Lovarus\current `
  -Target C:\Lovarus\releases\2026.08.16.3
Get-Item C:\Lovarus\current -Force | Select-Object FullName,Target,LinkType
```

Затем запустите API → worker → App Pool точными командами раздела 8 и health
check. Если schema несовместима, старый код запускать нельзя: восстановите
предрелизный dump в отдельную БД, выполните checksum/restore/application smoke,
получите решение владельца данных о потере post-backup изменений и только
затем переключайте `DATABASE_URL`.

Проверить API/DB, очереди, unresolved errors, admin login и один безопасный
mail poll. Сохранить логи и открыть post-incident review.

Никогда не пытайтесь «откатить» production schema командой
`prisma migrate dev` или ручным удалением migration history.

## 10. Оставшиеся изменения server-фазы

Эти два finding нельзя безопасно исправить в operational-only pass:

1. API сейчас слушает `0.0.0.0`; firewall снижает риск, но не заменяет bind.
   После merge server-config фазы добавить validated `BIND_HOST=127.0.0.1`
   (или hard bind loopback) в bootstrap и service env.
2. Текущий env validator не отклоняет все angle-bracket placeholders
   (`<DATABASE_PASSWORD>`, `<GENERATE_...>`). После merge расширить placeholder
   rejection и тесты. До этого release checklist обязан проверять отсутствие
   `<`/`>` и известных placeholder tokens перед запуском служб.
