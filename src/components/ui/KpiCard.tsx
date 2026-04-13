import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import clsx from 'clsx';
import { fmtMoney, fmtPct } from '../../lib/format';

type Props = {
  label: string;
  value: number;
  budget?: number;
  n1?: number;
  currency?: string;
  inverse?: boolean;
};

export function KpiCard({ label, value, budget, n1, currency = 'XOF', inverse = false }: Props) {
  const variation = n1 ? ((value - n1) / Math.abs(n1)) * 100 : null;
  const positive = inverse ? (variation ?? 0) < 0 : (variation ?? 0) > 0;
  const Arrow = variation === null ? Minus : (variation === 0 ? Minus : variation > 0 ? ArrowUpRight : ArrowDownRight);
  const trendColor = variation === null || variation === 0 ? 'text-primary-500' : positive ? 'text-success' : 'text-error';

  const budgetGap = budget ? ((value - budget) / Math.abs(budget)) * 100 : null;

  return (
    <div className="card p-5 hover:border-primary-300 dark:hover:border-primary-700 transition">
      <p className="text-xs uppercase tracking-wider text-primary-500 font-medium">{label}</p>
      <p className="num text-2xl font-bold text-primary-900 dark:text-primary-100 mt-2">
        {fmtMoney(value, currency)}
      </p>
      <div className="mt-3 flex items-center justify-between text-xs">
        {variation !== null && (
          <div className={clsx('flex items-center gap-1 font-medium', trendColor)}>
            <Arrow className="w-3.5 h-3.5" />
            <span className="num">{fmtPct(variation)}</span>
            <span className="text-primary-400 font-normal">vs N-1</span>
          </div>
        )}
        {budgetGap !== null && (
          <span className={clsx('num font-medium', budgetGap >= 0 ? 'text-success' : 'text-warning')}>
            {fmtPct(budgetGap)} <span className="text-primary-400 font-normal">vs Bud.</span>
          </span>
        )}
      </div>
    </div>
  );
}
