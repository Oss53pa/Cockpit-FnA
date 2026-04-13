import { ReactNode } from 'react';
import clsx from 'clsx';

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

export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  return <span className={clsx('badge', styles[variant])}>{children}</span>;
}
