import { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Couleur de l'indicateur a gauche du titre (point) */
  accent?: string;
};

/**
 * Chart card premium — header epure, sans bordure visible, hover lift subtil.
 * Indicateur de couleur sous forme de point (pas de barre verticale agressive).
 */
export function ChartCard({ title, subtitle, action, children, className = '', accent }: Props) {
  return (
    <div className={`group card hover:shadow-card-hover transition-shadow duration-200 ${className}`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex items-center gap-2.5">
          {accent && (
            <span
              aria-hidden
              className="w-2 h-2 rounded-full shrink-0 mt-1"
              style={{ background: accent }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-tight">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-primary-500 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}
