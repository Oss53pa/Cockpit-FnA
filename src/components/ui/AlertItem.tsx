import { C } from '../../lib/colors';

type Props = { severity: 'low' | 'medium' | 'high' | 'critical'; type: string; message: string };

const icon = { low: '🔵', medium: '🟠', high: '🔴', critical: '⬛' };
const color = { low: C.info, medium: C.warning, high: C.danger, critical: '#7f1d1d' };

export function AlertItem({ severity, type, message }: Props) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-primary-100 dark:border-primary-800 last:border-0">
      <span className="text-sm">{icon[severity]}</span>
      <div className="flex-1 text-[12px] text-primary-800 dark:text-primary-200 min-w-0">{message}</div>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
        style={{ background: color[severity] + '20', color: color[severity] }}
      >
        {type}
      </span>
    </div>
  );
}
