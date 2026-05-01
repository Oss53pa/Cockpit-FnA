import { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

type Props = {
  title: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  color?: string;
  variation?: number;
  vsLabel?: string;
  subValue?: string;
  /** Si true, une variation NEGATIVE est consideree comme une BONNE nouvelle */
  inverse?: boolean;
  /** Variant : 'default' (carte blanche) | 'hero' (carte sombre highlight) */
  variant?: 'default' | 'hero';
};

/**
 * KPI card premium — niveau international (Stripe / Linear).
 * Hierarchie typographique stricte, micro-interactions au hover.
 *
 * - 'default' : carte blanche, icone teintee, hover lift subtil
 * - 'hero'    : carte sombre, fond gradient, icone blanche (1 KPI principal)
 */
export function KPICard({
  title, value, unit, icon, variation, vsLabel = 'vs N-1',
  subValue, inverse = false, color, variant = 'default',
}: Props) {
  const hasVar = variation !== undefined && !Number.isNaN(variation);
  const isUp = hasVar && variation! > 0.05;
  const isDown = hasVar && variation! < -0.05;
  const isFlat = hasVar && !isUp && !isDown;
  const isGood = hasVar && (inverse ? isDown : isUp);
  const isBad = hasVar && (inverse ? isUp : isDown);

  const isHero = variant === 'hero';

  return (
    <div
      className={clsx(
        'group relative p-5 flex flex-col min-w-0 overflow-hidden',
        'transition-all duration-200 ease-spring',
        isHero
          ? 'card-hero hover:shadow-lg'
          : 'card hover:shadow-card-hover hover:-translate-y-px',
      )}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={clsx(
            'text-[11px] uppercase tracking-[0.08em] font-medium leading-tight',
            isHero ? 'text-primary-300' : 'text-primary-500',
          )}>
            {title}
          </p>
          <p className={clsx(
            'num text-[28px] leading-none font-semibold mt-2.5 tracking-tight tabular-nums break-all',
            isHero ? 'text-primary-50' : 'text-primary-900 dark:text-primary-50',
          )}>
            {value}
            {unit && (
              <span className={clsx(
                'text-sm font-normal ml-1 tracking-normal',
                isHero ? 'text-primary-400' : 'text-primary-400',
              )}>
                {unit}
              </span>
            )}
          </p>
          {subValue && (
            <p className={clsx(
              'text-xs mt-1.5 leading-tight',
              isHero ? 'text-primary-400' : 'text-primary-500',
            )}>
              {subValue}
            </p>
          )}
        </div>

        {/* Icone : pastille teintee (default) ou translucide (hero) */}
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0',
            'transition-transform duration-200 group-hover:scale-105',
            isHero ? 'bg-white/10 text-primary-50 backdrop-blur-sm' : 'text-white',
          )}
          style={!isHero ? { background: color ?? 'rgb(var(--accent))' } : undefined}
        >
          {icon}
        </div>
      </div>

      {hasVar && (
        <div className={clsx(
          'flex items-center gap-2 mt-4 pt-3 border-t',
          isHero ? 'border-white/10' : 'border-primary-200/50 dark:border-primary-800/50',
        )}>
          <span className={clsx(
            'inline-flex items-center gap-1 num text-xs font-semibold px-2 py-0.5 rounded-md tabular-nums',
            isGood && 'bg-success/15 text-success',
            isBad && 'bg-error/15 text-error',
            isFlat && (isHero ? 'bg-white/10 text-primary-300' : 'bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-300'),
          )}>
            {isUp && <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />}
            {isDown && <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />}
            {isFlat && <Minus className="w-3 h-3" strokeWidth={2.5} />}
            {Math.abs(variation!).toFixed(1)} %
          </span>
          <span className={clsx('text-[11px]', isHero ? 'text-primary-400' : 'text-primary-500')}>
            {vsLabel}
          </span>
        </div>
      )}
    </div>
  );
}
