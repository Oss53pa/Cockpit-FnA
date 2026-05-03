import { ArrowDownRight, ArrowUpRight, Minus, LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { fmtMoney, fmtPct } from '../../lib/format';

type Tone = 'orange' | 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'neutral';

type Props = {
  label: string;
  value: number;
  previous?: number;
  trend?: number[];
  currency?: string;
  format?: 'money' | 'number' | 'percent' | 'days';
  inverse?: boolean;
  /** Tonalité sémantique — détermine la couleur de l'icône et du sparkline */
  tone?: Tone;
  /** Icône principale (lucide ou custom) */
  icon?: LucideIcon;
  subtitle?: string;
  onClick?: () => void;
};

const TONES: Record<Tone, { bg: string; icon: string; spark: string; sparkFill: string }> = {
  orange:  { bg: 'bg-orange-100/80',   icon: 'text-orange-600',   spark: '#EA580C', sparkFill: 'rgba(234, 88, 12, 0.15)' },
  red:     { bg: 'bg-red-100/80',      icon: 'text-red-600',      spark: '#DC2626', sparkFill: 'rgba(220, 38, 38, 0.15)' },
  amber:   { bg: 'bg-amber-100/80',    icon: 'text-amber-600',    spark: '#D97706', sparkFill: 'rgba(217, 119, 6, 0.15)' },
  green:   { bg: 'bg-emerald-100/80',  icon: 'text-emerald-600',  spark: '#059669', sparkFill: 'rgba(5, 150, 105, 0.15)' },
  blue:    { bg: 'bg-blue-100/80',     icon: 'text-blue-600',     spark: '#2563EB', sparkFill: 'rgba(37, 99, 235, 0.15)' },
  violet:  { bg: 'bg-violet-100/80',   icon: 'text-violet-600',   spark: '#7C3AED', sparkFill: 'rgba(124, 58, 237, 0.15)' },
  neutral: { bg: 'bg-primary-200/60',  icon: 'text-primary-700',  spark: '#7A776E', sparkFill: 'rgba(122, 119, 110, 0.15)' },
};

/**
 * KpiCockpit — KPI card niveau Cockpit CR.
 *
 * Pattern visuel :
 *  [icone colorée]  LABEL UPPERCASE              ↗ +X.X%
 *                   VALEUR ÉNORME
 *                   subtitle gris
 *                   ───sparkline avec gradient───
 */
export function KpiCockpit({
  label, value, previous, trend, currency = 'XOF',
  format = 'money', inverse = false, tone = 'neutral', icon: Icon, subtitle, onClick,
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

  const t = TONES[tone];

  return (
    <div
      className={clsx(
        'card p-5 relative overflow-hidden',
        onClick && 'lift-hover cursor-pointer',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', t.bg)}>
              <Icon className={clsx('w-4 h-4', t.icon)} strokeWidth={2} />
            </div>
          )}
          <p className="kpi-label truncate">{label}</p>
        </div>
        {variation !== null && (
          <div className={clsx('flex items-center gap-0.5 text-xs shrink-0', trendClass)}>
            <Arrow className="w-3.5 h-3.5" />
            <span className="num">{fmtPct(variation, 1)}</span>
          </div>
        )}
      </div>
      <p className="kpi-value text-3xl text-primary-900 dark:text-primary-50 mb-1.5">
        {display()}
      </p>
      {subtitle && (
        <p className="text-[11px] text-primary-500 dark:text-primary-400 leading-relaxed">{subtitle}</p>
      )}
      {trend && trend.length > 1 && (
        <div className="-mx-5 -mb-5 mt-3">
          <SparklineGradient data={trend} color={t.spark} fill={t.sparkFill} height={48} />
        </div>
      )}
    </div>
  );
}

/** Sparkline avec gradient de remplissage — signature visuelle Cockpit CR */
function SparklineGradient({ data, color, fill, height = 48 }: { data: number[]; color: string; fill: string; height?: number }) {
  if (!data || data.length < 2) return null;
  const w = 200;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const id = `spark-${color.replace('#', '')}`;

  // Smoothed curve via cubic Bezier (catmull-rom approximation)
  const points = data.map((v, i) => ({
    x: i * stepX,
    y: h - 4 - ((v - min) / range) * (h - 8),
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cp1x = p0.x + stepX * 0.4;
    const cp2x = p1.x - stepX * 0.4;
    path += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
