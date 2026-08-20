import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import { ErpItem } from '../lib/types';
import { StatusBadge, formatDate, formatDeviation, SourcePopover, MissingData, TrustIndicator } from './ui';
import Timeline from './Timeline';

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</h4>
      {children}
    </div>
  );
}

function DetailRow({ label, children, field, item }: { label: string; children: ReactNode; field?: string; item?: ErpItem }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 sm:w-36 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-xs text-gray-800 break-words">{children}</span>
        {field && item && item.sources[field] && <SourcePopover field={field} item={item} />}
      </div>
    </div>
  );
}

function ConflictDisplay({ item }: { item: ErpItem }) {
  if (item.conflicts.length === 0) return null;

  return (
    <div className="mb-4">
      {item.conflicts.map((conflict) => (
        <div key={conflict.field} className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-red-700 mb-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.9 5h13.8a2 2 0 001.4-3.4L13.4 4.6a2 2 0 00-2.8 0L3.7 16.6a2 2 0 001.4 3.4z" />
            </svg>
            Обнаружены разные значения
          </div>
          <div className="space-y-2">
            {conflict.values.map((v, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-medium">{formatDate(v.value)}</span>
                  <SourcePopover field={conflict.field} item={item} />
                  <span className="text-[10px] text-gray-500 break-words">{v.source.details}</span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    conflict.selectedValue === v.value
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  {conflict.selectedValue === v.value ? 'Выбрано системой ✓' : 'Альтернативное значение'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-gray-600">
            <span className="font-medium">Выбранное системой значение: </span>
            <span className="font-mono">{formatDate(conflict.selectedValue)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ErpDetailPanel() {
  const selectedErpId = useStore((s) => s.selectedErpId);
  const erpItems = useStore((s) => s.erpItems);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const navigateTo = useStore((s) => s.navigateTo);

  const item = erpItems.find((i) => i.id === selectedErpId);
  if (!item) return null;

  const so = item.supplierOrderId ? supplierOrders.find((o) => o.id === item.supplierOrderId) : null;

  return (
    <div className="h-full min-h-0 flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <button
            onClick={() => navigateTo('orders')}
            className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад к списку
          </button>
          <TrustIndicator item={item} />
        </div>
        <h1 className="text-lg font-semibold font-mono text-gray-800 break-all">{item.erpCode}</h1>
        <p className="text-sm text-gray-500 mt-0.5 break-words">{item.nomenclature}</p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
          {so && (
            <button
              onClick={() => navigateTo('supplier-order-detail', { supplierOrderId: so.id })}
              className="text-xs font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {so.supplierOrderNumber} — {so.supplier}
            </button>
          )}
          <StatusBadge status={item.status} />
          {item.deadlines.deviation !== undefined && item.deadlines.deviation !== 0 && (
            <span className={`text-xs font-medium ${item.deadlines.deviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              Отклонение: {formatDeviation(item.deadlines.deviation)}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Conflicts */}
        <ConflictDisplay item={item} />

        {/* Timeline */}
        <Timeline item={item} />

        {/* Основная информация */}
        <DetailSection label="Основная информация">
          <DetailRow label="ERP-код" field="erpCode" item={item}>
            <span className="font-mono">{item.erpCode}</span>
          </DetailRow>
          <DetailRow label="Заказ поставщику">
            {so ? (
              <button
                onClick={() => navigateTo('supplier-order-detail', { supplierOrderId: so.id })}
                className="font-mono text-indigo-600 hover:underline"
              >
                {so.supplierOrderNumber}
              </button>
            ) : (
              <span className="text-amber-600">Не связан</span>
            )}
          </DetailRow>
          <DetailRow label="Номенклатура">{item.nomenclature}</DetailRow>
          <DetailRow label="Поставщик">{so?.supplier ?? '—'}</DetailRow>
          <DetailRow label="Клиент">{item.client ?? '—'}</DetailRow>
          <DetailRow label="Комментарий">{item.comment ?? '—'}</DetailRow>
        </DetailSection>

        {/* Согласование */}
        <DetailSection label="Согласование">
          <DetailRow label="Срок согласования файла" field="agreement.fileAgreementDeadline" item={item}>
            {item.agreement.fileAgreementDeadline ? (
              formatDate(item.agreement.fileAgreementDeadline)
            ) : (
              <MissingData />
            )}
          </DetailRow>
          <DetailRow label="Вопросы от завода" field="agreement.factoryQuestionsDate" item={item}>
            {item.agreement.factoryQuestionsDate ? (
              formatDate(item.agreement.factoryQuestionsDate)
            ) : (
              <MissingData />
            )}
          </DetailRow>
          <DetailRow label="Ответы клиента" field="agreement.clientAnswersDate" item={item}>
            {item.agreement.clientAnswersDate ? (
              formatDate(item.agreement.clientAnswersDate)
            ) : (
              <MissingData />
            )}
          </DetailRow>
          <DetailRow label="Дней ожидания ответа">
            {item.agreement.daysWaitingClient !== undefined ? (
              `${item.agreement.daysWaitingClient} дн`
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </DetailRow>
        </DetailSection>

        {/* Производство */}
        <DetailSection label="Производство">
          <DetailRow label="Срок производства (инвойс)" field="production.invoiceDeadline" item={item}>
            {item.production.invoiceDeadline ? formatDate(item.production.invoiceDeadline) : <MissingData />}
          </DetailRow>
          <DetailRow label="Запуск заказа поставщику" field="production.orderStartDate" item={item}>
            {item.production.orderStartDate ? formatDate(item.production.orderStartDate) : <MissingData />}
          </DetailRow>
          <DetailRow label="Запуск производства" field="production.productionStartDate" item={item}>
            {item.production.productionStartDate ? formatDate(item.production.productionStartDate) : <MissingData />}
          </DetailRow>
          <DetailRow label="Окончание Gold Plan" field="production.productionEndGoldPlan" item={item}>
            {item.production.productionEndGoldPlan ? formatDate(item.production.productionEndGoldPlan) : '—'}
          </DetailRow>
          <DetailRow label="Дата окончания производства (Расчетная)" field="production.productionEndPlan" item={item}>
            {item.production.productionEndPlan ? formatDate(item.production.productionEndPlan) : <MissingData />}
          </DetailRow>
          <DetailRow label="Окончание производства (факт)" field="production.productionEndFact" item={item}>
            {item.production.productionEndFact ? formatDate(item.production.productionEndFact) : <MissingData />}
          </DetailRow>
          <DetailRow label="Факт дней производства">
            {item.production.factProductionDays ? `${item.production.factProductionDays} дн` : '—'}
          </DetailRow>
          <DetailRow label="Просрочка поставщика">
            {item.production.supplierDelay ? (
              <span className="text-red-600 font-medium">{item.production.supplierDelay} дн</span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </DetailRow>
          <DetailRow label="Товар готов к отгрузке">
            {item.production.readyForShipment ? (
              <span className="text-emerald-600 font-medium">Да</span>
            ) : (
              <span className="text-gray-400">Нет</span>
            )}
          </DetailRow>
        </DetailSection>

        {/* Логистика */}
        <DetailSection label="Логистика">
          <DetailRow label="Срок до отгрузки" field="logistics.shipmentDeadline" item={item}>
            {item.logistics.shipmentDeadline ? formatDate(item.logistics.shipmentDeadline) : <MissingData />}
          </DetailRow>
          <DetailRow label="Номер поставки" field="logistics.deliveryNumber" item={item}>
            {item.logistics.deliveryNumber ? item.logistics.deliveryNumber : '—'}
          </DetailRow>
          <DetailRow label="Фактическая дата отгрузки" field="logistics.shipmentDate" item={item}>
            {item.logistics.shipmentDate ? formatDate(item.logistics.shipmentDate) : <MissingData />}
          </DetailRow>
          <DetailRow label="Дата доставки" field="logistics.deliveryDate" item={item}>
            {item.logistics.deliveryDate ? formatDate(item.logistics.deliveryDate) : <MissingData />}
          </DetailRow>
          <DetailRow label="Дней на доставку">
            {item.logistics.deliveryDays ? `${item.logistics.deliveryDays} дн` : '—'}
          </DetailRow>
          <DetailRow label="Срок доставки (способ)" field="logistics.deliveryMethodDeadline" item={item}>
            {item.logistics.deliveryMethodDeadline ? formatDate(item.logistics.deliveryMethodDeadline) : '—'}
          </DetailRow>
        </DetailSection>

        {/* Дедлайны */}
        <DetailSection label="Дедлайны">
          <DetailRow label="Дедлайн" field="deadlines.deadline" item={item}>
            {item.deadlines.deadline ? formatDate(item.deadlines.deadline) : '—'}
          </DetailRow>
          <DetailRow label="Отклонение">
            <span className={item.deadlines.deviation && item.deadlines.deviation > 0 ? 'text-red-600 font-medium' : ''}>
              {formatDeviation(item.deadlines.deviation) ?? '—'}
            </span>
          </DetailRow>
          <DetailRow label="Gold Deadline" field="deadlines.goldDeadline" item={item}>
            {item.deadlines.goldDeadline ? formatDate(item.deadlines.goldDeadline) : '—'}
          </DetailRow>
          <DetailRow label="Отклонение Gold">
            <span className={item.deadlines.goldDeviation && item.deadlines.goldDeviation > 0 ? 'text-red-600 font-medium' : ''}>
              {formatDeviation(item.deadlines.goldDeviation) ?? '—'}
            </span>
          </DetailRow>
        </DetailSection>

        {/* Проблемы */}
        <DetailSection label="Проблемы">
          <DetailRow label="Причина срыва">
            {item.problems.reason ?? <span className="text-gray-400">—</span>}
          </DetailRow>
          <DetailRow label="Текущий блокер">
            {item.problems.blocker ?? <span className="text-gray-400">—</span>}
          </DetailRow>
          <DetailRow label="Ответственный">
            {item.problems.responsible ?? <span className="text-gray-400">—</span>}
          </DetailRow>
          <DetailRow label="Комментарий">{item.problems.comment ?? '—'}</DetailRow>
        </DetailSection>
      </div>
    </div>
  );
}