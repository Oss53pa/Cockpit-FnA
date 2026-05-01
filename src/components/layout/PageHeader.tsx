import { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-primary-200/60 dark:border-primary-800 print:hidden">
      <div>
        <h1 className="text-lg font-bold text-primary-900 dark:text-primary-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-primary-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
