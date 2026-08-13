/* ===== Core domain types ===== */

export type SupplierOrderStatus =
  | 'согласование'
  | 'ожидаем_клиента'
  | 'заказ_размещён'
  | 'в_производстве'
  | 'производство_просрочено'
  | 'готово'
  | 'ожидает_отгрузки'
  | 'в_доставке'
  | 'доставлено'
  | 'требует_данных';

export type ErpStatus =
  | 'согласование'
  | 'ожидаем_клиента'
  | 'заказ_размещён'
  | 'в_производстве'
  | 'производство_просрочено'
  | 'готово'
  | 'ожидает_отгрузки'
  | 'в_доставке'
  | 'доставлено'
  | 'требует_данных';

export type DataSourceType = 'erp' | 'email' | 'calculation' | 'manual';

export type TrustLevel = 'confirmed' | 'needs_review' | 'conflict';

export interface DataSourceInfo {
  type: DataSourceType;
  label: string;
  details: string;
  date?: string;
  emailSubject?: string;
  emailFrom?: string;
  foundText?: string;
  entityName?: string;
  recordId?: string;
  updatedAt?: string;
}

export interface DataConflict {
  field: string;
  values: { value: string; source: DataSourceInfo }[];
  selectedValue: string;
}

export interface ErpItem {
  id: string;
  erpCode: string;
  supplierOrderId: string | null;
  nomenclature: string;
  status: ErpStatus;
  currentStage: string;
  comment?: string;

  /* Согласование */
  agreement: {
    fileAgreementDeadline?: string;
    factoryQuestionsDate?: string;
    clientAnswersDate?: string;
    daysWaitingClient?: number;
  };

  /* Производство */
  production: {
    invoiceDeadline?: string;
    orderStartDate?: string;
    productionStartDate?: string;
    productionEndGoldPlan?: string;
    productionEndPlan?: string;
    productionEndFact?: string;
    factProductionDays?: number;
    supplierDelay?: number;
    readyForShipment?: boolean;
  };

  /* Логистика */
  logistics: {
    shipmentDeadline?: string;
    deliveryNumber?: string;
    shipmentDate?: string;
    deliveryDate?: string;
    deliveryDays?: number;
    deliveryMethodDeadline?: string;
  };

  /* Дедлайны */
  deadlines: {
    deadline?: string;
    deviation?: number;
    goldDeadline?: string;
    goldDeviation?: number;
  };

  /* Проблемы */
  problems: {
    reason?: string;
    blocker?: string;
    responsible?: string;
    comment?: string;
  };

  /* Мета */
  sources: Record<string, DataSourceInfo>;
  missingFields: string[];
  conflicts: DataConflict[];
  trustLevel: TrustLevel;
}

export interface SupplierOrder {
  id: string;
  supplierOrderNumber: string;
  supplier: string;
  status: SupplierOrderStatus;
  createdAt: string;
  currentStage?: string;
  productionPlan?: string;
  deadline?: string;
  relatedErpIds: string[];
}

export type PageView =
  | 'orders'
  | 'attention'
  | 'unlinked'
  | 'sources'
  | 'erp-detail'
  | 'supplier-order-detail';

export interface AppState {
  currentPage: PageView;
  selectedErpId: string | null;
  selectedSupplierOrderId: string | null;
  searchQuery: string;
  activeFilter: string;
  supplierFilter: string;
  statusFilter: string;
  expandedGroups: Set<string>;
  /* Navigation */
  navigateTo: (page: PageView, params?: { erpId?: string; supplierOrderId?: string }) => void;
  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  setSupplierFilter: (f: string) => void;
  setStatusFilter: (f: string) => void;
  toggleGroup: (id: string) => void;
  /* Data mutations */
  linkErpToSupplier: (erpId: string, supplierOrderId: string) => void;
  updateErpField: (erpId: string, field: string, value: any) => void;
  resolveConflict: (erpId: string, field: string, selectedValue: string) => void;
  confirmValue: (erpId: string, field: string) => void;
  /* Derived */
  filteredErpItems: () => ErpItem[];
  filteredSupplierOrders: () => SupplierOrder[];
}