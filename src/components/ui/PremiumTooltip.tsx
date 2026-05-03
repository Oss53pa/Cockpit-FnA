/**
 * PremiumTooltip — tooltip Recharts/Nivo niveau Linear/Stripe Dashboard.
 *
 * Pattern visuel :
 *   ┌─────────────────────┐
 *   │ MAR 2026             │  (label en uppercase tracking-wide, opacity 0.7)
 *   │  ─────────           │
 *   │  ● CA          1.2M  │  (dot couleur + nom + valeur tabular-nums)
 *   │  ● Budget      1.0M  │
 *   └─────────────────────┘
 *
 * - Backdrop blur + shadow elevated
 * - Ring 1px subtile
 * - Padding aéré + typo serrée
 */
import { fmtFull } from '../../lib/format';

type Item = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: any;
  dataKey?: string | number;
};

interface Props {
  active?: boolean;
  label?: string | number;
  payload?: Item[];
  /** Formateur custom de la valeur (default: fmtFull) */
  formatter?: (v: number | string, name?: string) => string;
  /** Suffixe d'unité affiché après chaque valeur (ex: 'XOF', '%', 'j') */
  unit?: string;
  /** Cache le label (utile pour Pie/Treemap) */
  hideLabel?: boolean;
}

export function PremiumTooltip({ active, label, payload, formatter, unit, hideLabel }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = formatter ?? ((v) => typeof v === 'number' ? fmtFull(v) : String(v));

  return (
    <div
      className="rounded-xl px-3.5 py-2.5"
      style={{
        backgroundColor: 'rgba(31, 30, 27, 0.96)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.30), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        outline: 'none',
        minWidth: 140,
      }}
    >
      {!hideLabel && label !== undefined && (
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-1.5"
          style={{ color: 'rgba(250, 250, 250, 0.55)' }}
        >
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {it.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: it.color, boxShadow: `0 0 0 2px ${it.color}30` }}
                />
              )}
              <span className="truncate font-medium" style={{ color: 'rgba(250, 250, 250, 0.85)' }}>
                {it.name ?? '—'}
              </span>
            </div>
            <span className="font-semibold tabular-nums shrink-0" style={{ color: '#FAFAFA' }}>
              {it.value !== undefined ? fmt(it.value, it.name) : '—'}{unit ? ` ${unit}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
