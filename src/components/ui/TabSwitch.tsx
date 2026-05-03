import clsx from 'clsx';

/**
 * TabSwitch premium — pill segmented control niveau Apple/Linear.
 *
 * - Pill conteneur avec backdrop-blur subtle
 * - Tab actif avec shadow élevée + transition spring
 * - Hover state intermédiaire
 * - Densité ajustée
 */
export function TabSwitch<T extends string>({ tabs, value, onChange, activeColor }:
  { tabs: Array<{ key: T; label: string; icon?: React.ReactNode; count?: number }>; value: T; onChange: (t: T) => void; activeColor?: string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl
                    bg-primary-100/60 dark:bg-primary-900/60
                    border border-primary-200/50 dark:border-primary-800/50
                    backdrop-blur-sm mb-4">
      {tabs.map((t) => {
        const isActive = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold',
              'transition-all duration-200 ease-spring',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-shell',
              isActive
                ? 'bg-surface dark:bg-primary-800 text-primary-900 dark:text-primary-50 shadow-sm'
                : 'text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-100 hover:bg-primary-50 dark:hover:bg-primary-800/50',
            )}
            style={isActive && activeColor ? { boxShadow: `0 1px 2px 0 rgb(0 0 0 / 0.05), 0 0 0 1px ${activeColor}40` } : undefined}
          >
            {t.icon && <span className="shrink-0 -ml-0.5">{t.icon}</span>}
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className={clsx(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold tabular-nums',
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'bg-primary-200/60 dark:bg-primary-800/60 text-primary-500',
              )}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
