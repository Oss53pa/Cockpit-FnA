import { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 dark:text-primary-100">{title}</h1>
        {subtitle && <p className="text-sm text-primary-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
