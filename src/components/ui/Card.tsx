import { ReactNode } from 'react';
import clsx from 'clsx';

type Props = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function Card({ title, subtitle, action, children, className, padded = true }: Props) {
  return (
    <div className={clsx('card', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between border-b border-primary-200 dark:border-primary-800 px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-primary-900 dark:text-primary-100">{title}</h3>}
            {subtitle && <p className="text-xs text-primary-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
