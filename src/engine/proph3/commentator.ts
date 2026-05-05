// Commentateur automatique Proph3 — Analyse financière en langage naturel
import type { SIG, Line } from '../statements';
import type { Ratio } from '../ratios';
import type { FinancialScore } from './scoring';
import type { AnomalyReport } from './anomalies';
import { fmtMoney } from '../../lib/format';

export interface Commentary { section: string; title: string; text: string; severity: 'positive' | 'neutral' | 'negative'; }
export interface FullCommentary { synthese: string; sections: Commentary[]; recommendations: string[]; }

// CORRECTION (audit) : seuils de marges adaptés AU SECTEUR.
// SYSCOHADA et la BCEAO publient des normes sectorielles différentes ;
// 35% de MB est satisfaisant pour services mais médiocre pour distribution
// alimentaire (5% norme). Si le secteur n'est pas connu, on utilise les
// seuils "tous secteurs" plus prudents.
type SectorThresholds = { mbHigh: number; mbMid: number; vaHigh: number; vaMid: number; ebeHigh: number; ebeMid: number };
const SECTOR_THRESHOLDS: Record<string, SectorThresholds> = {
  'commerce':       { mbHigh: 25, mbMid: 15, vaHigh: 25, vaMid: 12, ebeHigh: 8,  ebeMid: 4 },
  'distribution':   { mbHigh: 12, mbMid: 6,  vaHigh: 15, vaMid: 8,  ebeHigh: 5,  ebeMid: 2 },
  'industrie':      { mbHigh: 35, mbMid: 22, vaHigh: 40, vaMid: 25, ebeHigh: 18, ebeMid: 10 },
  'btp':            { mbHigh: 25, mbMid: 15, vaHigh: 30, vaMid: 18, ebeHigh: 12, ebeMid: 6 },
  'services':       { mbHigh: 60, mbMid: 40, vaHigh: 60, vaMid: 40, ebeHigh: 25, ebeMid: 15 },
  'hotellerie':     { mbHigh: 65, mbMid: 50, vaHigh: 50, vaMid: 35, ebeHigh: 22, ebeMid: 12 },
  'agriculture':    { mbHigh: 30, mbMid: 18, vaHigh: 35, vaMid: 22, ebeHigh: 15, ebeMid: 8 },
  'banque':         { mbHigh: 75, mbMid: 60, vaHigh: 65, vaMid: 50, ebeHigh: 30, ebeMid: 18 },
  'microfinance':   { mbHigh: 60, mbMid: 45, vaHigh: 55, vaMid: 40, ebeHigh: 25, ebeMid: 15 },
  'sante':          { mbHigh: 50, mbMid: 35, vaHigh: 50, vaMid: 35, ebeHigh: 18, ebeMid: 10 },
  'transport':      { mbHigh: 25, mbMid: 15, vaHigh: 30, vaMid: 18, ebeHigh: 12, ebeMid: 6 },
  'telecoms':       { mbHigh: 55, mbMid: 40, vaHigh: 55, vaMid: 40, ebeHigh: 25, ebeMid: 15 },
  'mines':          { mbHigh: 45, mbMid: 30, vaHigh: 50, vaMid: 30, ebeHigh: 22, ebeMid: 12 },
  'immobilier':     { mbHigh: 50, mbMid: 35, vaHigh: 55, vaMid: 40, ebeHigh: 25, ebeMid: 15 },
  'education':      { mbHigh: 55, mbMid: 40, vaHigh: 55, vaMid: 40, ebeHigh: 18, ebeMid: 10 },
};
const DEFAULT_THRESHOLDS: SectorThresholds = { mbHigh: 35, mbMid: 20, vaHigh: 35, vaMid: 22, ebeHigh: 15, ebeMid: 8 };

function getSectorThresholds(sector?: string): SectorThresholds {
  if (!sector) return DEFAULT_THRESHOLDS;
  const key = sector.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return SECTOR_THRESHOLDS[key] ?? DEFAULT_THRESHOLDS;
}

