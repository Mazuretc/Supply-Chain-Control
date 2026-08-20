export type OrderStatus =
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
  client?: string;
  status: OrderStatus;
  currentStage: string;
  comment?: string;
  agreement: {
    fileAgreementDeadline?: string;
    factoryQuestionsDate?: string;
    clientAnswersDate?: string;
    daysWaitingClient?: number;
  };
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
  logistics: {
    shipmentDeadline?: string;
    deliveryNumber?: string;
    shipmentDate?: string;
    deliveryDate?: string;
    deliveryDays?: number;
    deliveryMethodDeadline?: string;
  };
  deadlines: {
    deadline?: string;
    deviation?: number;
    goldDeadline?: string;
    goldDeviation?: number;
  };
  problems: {
    reason?: string;
    blocker?: string;
    responsible?: string;
    comment?: string;
  };
  sources: Record<string, DataSourceInfo>;
  missingFields: string[];
  conflicts: DataConflict[];
  trustLevel: TrustLevel;
}

export interface SupplierOrder {
  id: string;
  supplierOrderNumber: string;
  supplier: string;
  client?: string;
  status: OrderStatus;
  createdAt: string;
  currentStage?: string;
  productionPlan?: string;
  deadline?: string;
}

export type PageView =
  | 'orders'
  | 'attention'
  | 'unlinked'
  | 'sources'
  | 'erp-detail'
  | 'supplier-order-detail';
