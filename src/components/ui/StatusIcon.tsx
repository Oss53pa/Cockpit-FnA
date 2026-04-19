import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import clsx from 'clsx';

export type Status = 'success' | 'good' | 'ok' | 'warning' | 'warn' | 'error' | 'alert' | 'danger' | 'fail' | 'info';

const cfg: Record<string, { Icon: typeof CheckCircle2; color: string }> = {
  success: { Icon: CheckCircle2, color: 'text-success' },
  good:    { Icon: CheckCircle2, color: 'text-success' },
  ok:      { Icon: CheckCircle2, color: 'text-success' },
  warning: { Icon: AlertTriangle, color: 'text-warning' },
  warn:    { Icon: AlertTriangle, color: 'text-warning' },
  error:   { Icon: XCircle, color: 'text-error' },
  alert:   { Icon: XCircle, color: 'text-error' },
  danger:  { Icon: XCircle, color: 'text-error' },
  fail:    { Icon: XCircle, color: 'text-error' },
  info:    { Icon: Info, color: 'text-info' },
};

interface Props {
  status: Status;
  size?: number;
  className?: string;
}

export function StatusIcon({ status, size = 14, className }: Props) {
  const { Icon, color } = cfg[status] ?? cfg.info;
  return <Icon className={clsx(color, className)} style={{ width: size, height: size }} />;
}

/** Maps any status string to a Badge variant */
export function statusToVariant(s: string): 'success' | 'warning' | 'error' | 'info' {
  if (['success', 'good', 'ok'].includes(s)) return 'success';
  if (['warning', 'warn'].includes(s)) return 'warning';
  if (['error', 'alert', 'danger', 'fail'].includes(s)) return 'error';
  return 'info';
}

/** Human-readable French label for a status */
export function statusLabel(s: string): string {
  if (['success', 'good', 'ok'].includes(s)) return 'Conforme';
  if (['warning', 'warn'].includes(s)) return 'Vigilance';
  if (['error', 'alert', 'danger', 'fail'].includes(s)) return 'Alerte';
  return 'Info';
}
