import { ReactNode } from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'low' | 'medium' | 'high' | 'critical';

const styles: Record<Variant, string> = {
  default: 'bg-primary-200 text-primary-700 dark:bg-primary-800 dark:text-primary-300',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
  low: 'bg-severity-low/10 text-severity-low',
  medium: 'bg-severity-medium/10 text-severity-medium',
  high: 'bg-severity-high/10 text-severity-high',
  critical: 'bg-severity-critical/10 text-severity-critical',
};

const icons: Partial<Record<Variant, typeof CheckCircle2>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

export function Badge({ variant = 'default', children, showIcon = false }: { variant?: Variant; children: ReactNode; showIcon?: boolean }) {
  const Icon = showIcon ? icons[variant] : undefined;
  return (
    <span className={clsx('badge', styles[variant])}>
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {children}
    </span>
  );
}
