import { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ChartCard({ title, subtitle, action, children, className = '' }: Props) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-primary-900 dark:text-primary-50">{title}</p>
          {subtitle && <p className="text-[11px] text-primary-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
