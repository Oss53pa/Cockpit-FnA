import { ReactNode } from 'react';
import clsx from 'clsx';

type Props = {
  title: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  color?: string;  // conservé pour compat, ignoré
  variation?: number;
  vsLabel?: string;
  subValue?: string;
  inverse?: boolean;
};

export function KPICard({ title, value, unit, icon, variation, vsLabel = 'vs N-1', subValue, inverse = false }: Props) {
  const isPos = variation === undefined ? null : inverse ? variation < 0 : variation >= 0;

  return (
    <div className="card p-5 flex flex-col min-w-0">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">{title}</p>
          <p className="num text-2xl font-bold text-primary-900 dark:text-primary-50 mt-1 leading-none">
            {value} {unit && <span className="text-[13px] font-normal text-primary-400">{unit}</span>}
          </p>
          {subValue && <p className="text-[11px] text-primary-500 mt-1">{subValue}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-300 grayscale opacity-80">
          {icon}
        </div>
      </div>
      {variation !== undefined && (
        <div className="flex items-center gap-2 mt-3">
          <span className={clsx(
            'num text-xs font-semibold px-2 py-0.5 rounded-full',
            isPos ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200' : 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200',
          )}>
            {variation >= 0 ? '↑' : '↓'} {Math.abs(variation).toFixed(1)} %
          </span>
          <span className="text-[11px] text-primary-400">{vsLabel}</span>
        </div>
      )}
    </div>
  );
}
