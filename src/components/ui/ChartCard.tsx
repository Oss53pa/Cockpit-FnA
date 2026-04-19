import { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: string;
};

/**
 * Chart card compact & premium.
 */
export function ChartCard({ title, subtitle, action, children, className = '', accent }: Props) {
  return (
    <div className={`group relative card overflow-hidden transition-all hover:shadow-md duration-200 ${className}`}>
      {accent && (
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] opacity-80" style={{ background: accent }} />
      )}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-primary-200/40 dark:border-primary-800/50">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-primary-900 dark:text-primary-50 tracking-tight leading-tight">{title}</p>
          {subtitle && <p className="text-[10px] text-primary-500 mt-0.5 leading-tight">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
