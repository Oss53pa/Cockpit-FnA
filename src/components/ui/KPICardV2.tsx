import { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

type Props = {
  title: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  /** Couleur d'accent — détermine la teinte du badge icône.
   *  Hex (ex '#DA4D28') ou name ('orange', 'red', 'green', 'amber', 'blue', 'violet'). */
  color?: string;
  variation?: number;
  vsLabel?: string;
  subValue?: string;
  /** Si true, une variation NEGATIVE est consideree comme une BONNE nouvelle */
  inverse?: boolean;
  /** Variant : 'default' (carte blanche) | 'hero' (carte sombre highlight) */
  variant?: 'default' | 'hero';
  /** Sparkline trend data (12 points typique). Affichée en bas de la card avec gradient. */
  trend?: number[];
};

// Mapping color name -> classes Tailwind tinted (fond doux + icône foncée)
// Pour les hex, on calcule un fond léger et garde l'hex pour l'icône.
const TINT_MAP: Record<string, { bg: string; icon: string }> = {
  orange: { bg: 'bg-orange-100/70 dark:bg-orange-500/15',     icon: 'text-orange-600 dark:text-orange-400' },
  red:    { bg: 'bg-red-100/70 dark:bg-red-500/15',           icon: 'text-red-600 dark:text-red-400' },
  amber:  { bg: 'bg-amber-100/70 dark:bg-amber-500/15',       icon: 'text-amber-600 dark:text-amber-400' },
  green:  { bg: 'bg-emerald-100/70 dark:bg-emerald-500/15',   icon: 'text-emerald-600 dark:text-emerald-400' },
  blue:   { bg: 'bg-blue-100/70 dark:bg-blue-500/15',         icon: 'text-blue-600 dark:text-blue-400' },
  violet: { bg: 'bg-violet-100/70 dark:bg-violet-500/15',     icon: 'text-violet-600 dark:text-violet-400' },
};

/**
 * KPICard — niveau premium Cockpit CR / Stripe Dashboard.
 *
 * Pattern visuel :
 *  ┌──────────────────────────────────────┐
 *  │ [icone tintée]  LABEL UPPERCASE  ↗+X%│
 *  │                                       │
 *  │ VALEUR ÉNORME (32px tabular-nums)     │
 *  │ subValue petit gris                   │
 *  └──────────────────────────────────────┘
 */
export function KPICard({
  title, value, unit, icon, variation, vsLabel = 'vs N-1',
  subValue, inverse = false, color, variant = 'default', trend,
}: Props) {
  const hasVar = variation !== undefined && !Number.isNaN(variation);
  const isUp = hasVar && variation! > 0.05;
  const isDown = hasVar && variation! < -0.05;
  const isFlat = hasVar && !isUp && !isDown;
  const isGood = hasVar && (inverse ? isDown : isUp);
  const isBad = hasVar && (inverse ? isUp : isDown);

  const isHero = variant === 'hero';

  // Détermine le tint de l'icône
  const tint = !isHero && color && TINT_MAP[color] ? TINT_MAP[color] : null;
  const customColor = !isHero && color && !TINT_MAP[color] ? color : null;

  // Couleur du sparkline (hex pur — match avec tint si dispo)
  const SPARK_HEX: Record<string, string> = {
    orange: '#EA580C', red: '#DC2626', amber: '#D97706',
    green: '#059669', blue: '#2563EB', violet: '#7C3AED',
  };
  const sparkColor = isHero ? '#FFFFFF'
    : (color && SPARK_HEX[color]) ? SPARK_HEX[color]
    : customColor || '#DA4D28';

  return (
    <div
      className={clsx(
        'group relative flex flex-col min-w-0 overflow-hidden',
        'transition-all duration-200 ease-spring',
        isHero
          ? 'card-hero'
          : 'card-hover',
      )}
    >
    <div className={clsx('p-5 flex flex-col', trend && trend.length > 1 && 'pb-3')}>
      {/* Header : icône + label + variation top-right */}
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={clsx(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
              typeof icon === 'string' && icon.length <= 3
                ? 'text-[11px] font-bold tracking-tight'
                : 'text-base',
              isHero
                ? 'bg-white/10 text-primary-50 backdrop-blur-sm'
                : tint
                  ? clsx(tint.bg, tint.icon)
                  : '',
            )}
            style={!isHero && customColor ? {
              background: `${customColor}15`,
              color: customColor,
            } : undefined}
          >
            {icon}
          </div>
          <p className={clsx(
            'text-[10px] uppercase tracking-[0.10em] font-semibold leading-tight truncate',
            isHero ? 'text-primary-300' : 'text-primary-500',
          )}>
            {title}
          </p>
        </div>
        {hasVar && (
          <span className={clsx(
            'inline-flex items-center gap-0.5 num text-[11px] font-semibold tabular-nums shrink-0',
            isGood ? 'text-success' :
            isBad ? 'text-error' :
            (isHero ? 'text-primary-400' : 'text-primary-500'),
          )}>
            {isUp && <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {isDown && <ArrowDownRight className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {isFlat && <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {Math.abs(variation!).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Valeur — typo plus imposante (32px) avec tabular-nums et tracking serré */}
      <p className={clsx(
        'kpi-value text-[32px] leading-[1.1] tabular-nums break-all',
        isHero ? 'text-primary-50' : 'text-primary-900 dark:text-primary-50',
      )}>
        {value}
        {unit && (
          <span className={clsx(
            'text-sm font-normal ml-1.5 tracking-normal',
            isHero ? 'text-primary-400' : 'text-primary-400',
          )}>
            {unit}
          </span>
        )}
      </p>

      {/* Sub-value : précision contextuelle (budget, taux, etc.) */}
      {subValue && (
        <p className={clsx(
          'text-[11px] mt-1.5 leading-relaxed',
          isHero ? 'text-primary-400' : 'text-primary-500',
        )}>
          {subValue}
        </p>
      )}

      {/* vsLabel uniquement quand variation ET subValue absent */}
      {hasVar && !subValue && (
        <p className={clsx(
          'text-[11px] mt-1.5 leading-tight',
          isHero ? 'text-primary-400' : 'text-primary-500',
        )}>
          {vsLabel}
        </p>
      )}
    </div>

      {/* Sparkline en bas de card avec gradient — signature premium */}
      {trend && trend.length > 1 && (
        <div className="-mt-1 px-0 pb-0">
          <KPISparkline data={trend} color={sparkColor} />
        </div>
      )}
    </div>
  );
}

/** Sparkline avec gradient remplissage — niveau Cockpit CR/Stripe Dashboard */
function KPISparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 200;
  const h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const id = `kpi-spark-${color.replace('#', '')}-${Math.random().toString(36).slice(2, 7)}`;

  // Smooth curve via cubic Bezier
  const points = data.map((v, i) => ({
    x: i * stepX,
    y: h - 3 - ((v - min) / range) * (h - 6),
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    path += ` C ${p0.x + stepX * 0.4} ${p0.y}, ${p1.x - stepX * 0.4} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full block" style={{ height: h }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
