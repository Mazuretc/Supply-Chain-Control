import { ErpItem } from '../lib/types';
import { formatDate, SourcePopover } from './ui';

interface TimelineStage {
  label: string;
  plan?: string;
  fact?: string;
  status: 'done' | 'in_progress' | 'pending' | 'missing' | 'overdue';
  fieldKey: string;
}

function buildTimeline(item: ErpItem): TimelineStage[] {
  return [
    {
      label: 'Заказ поставщику',
      plan: item.production.orderStartDate,
      fact: item.production.orderStartDate,
      status: item.production.orderStartDate ? 'done' : 'missing',
      fieldKey: 'production.orderStartDate',
    },
    {
      label: 'Рабочий файл',
      plan: item.agreement.fileAgreementDeadline,
      fact: item.agreement.clientAnswersDate,
      status: item.agreement.clientAnswersDate
        ? 'done'
        : item.agreement.fileAgreementDeadline
        ? 'in_progress'
        : 'missing',
      fieldKey: 'agreement.clientAnswersDate',
    },
    {
      label: 'Вопросы завода',
      plan: item.agreement.factoryQuestionsDate,
      fact: item.agreement.factoryQuestionsDate,
      status: item.agreement.factoryQuestionsDate ? 'done' : 'missing',
      fieldKey: 'agreement.factoryQuestionsDate',
    },
    {
      label: 'Согласование',
      plan: item.agreement.fileAgreementDeadline,
      fact: item.agreement.clientAnswersDate,
      status: item.agreement.clientAnswersDate
        ? 'done'
        : item.status === 'ожидаем_клиента'
        ? 'in_progress'
        : 'pending',
      fieldKey: 'agreement.clientAnswersDate',
    },
    {
      label: 'Запуск производства',
      plan: item.production.productionStartDate,
      fact: item.production.productionStartDate,
      status: item.production.productionStartDate ? 'done' : 'pending',
      fieldKey: 'production.productionStartDate',
    },
    {
      label: 'Окончание производства',
      plan: item.production.productionEndPlan,
      fact: item.production.productionEndFact,
      status: item.production.productionEndFact
        ? 'done'
        : item.status === 'производство_просрочено'
        ? 'overdue'
        : item.production.productionEndPlan
        ? 'in_progress'
        : 'missing',
      fieldKey: 'production.productionEndFact',
    },
    {
      label: 'Готовность',
      plan: item.production.productionEndPlan,
      fact: item.production.readyForShipment
        ? item.logistics.shipmentDate || 'Готов'
        : undefined,
      status: item.production.readyForShipment ? 'done' : 'pending',
      fieldKey: 'production.readyForShipment',
    },
    {
      label: 'Фактическая дата отгрузки',
      plan: item.logistics.shipmentDeadline,
      fact: item.logistics.shipmentDate,
      status: item.logistics.shipmentDate
        ? 'done'
        : item.logistics.shipmentDeadline
        ? 'pending'
        : 'missing',
      fieldKey: 'logistics.shipmentDate',
    },
    {
      label: 'Доставка на склад',
      plan: item.logistics.deliveryMethodDeadline,
      fact: item.logistics.deliveryDate,
      status: item.logistics.deliveryDate ? 'done' : item.logistics.deliveryMethodDeadline ? 'pending' : 'missing',
      fieldKey: 'logistics.deliveryDate',
    },
  ];
}

function stageDotClass(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500 ring-emerald-200';
    case 'in_progress':
      return 'bg-amber-400 ring-amber-200';
    case 'overdue':
      return 'bg-red-500 ring-red-200';
    case 'missing':
      return 'bg-gray-300 ring-gray-200';
    default:
      return 'bg-gray-300 ring-gray-200';
  }
}

function stageLineClass(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-400';
    case 'in_progress':
      return 'bg-amber-300';
    case 'overdue':
      return 'bg-red-400';
    default:
      return 'bg-gray-200';
  }
}

export default function Timeline({ item }: { item: ErpItem }) {
  const stages = buildTimeline(item);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Timeline</h3>

      <div className="md:hidden space-y-3">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          return (
            <div key={stage.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ring-2 shrink-0 ${stageDotClass(stage.status)}`} />
                {!isLast && <div className={`w-0.5 flex-1 mt-1 ${stageLineClass(stage.status)}`} />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="text-[11px] font-medium text-gray-600">{stage.label}</div>
                {stage.fact ? (
                  <div className="text-[11px] font-medium text-gray-800 flex flex-wrap items-center gap-1 mt-0.5">
                    {formatDate(stage.fact)}
                    <SourcePopover field={stage.fieldKey} item={item} />
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-0.5">
                    {stage.plan ? (
                      <div className="text-[11px] text-gray-500">План: {formatDate(stage.plan)}</div>
                    ) : (
                      <div className="text-[10px] text-gray-400 italic">Нет данных</div>
                    )}
                    <div className="text-[10px] text-amber-600">Ожидается</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <div className="flex items-start gap-0 min-w-[760px]">
          {stages.map((stage, idx) => {
            const isLast = idx === stages.length - 1;
            return (
              <div key={stage.label} className="flex-1 min-w-0">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ring-2 shrink-0 ${stageDotClass(stage.status)}`} />
                  {!isLast && <div className={`h-0.5 flex-1 ${stageLineClass(stage.status)}`} />}
                </div>
                <div className="mt-1.5 pr-2">
                  <div className="text-[10px] font-medium text-gray-600 truncate">{stage.label}</div>
                  <div className="mt-1 space-y-0.5">
                    {stage.fact ? (
                      <div className="text-[11px] font-medium text-gray-800 flex items-center gap-1">
                        {formatDate(stage.fact)}
                        <SourcePopover field={stage.fieldKey} item={item} />
                      </div>
                    ) : (
                      <>
                        {stage.plan ? (
                          <div className="text-[11px] text-gray-500">
                            План: {formatDate(stage.plan)}
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-400 italic">Нет данных</div>
                        )}
                        <div className="text-[10px] text-amber-600">Ожидается</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}