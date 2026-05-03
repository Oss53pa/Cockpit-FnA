import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import clsx from 'clsx';
import { fmtMoney, fmtPct } from '../../lib/format';
import { Sparkline } from './Sparkline';
import { usePalette } from '../../store/theme';

type Props = {
  label: string;
  value: number;
  previous?: number;
  trend?: number[];
  currency?: string;
  format?: 'money' | 'number' | 'percent' | 'days';
  /** inverse=true : hausse = mauvaise (ex: BFR, dettes, charges) */
  inverse?: boolean;
  /** Accent visuel — applique uniquement à la barre supérieure */
  accent?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
  subtitle?: string;
  /** Optional click handler (rend la card cliquable) */
  onClick?: () => void;
};

// Barre supérieure : couleur sémantique cohérente avec accent prop
const accentBars: Record<NonNullable<Props['accent']>, string> = {
  default: 'bg-primary-300 dark:bg-primary-700',
  success: 'bg-success',
  warning: 'bg-warning',
  error:   'bg-error',
  info:    'bg-info',
  accent:  'bg-accent',
};

/**
 * KpiPremium — KPI card niveau Linear / Stripe Dashboard.
 *
 * - Barre supérieure colorée (sémantique : success/warning/error/info/accent)
 * - Variation N-1 avec flèche directionnelle + couleur (vert/rouge/neutre)
 * - Inversion possible (BFR : hausse = mauvaise)
 * - Sparkline optionnelle (7+ points) en bas avec couleur palette
 * - Hover lift subtil si cliquable
 * - Typo numéraire premium (kpi-value class)
 */
export function KpiPremium({
  label, value, previous, trend, currency = 'XOF',
  format = 'money', inverse = false, accent = 'default', subtitle, onClick,
}: Props) {
  const variation = previous && previous !== 0 ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const positive = inverse ? (variation ?? 0) < 0 : (variation ?? 0) > 0;
  const isFlat = variation === null || Math.abs(variation) < 0.1;
  const Arrow = isFlat ? Minus : (variation! > 0 ? ArrowUpRight : ArrowDownRight);
  const trendClass = isFlat ? 'kpi-trend-flat' : positive ? 'kpi-trend-up' : 'kpi-trend-down';

  const display = () => {
    if (format === 'money') return fmtMoney(value, currency);
    if (format === 'percent') return `${value.toFixed(1)} %`;
    if (format === 'days') return `${Math.round(value)} j`;
    return new Intl.NumberFormat('fr-FR').format(value);
  };

  const palette = usePalette();
  const bar = accentBars[accent];

  return (
    <div
      className={clsx(
        'relative card overflow-hidden group',
        onClick && 'lift-hover cursor-pointer',
      )}
      onClick={onClick}
    >
      {/* Barre supérieure colorée — signature visuelle */}
      <div className={clsx('absolute top-0 left-0 right-0 h-[2px]', bar)} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="kpi-label truncate">{label}</p>
            {subtitle && <p className="text-[10px] text-primary-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          {variation !== null && (
            <div className={clsx('flex items-center gap-0.5 text-xs shrink-0', trendClass)}>
              <Arrow className="w-3.5 h-3.5" />
              <span className="num">{fmtPct(variation, 0)}</span>
            </div>
          )}
        </div>
        <p className="kpi-value text-2xl text-primary-900 dark:text-primary-100">
          {display()}
        </p>
        {trend && trend.length > 1 && (
          <div className="-mx-1 mt-3 opacity-90">
            <Sparkline data={trend} color={palette.scale[9]} height={32} />
          </div>
        )}
      </div>
    </div>
  );
}
