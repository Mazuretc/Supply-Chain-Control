export type AuthRole = 'employee' | 'admin';

const OPTIONS: Array<{ id: AuthRole; href: string; label: string }> = [
  { id: 'employee', href: '/', label: 'Обычный вход' },
  { id: 'admin', href: '/admin', label: 'Администратор' },
];

export default function AuthRoleSwitch({ value }: { value: AuthRole }) {
  return (
    <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Тип входа">
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <a
            key={option.id}
            href={option.href}
            role="tab"
            aria-selected={active}
            className={`rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${
              active
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {option.label}
          </a>
        );
      })}
    </div>
  );
}
