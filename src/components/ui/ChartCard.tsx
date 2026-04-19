import { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Affiche une barre d'accent au-dessus du titre (4px, couleur de la palette) */
  accent?: string;
};

/**
 * Chart card premium — design last-generation :
 * - Barre d'accent verticale optionnelle sur la gauche
 * - Header distinct du corps avec fine séparation
 * - Hover subtil
 * - Padding aéré pour les graphiques Recharts/Echarts
 */
export function ChartCard({ title, subtitle, action, children, className = '', accent }: Props) {
  return (
    <div
      className={`group relative card overflow-hidden transition-all hover:shadow-md duration-200 ${className}`}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] opacity-80"
          style={{ background: accent }}
        />
      )}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-primary-200/50 dark:border-primary-800/60">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary-900 dark:text-primary-50 tracking-tight">{title}</p>
          {subtitle && <p className="text-[11px] text-primary-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
