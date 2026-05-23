import { useId } from 'react';

/**
 * Gauge — jauge demi-cercle moderne (SVG, arc dégradé + cap arrondi).
 *
 * IMPORTANT — affichage des vraies valeurs (pas de score transformé) :
 * - `value`        : valeur réelle de la métrique (ex: 12.4 pour une marge en %)
 * - `max`          : valeur cible/maximale (ex: 30 pour la marge — proportionne la jauge)
 * - `displayValue` : texte explicite au centre (ex: "12,4 %", "1,8x", "65 j").
 * - `unit`         : unité affichée si pas de displayValue
 * - `target`       : valeur de référence (cible métier) — affichée sous la valeur
 * - `inverse`      : si true, plus c'est BAS mieux c'est (ex: DSO en jours)
 */
type Props = {
  value: number;
  max?: number;
  label: string;
  displayValue?: string;
  unit?: string;
  target?: number;
  inverse?: boolean;
};

const clamp = (n: number) => Math.min(Math.max(n, 0), 100);

export function Gauge({ value, max = 100, label, displayValue, unit, target, inverse = false }: Props) {
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const pct = inverse ? clamp(100 - rawPct) : clamp(rawPct);

  // Couleur selon la performance — sauge (marque) pour la zone "correcte".
  const color = pct > 80 ? '#22c55e' : pct > 50 ? 'rgb(var(--accent))' : pct > 25 ? '#f59e0b' : '#ef4444';

  const formatted = displayValue ?? `${Number.isFinite(value) ? value.toFixed(value < 10 ? 1 : 0) : '—'}${unit ? ` ${unit}` : ''}`;

  // Géométrie du demi-cercle (haut) : centre (60,62), rayon 48.
  const cx = 60, cy = 62, r = 48, sw = 11;
  const polar = (ang: number) => ({
    x: cx + r * Math.cos((ang * Math.PI) / 180),
    y: cy - r * Math.sin((ang * Math.PI) / 180),
  });
  const arc = (startAng: number, endAng: number) => {
    const s = polar(startAng), e = polar(endAng);
    const large = Math.abs(endAng - startAng) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const endAngle = 180 - (pct / 100) * 180;

  // Id de dégradé unique par instance (évite les collisions entre jauges).
  const gid = 'gauge-' + useId().replace(/:/g, '');

  return (
    <div className="text-center">
      <svg viewBox="0 0 120 72" className="w-[120px] h-[72px] mx-auto block">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        {/* Piste */}
        <path d={arc(180, 0)} fill="none" stroke="rgb(var(--p-200))" strokeWidth={sw} strokeLinecap="round" />
        {/* Valeur */}
        {pct > 0.5 && (
          <path d={arc(180, endAngle)} fill="none" stroke={`url(#${gid})`} strokeWidth={sw} strokeLinecap="round" className="transition-all duration-500 ease-spring" />
        )}
        <text x={cx} y={cy - 5} textAnchor="middle" className="num" style={{ fontSize: 17, fontWeight: 700, fill: color }}>
          {formatted}
        </text>
      </svg>
      <p className="text-[11px] text-primary-500 mt-1 font-medium">{label}</p>
      {target !== undefined && Number.isFinite(target) && (
        <p className="text-[9px] text-primary-400 mt-0.5 num">Cible : {target.toFixed(target < 10 ? 1 : 0)}{unit ? ` ${unit}` : ''}</p>
      )}
    </div>
  );
}
