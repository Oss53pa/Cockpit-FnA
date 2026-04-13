import clsx from 'clsx';

export function TabSwitch<T extends string>({ tabs, value, onChange }:
  { tabs: Array<{ key: T; label: string }>; value: T; onChange: (t: T) => void; activeColor?: string }) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={clsx('px-4 py-2 rounded-lg text-xs font-semibold transition',
            value === t.key
              ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900'
              : 'bg-primary-100 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
