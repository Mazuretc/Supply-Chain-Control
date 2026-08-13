import { useState } from 'react';
import { DataSourceInfo, ErpItem, ErpStatus } from '../lib/types';
import { useStore } from '../lib/store';

/* ===== Status badge ===== */
const statusStyles: Record<string, string> = {
  согласование: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  ожидаем_клиента: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  заказ_размещён: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  в_производстве: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  производство_просрочено: 'bg-red-50 text-red-700 ring-red-600/20',
  готово: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ожидает_отгрузки: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  в_доставке: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  доставлено: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  требует_данных: 'bg-gray-100 text-gray-600 ring-gray-400/20',
};

const statusLabels: Record<string, string> = {
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

export function StatusBadge({ status }: { status: ErpStatus }) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-600 ring-gray-400/20';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${style}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

/* ===== Date formatting ===== */
export function formatDate(d?: string): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function formatDeviation(dev?: number): string | null {
  if (dev === undefined || dev === null) return null;
  if (dev === 0) return '0 дн';
  return `${dev > 0 ? '+' : ''}${dev} дн`;
}

/* ===== Plan vs fact cell ===== */
export function PlanFactCell({ plan, fact }: { plan?: string; fact?: string }) {
  const hasPlan = !!plan;
  const hasFact = !!fact;
  if (!hasPlan && !hasFact) {
    return <span className="text-xs text-gray-400 italic">Не найдено</span>;
  }
  return (
    <div className="space-y-0.5">
      {hasPlan && (
        <div className="text-xs text-gray-600">
          <span className="text-gray-400">План: </span>
          {formatDate(plan)}
        </div>
      )}
      {hasFact && (
        <div className="text-xs font-medium text-gray-800">
          <span className="text-gray-400">Факт: </span>
          {formatDate(fact)}
        </div>
      )}
      {!hasFact && hasPlan && <span className="text-[10px] text-gray-400">нет факта</span>}
    </div>
  );
}

/* ===== SourceIndicator ===== */
const sourceColors: Record<string, string> = {
  erp: 'bg-indigo-50 text-indigo-600 ring-indigo-600/20',
  email: 'bg-emerald-50 text-emerald-600 ring-emerald-600/20',
  calculation: 'bg-sky-50 text-sky-600 ring-sky-600/20',
  manual: 'bg-gray-100 text-gray-600 ring-gray-400/20',
};

export function SourceBadge({ source }: { source?: DataSourceInfo }) {
  if (!source) return null;
  const color = sourceColors[source.type] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 ring-inset ${color}`}>
      {source.label}
    </span>
  );
}

export function SourcePopover({ field, item }: { field: string; item: ErpItem }) {
  const [open, setOpen] = useState(false);
  const source = item.sources[field];
  if (!source) return null;

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center gap-1"
      >
        <SourceBadge source={source} />
      </button>
      {open && <SourceInfoCard source={source} onClose={() => setOpen(false)} />}
    </span>
  );
}

export function SourceInfoCard({ source, onClose }: { source: DataSourceInfo; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-xs">
        <div className="font-semibold text-gray-800 mb-2">Источник: {source.label}</div>
        {source.emailSubject && <div className="mb-1 text-gray-600"><span className="text-gray-400">Тема: </span>{source.emailSubject}</div>}
        {source.emailFrom && <div className="mb-1 text-gray-600"><span className="text-gray-400">От: </span>{source.emailFrom}</div>}
        {source.date && <div className="mb-1 text-gray-600"><span className="text-gray-400">Дата: </span>{formatDate(source.date)}</div>}
        {source.foundText && <div className="mb-2 text-gray-600"><span className="text-gray-400">Найдено: </span><span className="italic">«{source.foundText}»</span></div>}
        {source.entityName && <div className="mb-1 text-gray-600"><span className="text-gray-400">Сущность: </span>{source.entityName}</div>}
        {source.recordId && <div className="mb-1 text-gray-600"><span className="text-gray-400">ID: </span>{source.recordId}</div>}
        {source.updatedAt && <div className="mb-1 text-gray-600"><span className="text-gray-400">Обновлено: </span>{formatDate(source.updatedAt)}</div>}
        {source.details && <div className="mb-2 text-gray-500">{source.details}</div>}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-block mt-1 px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100"
        >
          Открыть источник
        </a>
      </div>
    </>
  );
}

/* ===== Missing data indicator ===== */
export function MissingData({ field }: { field: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeWidth={2} d="M12 9v3m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
      Не найдено
    </span>
  );
}

/* ===== Trust indicator ===== */
export function TrustIndicator({ item }: { item: ErpItem }) {
  if (item.trustLevel === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.9 5h13.8a2 2 0 001.4-3.4L13.4 4.6a2 2 0 00-2.8 0L3.7 16.6a2 2 0 001.4 3.4z" />
        </svg>
        Конфликт данных
      </span>
    );
  }
  if (item.trustLevel === 'needs_review') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.9 5h13.8a2 2 0 001.4-3.4L13.4 4.6a2 2 0 00-2.8 0L3.7 16.6a2 2 0 001.4 3.4z" />
        </svg>
        ⚠ Требует проверки
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      Подтверждено
    </span>
  );
}

/* ===== Editable date field ===== */
export function EditableField({
  value,
  onChange,
  missing,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  missing?: boolean;
  placeholder?: string;
}) {
  if (value) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-auto"
      />
    );
  }
  if (missing) {
    return (
      <button
        onClick={() => onChange('')}
        className="text-[11px] text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeWidth={2} d="M12 9v3m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
        </svg>
        {placeholder ?? 'Требует заполнения'}
      </button>
    );
  }
  return <span className="text-xs text-gray-400">—</span>;
}