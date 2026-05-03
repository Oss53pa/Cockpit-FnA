import { ReactNode } from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'low' | 'medium' | 'high' | 'critical' | 'accent';

// Premium : ajout d'un border subtil et d'une couleur de texte plus contrastée
const styles: Record<Variant, string> = {
  default:  'bg-primary-100 text-primary-700 border-primary-200/60 dark:bg-primary-800 dark:text-primary-300 dark:border-primary-700/60',
  success:  'bg-success/10 text-success border-success/20',
  warning:  'bg-warning/10 text-warning border-warning/20',
  error:    'bg-error/10 text-error border-error/20',
  info:     'bg-info/10 text-info border-info/20',
  accent:   'bg-accent/10 text-accent border-accent/20',
  low:      'bg-severity-low/10 text-severity-low border-severity-low/20',
  medium:   'bg-severity-medium/10 text-severity-medium border-severity-medium/20',
  high:     'bg-severity-high/10 text-severity-high border-severity-high/20',
  critical: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20',
};

const icons: Partial<Record<Variant, typeof CheckCircle2>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

/**
 * Badge premium — niveau Linear/Vercel.
 *
 * - Border subtle (semantic) en plus du fill
 * - Icône optionnelle pour clarté visuelle
 * - Tracking serré + font tabular-nums sur les chiffres
 */
export function Badge({ variant = 'default', children, showIcon = false }: { variant?: Variant; children: ReactNode; showIcon?: boolean }) {
  const Icon = showIcon ? icons[variant] : undefined;
  return (
    <span className={clsx('badge border', styles[variant])}>
      {Icon && <Icon className="w-3 h-3 shrink-0" strokeWidth={2.2} />}
      {children}
    </span>
  );
}
