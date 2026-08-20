import type { IntegrationStatus, PublicData } from './api';
import type { ErpItem, OrderStatus, SupplierOrder, TrustLevel } from './types';

export interface ErpExportOptions {
  today?: string;
  lastSyncAt?: string;
}

const CLIENT_ORDER_PREFIX = 'заказ клиента';

function text(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function normalizeHeader(value: unknown): string {
  return text(value).toLocaleLowerCase('ru-RU');
}

function parseIsoDate(value: unknown): string | undefined {
  const raw = text(value);
  const match = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

function parseQuantity(value: unknown): number {
  const raw = text(value).replace(/\s/g, '');
  if (!raw) return 0;
  const normalized = /^\d{1,3}(?:,\d{3})+$/.test(raw)
    ? raw.replace(/,/g, '')
    : raw.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDelay(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw || raw.toLocaleLowerCase('ru-RU') === 'нет данных') return undefined;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function mergeUniqueLabel(current: string | undefined, next: string): string {
  if (!current) return next;
  const parts = current.split(', ').filter(Boolean);
  if (parts.includes(next)) return current;
  return [...parts, next].join(', ');
}

function mergeHeaderRows(upper: unknown[], lower: unknown[]): string[] {
  const length = Math.max(upper.length, lower.length);
  return Array.from({ length }, (_, index) => (
    normalizeHeader(lower[index]) || normalizeHeader(upper[index])
  ));
}

function findHeaderIndex(sheet: unknown[][]): number {
  return sheet.findIndex((row) => (
    Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === 'номенклатура')
  ));
}

function erpSource(details: string, date?: string) {
  return {
    type: 'erp' as const,
    label: 'ERP',
    details,
    date,
  };
}

function mapStatus(input: {
  rawStatus: string;
  warehouse: number;
  onWay: number;
  inProduction: number;
  delay?: number;
}): OrderStatus {
  const status = input.rawStatus.toLocaleLowerCase('en-US');
  if (!input.rawStatus) return 'требует_данных';
  if (input.warehouse > 0 && input.onWay === 0) return 'доставлено';
  if (input.onWay > 0) return 'в_доставке';
  if ((input.delay ?? 0) > 0 && input.inProduction > 0) return 'производство_просрочено';
  if (/ship|sent|arriv|russia/.test(status)) return 'в_доставке';
  if (/finish|ready|fqc|packing/.test(status)) return 'готово';
  if (input.inProduction > 0 || /produc|progress|ep\d|pr\d|plating|etch|drill|solder|silk|rout|cut|circuit|material|inner|stack|treatment|pth|outer|engineering/.test(status)) {
    return 'в_производстве';
  }
  return 'в_производстве';
}

function currentStageLabel(status: OrderStatus, rawStatus: string): string {
  if (rawStatus) return rawStatus;
  const labels: Record<OrderStatus, string> = {
    согласование: 'Согласование',
    ожидаем_клиента: 'Ожидаем клиента',
    заказ_размещён: 'Заказ размещён',
    в_производстве: 'В производстве',
    производство_просрочено: 'Производство просрочено',
    готово: 'Готово',
    ожидает_отгрузки: 'Ожидает отгрузки',
    в_доставке: 'В доставке',
    доставлено: 'Доставлено',
    требует_данных: 'Требует данных',
  };
  return labels[status];
}

function deriveOrderStatus(items: ErpItem[]): SupplierOrder['status'] {
  if (items.some((item) => item.status === 'производство_просрочено')) return 'производство_просрочено';
  if (items.every((item) => item.status === 'доставлено')) return 'доставлено';
  if (items.some((item) => item.status === 'в_доставке')) return 'в_доставке';
  if (items.some((item) => item.status === 'готово' || item.status === 'ожидает_отгрузки')) return 'готово';
  if (items.some((item) => item.status === 'требует_данных')) return 'требует_данных';
  return 'в_производстве';
}

export function mapErpExport(
  sheet: unknown[][],
  options: ErpExportOptions = {},
): PublicData {
  const headerIndex = findHeaderIndex(sheet);
  if (headerIndex < 0) {
    return {
      erpItems: [],
      supplierOrders: [],
      lastSyncAt: options.lastSyncAt ?? null,
      integrations: [],
    };
  }

  const headers = mergeHeaderRows(sheet[headerIndex - 1] ?? [], sheet[headerIndex] ?? []);
  const supplierCol = findColumn(headers, ['поставщик', 'заказ клиента']);
  const nameCol = findColumn(headers, ['номенклатура']);
  const codeCol = findColumn(headers, ['код']);
  const orderCol = findColumn(headers, ['№ заказа поставщику', 'номер заказа поставщику']);
  const prodEndCol = findColumn(headers, ['дата окончания производства (расчетная)']);
  const deliveryMethodCol = findColumn(headers, ['способ доставки']);
  const statusCol = findColumn(headers, ['статус товара']);
  const loadedCol = findColumn(headers, ['дата загрузки данных']);
  const factReadyCol = findColumn(headers, ['фактическая дата готовности']);
  const deadlineCol = findColumn(headers, ['дедлайн']);
  const mskCol = findColumn(headers, ['плановая дата поступления в мск']);
  const clientCol = findColumn(headers, ['клиент']);
  const shipmentCol = findColumn(headers, ['фактическая дата отгрузки', 'дата отгрузки']);
  const onWayCol = findColumn(headers, ['количество в пути']);
  const inProdCol = findColumn(headers, ['в производстве']);
  const warehouseCol = findColumn(headers, ['количество на складе']);
  const dealCol = findColumn(headers, ['подвид сделки']);
  const delayCol = findColumn(headers, ['срыв срока готовности']);

  const erpItems: ErpItem[] = [];
  const orders = new Map<string, SupplierOrder & { itemIds: string[] }>();
  let clientOrderCreatedAt: string | undefined;
  const seenIds = new Map<string, number>();

  for (const row of sheet.slice(headerIndex + 1)) {
    if (!Array.isArray(row)) continue;
    const first = text(row[supplierCol] ?? row[0]);
    const nomenclature = nameCol >= 0 ? text(row[nameCol]) : '';
    const erpCode = codeCol >= 0 ? text(row[codeCol]) : '';
    if (first.toLocaleLowerCase('ru-RU').startsWith(CLIENT_ORDER_PREFIX)) {
      clientOrderCreatedAt = parseIsoDate(first) ?? clientOrderCreatedAt;
      continue;
    }
    if (!nomenclature && !erpCode) continue;

    const supplierOrderNumber = orderCol >= 0 ? text(row[orderCol]) : '';
    const supplier = first;
    const rawStatus = statusCol >= 0 ? text(row[statusCol]) : '';
    const warehouse = warehouseCol >= 0 ? parseQuantity(row[warehouseCol]) : 0;
    const onWay = onWayCol >= 0 ? parseQuantity(row[onWayCol]) : 0;
    const inProduction = inProdCol >= 0 ? parseQuantity(row[inProdCol]) : 0;
    const delay = delayCol >= 0 ? parseDelay(row[delayCol]) : undefined;
    const productionEndPlan = prodEndCol >= 0 ? parseIsoDate(row[prodEndCol]) : undefined;
    const productionEndFact = factReadyCol >= 0 ? parseIsoDate(row[factReadyCol]) : undefined;
    const deadline = deadlineCol >= 0 ? parseIsoDate(row[deadlineCol]) : undefined;
    const deliveryDate = mskCol >= 0 ? parseIsoDate(row[mskCol]) : undefined;
    const shipmentDate = shipmentCol >= 0 ? parseIsoDate(row[shipmentCol]) : undefined;
    const loadedAt = loadedCol >= 0 ? parseIsoDate(row[loadedCol]) : undefined;
    const client = clientCol >= 0 ? text(row[clientCol]) : '';
    const deliveryMethod = deliveryMethodCol >= 0 ? text(row[deliveryMethodCol]) : '';
    const deal = dealCol >= 0 ? text(row[dealCol]) : '';
    const status = mapStatus({ rawStatus, warehouse, onWay, inProduction, delay });
    const missingFields: string[] = [];
    if (!rawStatus) missingFields.push('Статус товара');
    if (!deadline) missingFields.push('Дедлайн');
    if (!productionEndPlan) missingFields.push('Дата окончания производства (Расчетная)');
    const trustLevel: TrustLevel = status === 'производство_просрочено' || missingFields.length > 0
      ? 'needs_review'
      : 'confirmed';
    const idBase = `${erpCode || nomenclature}:${supplierOrderNumber || 'unlinked'}`;
    const duplicate = seenIds.get(idBase) ?? 0;
    seenIds.set(idBase, duplicate + 1);
    const id = duplicate === 0 ? idBase : `${idBase}:${duplicate + 1}`;
    const sourceDate = loadedAt ?? deadline ?? productionEndPlan;

    const item: ErpItem = {
      id,
      erpCode: erpCode || id,
      supplierOrderId: supplierOrderNumber || null,
      nomenclature: nomenclature || erpCode,
      status,
      currentStage: currentStageLabel(status, rawStatus),
      client: client || undefined,
      comment: deal || undefined,
      agreement: {},
      production: {
        productionEndPlan,
        productionEndFact,
        supplierDelay: delay,
        readyForShipment: status === 'готово' || status === 'ожидает_отгрузки' || status === 'в_доставке' || status === 'доставлено',
      },
      logistics: {
        deliveryMethodDeadline: deliveryMethod || undefined,
        shipmentDate,
        deliveryDate,
      },
      deadlines: {
        deadline,
        deviation: delay,
        goldDeadline: productionEndPlan,
      },
      problems: {
        reason: delay != null && delay > 0 ? `Срыв срока готовности: ${delay} дн` : undefined,
      },
      sources: {
        ...(deadline ? { deadline: erpSource('Дедлайн из ERP-выгрузки', deadline) } : {}),
        ...(productionEndPlan ? { 'production.productionEndPlan': erpSource('Дата окончания производства (Расчетная)', productionEndPlan) } : {}),
        ...(productionEndFact ? { 'production.productionEndFact': erpSource('Фактическая дата готовности', productionEndFact) } : {}),
        ...(deliveryDate ? { 'logistics.deliveryDate': erpSource('Плановая дата поступления в МСК', deliveryDate) } : {}),
        ...(shipmentDate ? { 'logistics.shipmentDate': erpSource('Фактическая дата отгрузки', shipmentDate) } : {}),
      },
      missingFields,
      conflicts: [],
      trustLevel,
    };
    if (sourceDate) {
      item.sources.nomenclature = erpSource('Номенклатура из ERP-выгрузки', sourceDate);
    }
    erpItems.push(item);

    if (!supplierOrderNumber) continue;
    const existing = orders.get(supplierOrderNumber);
    if (existing) {
      existing.itemIds.push(id);
      if (!existing.deadline || (deadline && deadline > existing.deadline)) {
        existing.deadline = deadline;
      }
      if (!existing.productionPlan && productionEndPlan) {
        existing.productionPlan = productionEndPlan;
      }
      if (client) {
        existing.client = mergeUniqueLabel(existing.client, client);
      }
      continue;
    }
    orders.set(supplierOrderNumber, {
      id: supplierOrderNumber,
      supplierOrderNumber,
      supplier: supplier || 'Не указан',
      client: client || undefined,
      status,
      createdAt: clientOrderCreatedAt ?? productionEndPlan ?? deadline ?? options.today ?? '2026-08-17',
      currentStage: currentStageLabel(status, rawStatus),
      productionPlan: productionEndPlan,
      deadline,
      itemIds: [id],
    });
  }

  const supplierOrders: SupplierOrder[] = [...orders.values()].map((order) => {
    const items = erpItems.filter((item) => order.itemIds.includes(item.id));
    const { itemIds: _itemIds, ...rest } = order;
    return {
      ...rest,
      status: deriveOrderStatus(items),
      currentStage: items[0]?.currentStage,
    };
  });

  const integrations: IntegrationStatus[] = [
    {
      id: 'erp-export',
      label: 'ERP выгрузка',
      status: 'connected',
      message: 'Локальный файл супер вип.xlsx',
      lastSyncAt: options.lastSyncAt ?? options.today ?? null,
    },
  ];

  return {
    erpItems,
    supplierOrders,
    lastSyncAt: options.lastSyncAt ?? (options.today ? `${options.today}T12:00:00.000Z` : new Date().toISOString()),
    integrations,
  };
}

