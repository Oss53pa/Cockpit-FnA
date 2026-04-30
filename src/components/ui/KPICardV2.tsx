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
  /** Si true, une variation NÉGATIVE est considérée comme une BONNE nouvelle */
  inverse?: boolean;
};

/**
 * KPI card compact & premium.
 * Padding réduit, typographie plus dense pour plus de cartes visibles par ligne.
 */
export function KPICard({ title, value, unit, icon, variation, vsLabel = 'vs N-1', subValue, inverse = false, color }: Props) {
  const hasVar = variation !== undefined && !Number.isNaN(variation);
  const isUp = hasVar && variation! > 0.05;
  const isDown = hasVar && variation! < -0.05;
  const isFlat = hasVar && !isUp && !isDown;
  const isGood = hasVar && (inverse ? isDown : isUp);
  const isBad = hasVar && (inverse ? isUp : isDown);

  return (
    <div className="group relative card p-4 flex flex-col min-w-0 overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 duration-200">
      {/* Twisty style : pas de bandeau gauche coloré (la couleur passe sur l'icône) */}

      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold leading-tight">{title}</p>
          <p className="num text-[22px] leading-none font-bold text-primary-900 dark:text-primary-50 mt-2 break-all tracking-tight">
            {value}
            {unit && <span className="text-[11px] font-normal text-primary-400 ml-1 tracking-normal">{unit}</span>}
          </p>
          {subValue && <p className="text-[10px] text-primary-500 mt-1.5 leading-tight">{subValue}</p>}
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] shrink-0 font-semibold text-white"
          style={{ background: color ?? 'rgb(var(--accent))' }}
        >
          {icon}
        </div>
      </div>

      {hasVar && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-primary-200/40 dark:border-primary-800/50">
          <span className={clsx(
            'inline-flex items-center gap-0.5 num text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
            isGood && 'bg-success/15 text-success',
            isBad && 'bg-error/15 text-error',
            isFlat && 'bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-300',
          )}>
            {isUp && <ArrowUpRight className="w-2.5 h-2.5" strokeWidth={2.5} />}
            {isDown && <ArrowDownRight className="w-2.5 h-2.5" strokeWidth={2.5} />}
            {isFlat && <Minus className="w-2.5 h-2.5" strokeWidth={2.5} />}
            {Math.abs(variation!).toFixed(1)} %
          </span>
          <span className="text-[9px] text-primary-500">{vsLabel}</span>
        </div>
      )}
    </div>
  );
}