function commentSIG(sig: SIG, sector?: string): Commentary[] {
  const ca = sig.ca;
  if (ca <= 0) return [{ section: 'sig', title: 'CA', text: 'Aucune activité enregistrée.', severity: 'negative' }];
  const mb = (sig.margeBrute / ca) * 100, va = (sig.valeurAjoutee / ca) * 100, ebe = (sig.ebe / ca) * 100;
  const t = getSectorThresholds(sector);
  const sectorLabel = sector ? ` (norme ${sector})` : '';
  return [
    {
      section: 'sig', title: 'Marge brute',
      text: `${fmtMoney(sig.margeBrute)} (${mb.toFixed(1)}% du CA)${sectorLabel}. ${mb > t.mbHigh ? 'Satisfaisant.' : mb > t.mbMid ? 'Correct, à optimiser.' : 'Faible — revoir les achats.'}`,
      severity: mb > t.mbHigh ? 'positive' : mb > t.mbMid ? 'neutral' : 'negative',
    },
    {
      section: 'sig', title: 'Valeur ajoutée',
      text: `${fmtMoney(sig.valeurAjoutee)} (${va.toFixed(1)}% du CA)${sectorLabel}. ${va > t.vaHigh ? 'Création de valeur élevée.' : va > t.vaMid ? 'Correct.' : 'Faible — consommations intermédiaires élevées.'}`,
      severity: va > t.vaHigh ? 'positive' : va > t.vaMid ? 'neutral' : 'negative',
    },
    {
      section: 'sig', title: 'EBE',
      text: `${fmtMoney(sig.ebe)} (${ebe.toFixed(1)}% du CA)${sectorLabel}. ${ebe > t.ebeHigh ? 'Performance solide.' : ebe > t.ebeMid ? 'Acceptable.' : ebe > 0 ? 'Marge serrée.' : 'EBE négatif.'}`,
      severity: ebe > t.ebeHigh ? 'positive' : ebe > t.ebeMid ? 'neutral' : 'negative',
    },
    {
      section: 'sig', title: 'Résultat net',
      text: `${fmtMoney(sig.resultat)} (${((sig.resultat / ca) * 100).toFixed(1)}%). ${sig.resultat > 0 ? 'Bénéficiaire.' : 'Déficitaire.'}${sig.rf < 0 ? ` Charges financières : ${fmtMoney(Math.abs(sig.rf))}.` : ''}`,
      severity: sig.resultat > 0 ? 'positive' : 'negative',
    },
  ];
}

function commentBilan(actif: Line[], passif: Line[]): Commentary[] {
  const get = (l: Line[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
  const ta = get(actif, '_BZ'), cp = get(passif, '_CP'), rs = get(passif, '_DF'), ai = get(actif, '_AZ');
  const treA = get(actif, '_BT'), treP = get(passif, 'DV'), fr = rs - ai, bfr = get(actif, '_BK') - get(passif, '_DP'), tn = treA - treP;
  const af = ta > 0 ? cp / ta : 0;
  return [
    { section: 'bilan', title: 'Structure financière', text: `CP ${fmtMoney(cp)} = ${(af * 100).toFixed(0)}% du bilan. ${af > 0.5 ? 'Bonne autonomie.' : af > 0.3 ? 'Acceptable.' : 'Insuffisante.'}`, severity: af > 0.5 ? 'positive' : af > 0.3 ? 'neutral' : 'negative' },
    { section: 'bilan', title: 'Équilibre financier', text: `FR ${fmtMoney(fr)} | BFR ${fmtMoney(bfr)} | TN ${fmtMoney(tn)}. ${fr >= bfr ? 'FR couvre le BFR.' : 'FR insuffisant.'}`, severity: fr >= bfr ? 'positive' : 'negative' },
    { section: 'bilan', title: 'Trésorerie', text: `Active ${fmtMoney(treA)} | Passive ${fmtMoney(treP)} | Nette ${fmtMoney(tn)}. ${tn > 0 ? 'Confortable.' : 'Sous tension.'}`, severity: tn > 0 ? 'positive' : 'negative' },
  ];
}

export function generateCommentary(sig: SIG | null, bilanActif: Line[], bilanPassif: Line[], ratios: Ratio[], score?: FinancialScore, anomalies?: AnomalyReport, opts?: { sector?: string }): FullCommentary {
  const sections: Commentary[] = [];
  if (sig) sections.push(...commentSIG(sig, opts?.sector));
  if (bilanActif.length && bilanPassif.length) sections.push(...commentBilan(bilanActif, bilanPassif));
  for (const r of ratios.filter((r) => r.status === 'alert').slice(0, 3))
    sections.push({ section: 'ratios', title: r.label, text: `${r.value.toFixed(2)} ${r.unit} (cible ${r.target}). ${r.formula}`, severity: 'negative' });
  if (anomalies?.counts.high)
    sections.push({ section: 'anomalies', title: 'Anomalies', text: `${anomalies.counts.high} critique(s), ${anomalies.counts.medium} vigilance(s) sur ${anomalies.stats.totalEcritures} écritures.`, severity: 'negative' });

  const pos = sections.filter((s) => s.severity === 'positive').length, neg = sections.filter((s) => s.severity === 'negative').length;
  const synthese = score ? `Score ${score.global}/100 (${score.label}). Z-Score ${score.zScore} (${score.zLabel}). ${pos} point(s) fort(s), ${neg} vigilance(s).` : `${pos} point(s) fort(s), ${neg} vigilance(s).`;
  return { synthese, sections, recommendations: score?.recommendations ?? [] };
}
