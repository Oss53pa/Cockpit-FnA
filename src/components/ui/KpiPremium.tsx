import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import clsx from 'clsx';
import { fmtMoney, fmtPct } from '../../lib/format';
import { Sparkline } from './Sparkline';

type Props = {
  label: string;
  value: number;
  previous?: number;
  trend?: number[];
  currency?: string;
  format?: 'money' | 'number' | 'percent' | 'days';
  inverse?: boolean;
  accent?: 'default' | 'success' | 'warning' | 'error' | 'info';
  subtitle?: string;
};

const accents = {
  default: { ring: 'from-primary-900 to-primary-700 dark:from-primary-100 dark:to-primary-300', color: '#171717' },
  success: { ring: 'from-success to-success/60', color: '#22c55e' },
  warning: { ring: 'from-warning to-warning/60', color: '#f59e0b' },
  error:   { ring: 'from-error to-error/60', color: '#ef4444' },
  info:    { ring: 'from-info to-info/60', color: '#3b82f6' },
};

export function KpiPremium({ label, value, previous, trend, currency = 'XOF', format = 'money', inverse = false, accent = 'default', subtitle }: Props) {
  const variation = previous && previous !== 0 ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const positive = inverse ? (variation ?? 0) < 0 : (variation ?? 0) > 0;
  const Arrow = variation === null || Math.abs(variation) < 0.1 ? Minus : (variation > 0 ? ArrowUpRight : ArrowDownRight);
  const trendColor = variation === null ? 'text-primary-500' : positive ? 'text-success' : 'text-error';

  const display = () => {
    if (format === 'money') return fmtMoney(value, currency);
    if (format === 'percent') return `${value.toFixed(1)} %`;
    if (format === 'days') return `${Math.round(value)} j`;
    return new Intl.NumberFormat('fr-FR').format(value);
  };

  const a = accents[accent];

  return (
    <div className="relative card overflow-hidden group">
      <div className={clsx('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-80', a.ring)} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold truncate">{label}</p>
            {subtitle && <p className="text-[10px] text-primary-400 mt-0.5">{subtitle}</p>}
          </div>
          {variation !== null && (
            <div className={clsx('flex items-center gap-0.5 text-xs font-semibold shrink-0', trendColor)}>
              <Arrow className="w-3.5 h-3.5" />
              <span className="num">{fmtPct(variation, 0)}</span>
            </div>
          )}
        </div>
        <p className="num text-2xl font-bold text-primary-900 dark:text-primary-100 leading-tight">
          {display()}
        </p>
        {trend && trend.length > 1 && (
          <div className="-mx-1 mt-2 opacity-90">
            <Sparkline data={trend} color={a.color} height={36} />
          </div>
        )}
      </div>
    </div>
  );
}
