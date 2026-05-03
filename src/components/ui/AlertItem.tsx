import { AlertTriangle, AlertCircle, Info, Flame } from 'lucide-react';
import clsx from 'clsx';

type Props = { severity: 'low' | 'medium' | 'high' | 'critical'; type: string; message: string };

const ICONS = {
  low: Info,
  medium: AlertCircle,
  high: AlertTriangle,
  critical: Flame,
};

const STYLES = {
  low:      { wrap: 'hover:bg-info/5',                    icon: 'text-info',     badge: 'bg-info/10 text-info border-info/20' },
  medium:   { wrap: 'hover:bg-warning/5',                 icon: 'text-warning',  badge: 'bg-warning/10 text-warning border-warning/20' },
  high:     { wrap: 'hover:bg-error/5',                   icon: 'text-error',    badge: 'bg-error/10 text-error border-error/20' },
  critical: { wrap: 'hover:bg-severity-critical/5',       icon: 'text-severity-critical', badge: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20' },
};

/**
 * AlertItem premium — niveau Linear Issues / Vercel Notifications.
 *
 * - Icône lucide sémantique (au lieu de "!" texte)
 * - Hover state subtil par sévérité
 * - Badge type avec border (signature premium)
 * - Tracking serré sur le titre
 */
export function AlertItem({ severity, type, message }: Props) {
  const Icon = ICONS[severity];
  const s = STYLES[severity];
  return (
    <div className={clsx(
      'flex items-center gap-3 px-3 py-2.5 -mx-3 rounded-lg',
      'border-b border-primary-100/60 dark:border-primary-800/60 last:border-0',
      'transition-colors duration-150',
      s.wrap,
    )}>
      <Icon className={clsx('w-4 h-4 shrink-0', s.icon)} strokeWidth={2.2} />
      <div className="flex-1 text-[12px] text-primary-800 dark:text-primary-200 min-w-0 leading-snug">{message}</div>
      <span className={clsx('text-[10px] px-2 py-0.5 rounded-md font-semibold shrink-0 border tracking-tight', s.badge)}>
        {type}
      </span>
    </div>
  );
}
