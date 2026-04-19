import { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

type Props = {
  title: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  color?: string;  // conservé pour compat, utilisé pour l'accent vertical de la carte
  variation?: number;
  vsLabel?: string;
  subValue?: string;
  /** Si true, une variation NÉGATIVE est considérée comme une BONNE nouvelle
   * (ex : les charges qui baissent vs N-1). */
  inverse?: boolean;
};

/**
 * KPI card premium — design last-generation :
 * - Accent vertical coloré sur la gauche (issu de la palette)
 * - Hiérarchie typo claire : label discret / valeur imposante / sous-valeur
 * - Variation colorée (vert / rouge / neutre) avec icônes fines
 * - Hover subtil (léger lift + bord d'accent plus vif)
 * - Monochrome cohérent avec le reste de l'app
 */
export function KPICard({ title, value, unit, icon, variation, vsLabel = 'vs N-1', subValue, inverse = false, color }: Props) {
  const hasVar = variation !== undefined && !Number.isNaN(variation);
  const isUp = hasVar && variation! > 0.05;
  const isDown = hasVar && variation! < -0.05;
  const isFlat = hasVar && !isUp && !isDown;
  // "Bonne" tendance : up par défaut, down quand inverse (ex : charges)
  const isGood = hasVar && (inverse ? isDown : isUp);
  const isBad = hasVar && (inverse ? isUp : isDown);

  return (
    <div
      className="group relative card p-5 flex flex-col min-w-0 overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 duration-200"
      style={color ? ({ ['--kpi-accent' as any]: color }) : undefined}
    >
      {/* Accent vertical — utilise la couleur passée en prop ou primary-900 */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ background: color ?? 'currentColor' }}
      />

      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold">{title}</p>
          <p className="num text-[26px] leading-[1.1] font-bold text-primary-900 dark:text-primary-50 mt-1.5 break-all">
            {value}
            {unit && <span className="text-[12px] font-normal text-primary-400 ml-1.5 tracking-normal">{unit}</span>}
          </p>
          {subValue && <p className="text-[11px] text-primary-500 mt-1.5">{subValue}</p>}
        </div>
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center text-[15px] shrink-0 font-semibold tracking-tight',
            'bg-gradient-to-br from-primary-200/70 to-primary-300/40 dark:from-primary-800/70 dark:to-primary-700/40',
            'text-primary-800 dark:text-primary-200 ring-1 ring-inset ring-primary-300/40 dark:ring-primary-700/40',
          )}
        >
          {icon}
        </div>
      </div>

      {hasVar && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-primary-200/50 dark:border-primary-800/60">
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 num text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
              isGood && 'bg-success/15 text-success',
              isBad && 'bg-error/15 text-error',
              isFlat && 'bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-300',
            )}
          >
            {isUp && <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />}
            {isDown && <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />}
            {isFlat && <Minus className="w-3 h-3" strokeWidth={2.5} />}
            {Math.abs(variation!).toFixed(1)} %
          </span>
          <span className="text-[10px] text-primary-500">{vsLabel}</span>
        </div>
      )}
    </div>
  );
}
