/**
 * PerformanceGauges — 4 jauges de performance affichant les VRAIES valeurs
 * calculées depuis le Grand Livre. Aucune transformation synthétique.
 *
 * - Exécution Budget CA : (CA réalisé / CA budget) × 100, cible 100 %
 * - Marge nette         : (RN / CA) × 100, cible 10 % (médiane UEMOA)
 * - Liquidité générale  : Actif circ. / Passif circ., cible ≥ 1.5
 * - DSO (recouvrement)  : délai paiement clients en jours, cible ≤ 60 j
 */
import { ChartCard } from './ChartCard';
import { Gauge } from './Gauge';

type Ratio = { code: string; value: number; target?: number | string; unit?: string };

export function PerformanceGauges({ budgetExec, marge, ratios }: { budgetExec: number; marge: number; ratios: Ratio[] }) {
  const lg = ratios.find((r) => r.code === 'LG')?.value ?? 0;
  const dso = ratios.find((r) => r.code === 'DSO')?.value ?? 0;

  // Cibles métier (paramétrables ailleurs via Settings → Ratios)
  const TARGET_BUDGET = 100;       // %
  const TARGET_MARGE = 10;         // % (médiane UEMOA)
  const TARGET_LG = 1.5;           // ratio
  const TARGET_DSO = 60;           // jours (cible UEMOA)
  const MAX_DSO_DISPLAY = 180;     // au-delà, on plafonne l'affichage

  return (
    <ChartCard title="Indicateurs de Performance" subtitle="Valeurs réelles calculées depuis le Grand Livre">
      <div className="grid grid-cols-2 gap-3 py-2">
        <Gauge
          value={Number.isFinite(budgetExec) ? budgetExec : 0}
          max={TARGET_BUDGET * 1.2}
          label="Exécution Budget CA"
          displayValue={Number.isFinite(budgetExec) && budgetExec > 0 ? `${budgetExec.toFixed(0)} %` : '—'}
          target={TARGET_BUDGET}
          unit="%"
        />
        <Gauge
          value={Number.isFinite(marge) ? marge : 0}
          max={TARGET_MARGE * 2}
          label="Marge nette"
          displayValue={Number.isFinite(marge) ? `${marge.toFixed(1)} %` : '—'}
          target={TARGET_MARGE}
          unit="%"
        />
        <Gauge
          value={Number.isFinite(lg) ? lg : 0}
          max={TARGET_LG * 2}
          label="Liquidité générale"
          displayValue={Number.isFinite(lg) && lg > 0 ? `${lg.toFixed(2)} ×` : '—'}
          target={TARGET_LG}
        />
        <Gauge
          value={Number.isFinite(dso) ? dso : 0}
          max={MAX_DSO_DISPLAY}
          inverse
          label="Délai paiement clients (DSO)"
          displayValue={Number.isFinite(dso) && dso > 0 ? `${Math.round(dso)} j` : '—'}
          target={TARGET_DSO}
          unit="j"
        />
      </div>
    </ChartCard>
  );
}
