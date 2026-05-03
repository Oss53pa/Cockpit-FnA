import { ReactNode } from 'react';
import clsx from 'clsx';

type Pill = {
  label: string;
  value?: string;
  variant?: 'live' | 'default' | 'accent' | 'success' | 'warning' | 'error';
  icon?: ReactNode;
};

/**
 * PillStatus — pills de contexte horizontales, niveau Cockpit CR.
 *
 * Affiche en haut de page : "● Live · Société · EMERGENCE Plaza SA · FCFA · XOF · Période · Avril 2026"
 *
 * - Pill "live" avec dot vert pulsant (signature visuelle)
 * - Pills suivantes en mode label · value séparées par chevron subtle
 * - Couleurs sémantiques optionnelles
 */
export function PillStatus({ pills, className }: { pills: Pill[]; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5 mb-3', className)}>
      {pills.map((p, i) => {
        if (p.variant === 'live') {
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                                     bg-success/10 text-success text-[10px] font-semibold tracking-tight uppercase
                                     border border-success/20">
              <span className="dot dot-success dot-pulse" />
              {p.label}
            </span>
          );
        }
        const variantClass =
          p.variant === 'accent'  ? 'bg-accent/10 text-accent border-accent/20' :
          p.variant === 'success' ? 'bg-success/10 text-success border-success/20' :
          p.variant === 'warning' ? 'bg-warning/10 text-warning border-warning/20' :
          p.variant === 'error'   ? 'bg-error/10 text-error border-error/20' :
                                    'bg-primary-100/80 dark:bg-primary-900/60 text-primary-600 dark:text-primary-300 border-primary-200/50 dark:border-primary-800/50';
        return (
          <span key={i} className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-tight border',
            variantClass,
          )}>
            {p.icon && <span className="shrink-0 -ml-0.5 opacity-70">{p.icon}</span>}
            <span className="text-[10px] uppercase tracking-[0.06em] opacity-70">{p.label}</span>
            {p.value && (
              <>
                <span className="opacity-30">·</span>
                <span className="font-semibold">{p.value}</span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
