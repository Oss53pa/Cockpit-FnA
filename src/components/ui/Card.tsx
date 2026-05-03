import { ReactNode } from 'react';
import clsx from 'clsx';

type Props = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /**
   * - default  : surface blanche + ombre carte (usage standard)
   * - ghost    : transparent + bordure subtile (groupements visuels)
   * - hero     : carte sombre highlight (KPI principal, CTA)
   * - elevated : surface élevée (8px shadow + 1px ring) — blocs prioritaires
   * - accent   : bordure gauche accent (alertes, highlights informatifs)
   */
  variant?: 'default' | 'ghost' | 'hero' | 'elevated' | 'accent';
  /** Effet hover lift premium (Linear/Vercel). Implique cliquable. */
  hoverable?: boolean;
  /** Icône facultative à gauche du titre (apporte contexte visuel) */
  icon?: ReactNode;
};

/**
 * Card premium — niveau Cockpit CR / Linear / Stripe Dashboard.
 *
 * Sans casser l'API existante — nouveaux variants opt-in :
 *   <Card variant="elevated" hoverable icon={<Activity />}>...
 */
export function Card({
  title, subtitle, action, children, className,
  padded = true, variant = 'default', hoverable = false, icon,
}: Props) {
  const base =
    variant === 'hero'     ? 'card-hero' :
    variant === 'ghost'    ? 'card-ghost' :
    variant === 'elevated' ? 'card-elevated' :
    variant === 'accent'   ? 'card border-l-2 border-l-accent' :
                             'card';

  const isHero = variant === 'hero';

  return (
    <div className={clsx(base, hoverable && 'lift-hover cursor-pointer', className)}>
      {(title || action) && (
        <div className={clsx(
          'flex items-start justify-between gap-3 px-5 pt-4 pb-3',
          isHero ? 'border-b border-white/10' : 'border-b border-primary-200/50 dark:border-primary-800/50',
        )}>
          <div className="min-w-0 flex items-start gap-2.5">
            {icon && (
              <div className={clsx(
                'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                isHero ? 'bg-white/10 text-primary-50' : 'bg-accent/10 text-accent',
              )}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className={clsx(
                  'text-sm font-semibold tracking-tight',
                  isHero ? 'text-primary-50' : 'text-primary-900 dark:text-primary-50',
                )}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className={clsx(
                  'text-xs mt-0.5 leading-relaxed',
                  isHero ? 'text-primary-300' : 'text-primary-500',
                )}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
