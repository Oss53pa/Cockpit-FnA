// Scoring financier Proph3 — Score de santé 0-100 + Z-Score Altman
import type { Ratio } from '../ratios';
import type { SIG, Line } from '../statements';

export interface FamilyScore { family: string; score: number; weight: number; details: string[]; }
export interface FinancialScore { global: number; label: string; color: string; families: FamilyScore[]; zScore: number; zLabel: string; recommendations: string[]; }

function ratioScore(value: number, target: number, inverse = false): number {
  if (inverse) { if (value <= target) return 100; if (value <= target * 1.5) return 70; if (value <= target * 2) return 40; return 10; }
  if (value >= target) return 100; if (value >= target * 0.8) return 80; if (value >= target * 0.6) return 60; if (value >= target * 0.4) return 40; return 10;
}

const WEIGHTS: Record<string, number> = { 'Rentabilité': 0.30, 'Liquidité': 0.25, 'Structure': 0.25, 'Activité': 0.20 };

export function computeFinancialScore(ratios: Ratio[], sig?: SIG | null, bilanActif?: Line[], bilanPassif?: Line[]): FinancialScore {
  const families: FamilyScore[] = [];
  const grouped = new Map<string, Ratio[]>();
  for (const r of ratios) { const a = grouped.get(r.family) ?? []; a.push(r); grouped.set(r.family, a); }

  let globalScore = 0;
  const recommendations: string[] = [];
  const recs: Record<string, string> = {
    MB: 'Négocier les prix fournisseurs', TVA: 'Optimiser les consommations intermédiaires', EBE: 'Maîtriser les charges de personnel',
    TRN: 'Réduire les charges financières', LG: 'Renforcer la trésorerie', AF: 'Renforcer les fonds propres',
    END: 'Réduire l\'endettement', DSO: 'Accélérer le recouvrement clients', DPO: 'Négocier des délais fournisseurs',
  };

  for (const [family, weight] of Object.entries(WEIGHTS)) {
    const fr = grouped.get(family) ?? [];
    if (!fr.length) { families.push({ family, score: 50, weight, details: [] }); globalScore += 50 * weight; continue; }
    const scores = fr.map((r) => ratioScore(r.value, r.target, r.inverse));
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const details: string[] = [];
    fr.forEach((r, i) => { if (scores[i] < 60) { details.push(`${r.label} : ${r.value.toFixed(2)} ${r.unit} (cible ${r.target})`); if (scores[i] < 40) recommendations.push(recs[r.code] ?? `Améliorer ${r.label}`); } });
    families.push({ family, score: Math.round(avg), weight, details });
    globalScore += avg * weight;
  }

  const global = Math.round(Math.max(0, Math.min(100, globalScore)));
  const zScore = computeZScore(sig, bilanActif, bilanPassif);

  return {
    global, label: global >= 80 ? 'Excellent' : global >= 65 ? 'Bon' : global >= 50 ? 'Correct' : global >= 35 ? 'Fragile' : 'Critique',
    color: global >= 80 ? '#22c55e' : global >= 65 ? '#84cc16' : global >= 50 ? '#eab308' : global >= 35 ? '#f97316' : '#ef4444',
    families, zScore: Math.round(zScore * 100) / 100,
    zLabel: zScore > 2.99 ? 'Zone sûre' : zScore > 1.81 ? 'Zone grise' : 'Zone de risque',
    recommendations: recommendations.slice(0, 5),
  };
}

/**
 * Z-Score Altman adapté SYSCOHADA.
 * Formule originale (1968) :
 *   Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
 *   X1 = BFR / Total Actif      (BFR ≈ Actif circulant - Passif circulant)
 *   X2 = Bénéfices non répartis (réserves) / Total Actif
 *   X3 = EBE / Total Actif
 *   X4 = Capitaux propres / Total Dettes
 *   X5 = CA / Total Actif
 *
 * Interprétation : Z > 2.99 zone sûre · 1.81 < Z < 2.99 zone grise · Z < 1.81 zone de risque.
 */
function computeZScore(sig?: SIG | null, actif?: Line[], passif?: Line[]): number {
  if (!sig || !actif || !passif) return 0;
  const get = (l: Line[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
  const ta = get(actif, '_BZ') || 1;
  const ac = get(actif, '_BK');
  const pc = get(passif, '_DP');
  const cp = get(passif, '_CP');

  // CORRECTION (audit) : code SYSCOHADA pour les dettes financières.
  // Dans le bilan SYSCOHADA, 'DA' = "Emprunts et dettes financières" (16, 17, 18)
  // — le code agrégé existe bien (cf. statements.ts). Mais on ajoute aussi DV
  // (trésorerie passive / concours bancaires) pour les dettes COURT TERME.
  // Total dettes = dettes financières (DA) + passif circulant (_DP) + treso passive (DV).
  const detteFin = get(passif, 'DA');
  const tresoPassive = get(passif, 'DV');
  const totalDettes = detteFin + pc + tresoPassive;

  // X2 : on utilise les RÉSERVES (CD = primes & réserves) plus le résultat
  // accumulé. Sinon, fallback sur capitaux propres - capital pour approximer.
  const reserves = get(passif, 'CD');
  const beneficeNonReparti = reserves > 0 ? reserves : Math.max(0, cp - get(passif, 'CA'));

  // GARDE : capitaux propres ≤ 0 = situation nette compromise → Z négatif (zone risque).
  if (cp <= 0 || totalDettes === 0) {
    // Calcul alternatif sans X4 (qui exploserait) — Z minoré.
    return 1.2 * ((ac - pc) / ta) + 1.4 * (beneficeNonReparti / ta) + 3.3 * (sig.ebe / ta) + 1.0 * (sig.ca / ta);
  }

  return 1.2 * ((ac - pc) / ta)
    + 1.4 * (beneficeNonReparti / ta)
    + 3.3 * (sig.ebe / ta)
    + 0.6 * (cp / totalDettes)
    + 1.0 * (sig.ca / ta);
}
