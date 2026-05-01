import { ReactNode } from 'react';
import clsx from 'clsx';

type Props = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** 'default' (blanche) | 'ghost' (transparent border) | 'hero' (sombre highlight) */
  variant?: 'default' | 'ghost' | 'hero';
};

/**
 * Card premium — variants international standard.
 * - default : surface blanche + ombre carte
 * - ghost   : transparent + bordure subtile (groupements)
 * - hero    : carte sombre highlight (KPI principal, CTA)
 */
export function Card({
  title, subtitle, action, children, className,
  padded = true, variant = 'default',
}: Props) {
  const base =
    variant === 'hero'  ? 'card-hero' :
    variant === 'ghost' ? 'card-ghost' :
                          'card';

  return (
    <div className={clsx(base, className)}>
      {(title || action) && (
        <div className={clsx(
          'flex items-start justify-between gap-3 px-5 pt-4 pb-3',
          variant === 'hero' ? 'border-b border-white/10' : 'border-b border-primary-200/50 dark:border-primary-800/50',
        )}>
          <div className="min-w-0">
            {title && (
              <h3 className={clsx(
                'text-sm font-semibold tracking-tight',
                variant === 'hero' ? 'text-primary-50' : 'text-primary-900 dark:text-primary-50',
              )}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className={clsx(
                'text-xs mt-1 leading-relaxed',
                variant === 'hero' ? 'text-primary-300' : 'text-primary-500',
              )}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
