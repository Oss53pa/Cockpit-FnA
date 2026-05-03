import { ReactNode } from 'react';
import clsx from 'clsx';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Couleur de l'indicateur a gauche du titre (point) */
  accent?: string;
  /** Métric affichée en haut-droite (ex: total, variation N-1) */
  metric?: { value: string; trend?: 'up' | 'down' | 'flat' };
  /** Variante : 'default' | 'flat' (sans border ni shadow, pour intégration en grid) */
  variant?: 'default' | 'flat';
};

/**
 * ChartCard premium — niveau Stripe Dashboard / Linear Insights.
 *
 * - Header avec dot accent + titre + métric inline (top-right)
 * - Hover lift subtil
 * - Body padding ajusté pour les graphiques (proches du bord pour donner de l'air)
 * - Variante flat pour intégrations dans des grids denses
 */
export function ChartCard({ title, subtitle, action, children, className = '', accent, metric, variant = 'default' }: Props) {
  const trendColor = metric?.trend === 'up' ? 'text-success' : metric?.trend === 'down' ? 'text-error' : 'text-primary-500';

  return (
    <div className={clsx(
      'group transition-all duration-200',
      variant === 'flat' ? 'card-ghost' : 'card-hover',
      className,
    )}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex items-center gap-2.5">
          {accent && (
            <span
              aria-hidden
              className="w-2 h-2 rounded-full shrink-0 mt-1"
              style={{ background: accent, boxShadow: `0 0 0 3px ${accent}20` }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-tight">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-primary-500 dark:text-primary-400 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {metric && (
            <div className="text-right">
              <p className={clsx('text-sm font-semibold tabular-nums tracking-tight', trendColor)}>
                {metric.value}
              </p>
            </div>
          )}
          {action && <div>{action}</div>}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}
