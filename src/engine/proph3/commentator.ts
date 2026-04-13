// Commentateur automatique Proph3 — Analyse financière en langage naturel
import type { SIG, Line } from '../statements';
import type { Ratio } from '../ratios';
import type { FinancialScore } from './scoring';
import type { AnomalyReport } from './anomalies';
import { fmtMoney } from '../../lib/format';

export interface Commentary { section: string; title: string; text: string; severity: 'positive' | 'neutral' | 'negative'; }
export interface FullCommentary { synthese: string; sections: Commentary[]; recommendations: string[]; }

function commentSIG(sig: SIG): Commentary[] {
  const ca = sig.ca; if (ca <= 0) return [{ section: 'sig', title: 'CA', text: 'Aucune activité enregistrée.', severity: 'negative' }];
  const mb = (sig.margeBrute / ca) * 100, va = (sig.valeurAjoutee / ca) * 100, ebe = (sig.ebe / ca) * 100;
  return [
    { section: 'sig', title: 'Marge brute', text: `${fmtMoney(sig.margeBrute)} (${mb.toFixed(1)}% du CA). ${mb > 35 ? 'Satisfaisant.' : mb > 20 ? 'Correct, à optimiser.' : 'Faible — revoir les achats.'}`, severity: mb > 30 ? 'positive' : mb > 15 ? 'neutral' : 'negative' },
    { section: 'sig', title: 'Valeur ajoutée', text: `${fmtMoney(sig.valeurAjoutee)} (${va.toFixed(1)}% du CA). ${va > 40 ? 'Création de valeur élevée.' : va > 25 ? 'Correct.' : 'Faible — consommations intermédiaires élevées.'}`, severity: va > 35 ? 'positive' : va > 20 ? 'neutral' : 'negative' },
    { section: 'sig', title: 'EBE', text: `${fmtMoney(sig.ebe)} (${ebe.toFixed(1)}% du CA). ${ebe > 20 ? 'Performance solide.' : ebe > 10 ? 'Acceptable.' : ebe > 0 ? 'Marge serrée.' : 'EBE négatif.'}`, severity: ebe > 15 ? 'positive' : ebe > 5 ? 'neutral' : 'negative' },
    { section: 'sig', title: 'Résultat net', text: `${fmtMoney(sig.resultat)} (${((sig.resultat / ca) * 100).toFixed(1)}%). ${sig.resultat > 0 ? 'Bénéficiaire.' : 'Déficitaire.'}${sig.rf < 0 ? ` Charges financières : ${fmtMoney(Math.abs(sig.rf))}.` : ''}`, severity: sig.resultat > 0 ? 'positive' : 'negative' },
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

export function generateCommentary(sig: SIG | null, bilanActif: Line[], bilanPassif: Line[], ratios: Ratio[], score?: FinancialScore, anomalies?: AnomalyReport): FullCommentary {
  const sections: Commentary[] = [];
  if (sig) sections.push(...commentSIG(sig));
  if (bilanActif.length && bilanPassif.length) sections.push(...commentBilan(bilanActif, bilanPassif));
  for (const r of ratios.filter((r) => r.status === 'alert').slice(0, 3))
    sections.push({ section: 'ratios', title: r.label, text: `${r.value.toFixed(2)} ${r.unit} (cible ${r.target}). ${r.formula}`, severity: 'negative' });
  if (anomalies?.counts.high)
    sections.push({ section: 'anomalies', title: 'Anomalies', text: `${anomalies.counts.high} critique(s), ${anomalies.counts.medium} vigilance(s) sur ${anomalies.stats.totalEcritures} écritures.`, severity: 'negative' });

  const pos = sections.filter((s) => s.severity === 'positive').length, neg = sections.filter((s) => s.severity === 'negative').length;
  const synthese = score ? `Score ${score.global}/100 (${score.label}). Z-Score ${score.zScore} (${score.zLabel}). ${pos} point(s) fort(s), ${neg} vigilance(s).` : `${pos} point(s) fort(s), ${neg} vigilance(s).`;
  return { synthese, sections, recommendations: score?.recommendations ?? [] };
}
