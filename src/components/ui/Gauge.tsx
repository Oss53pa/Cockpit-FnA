/**
 * Gauge — demi-cercle avec aiguille graduelle.
 *
 * IMPORTANT — affichage des vraies valeurs (pas de score transformé) :
 * - `value`        : valeur réelle de la métrique (ex: 12.4 pour une marge en %)
 * - `max`          : valeur cible/maximale (ex: 30 pour la marge — utilisée pour
 *                    proportionner la jauge)
 * - `displayValue` : texte explicite à afficher au centre (ex: "12,4 %", "1,8x",
 *                    "65 j"). Si non fourni, on tombe sur `value` formaté.
 * - `unit`         : unité affichée à côté de la valeur si pas de displayValue
 * - `target`       : valeur de référence (cible métier) — affichée discrètement
 *                    sous la valeur pour donner du contexte
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

export function Gauge({ value, max = 100, label, displayValue, unit, target, inverse = false }: Props) {
  // Pourcentage de remplissage de la jauge — basé sur la position relative à max
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const pct = inverse
    ? Math.min(Math.max(100 - rawPct, 0), 100)
    : Math.min(Math.max(rawPct, 0), 100);

  // Couleur basée sur la performance (inverse pour les métriques où petit = bien)
  const color = pct > 80 ? '#16a34a' : pct > 50 ? '#171717' : pct > 25 ? '#f59e0b' : '#dc2626';
  const angle = -90 + (pct / 100) * 180;

  // Affichage central : displayValue prioritaire, sinon value formatée
  const formatted = displayValue ?? `${Number.isFinite(value) ? value.toFixed(value < 10 ? 1 : 0) : '—'}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="text-center">
      <div className="relative w-[110px] h-16 mx-auto overflow-hidden">
        <div
          className="absolute w-[110px] h-[110px] rounded-full box-border"
          style={{
            border: '10px solid #e5e5e5', borderBottom: 'none', borderLeft: 'none',
            transform: 'rotate(-90deg)',
          }}
        />
        <div
          className="absolute w-[110px] h-[110px] rounded-full box-border transition-transform"
          style={{
            border: `10px solid ${color}`, borderBottom: 'none', borderLeft: 'none',
            transform: `rotate(${angle}deg)`,
          }}
        />
        <div className="absolute bottom-0 w-full text-center num text-base font-bold leading-none" style={{ color }}>
          {formatted}
        </div>
      </div>
      <p className="text-[11px] text-primary-500 mt-2 font-medium">{label}</p>
      {target !== undefined && Number.isFinite(target) && (
        <p className="text-[9px] text-primary-400 mt-0.5 num">Cible : {target.toFixed(target < 10 ? 1 : 0)}{unit ? ` ${unit}` : ''}</p>
      )}
    </div>
  );
}
