// Détection d'anomalies comptables Proph3
import { db } from '../../db/schema';
import type { BalanceRow } from '../balance';

export type AnomalySeverity = 'low' | 'medium' | 'high';
export interface Anomaly { type: string; severity: AnomalySeverity; title: string; description: string; account?: string; value?: number; date?: string; }
export interface AnomalyReport { anomalies: Anomaly[]; stats: { totalEcritures: number; montantMoyen: number; ecartType: number; seuilAnomalie: number }; counts: Record<AnomalySeverity, number>; }

export async function detectAnomalies(orgId: string, year: number, balance: BalanceRow[], seuilSigma = 2): Promise<AnomalyReport> {
  const anomalies: Anomaly[] = [];
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const pIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const all = await db.gl.where('orgId').equals(orgId).toArray();
  const entries = all.filter((e) => pIds.has(e.periodId));
  const montants = entries.map((e) => Math.max(e.debit, e.credit)).filter((m) => m > 0);
  const n = montants.length;
  if (n < 10) return { anomalies: [], stats: { totalEcritures: n, montantMoyen: 0, ecartType: 0, seuilAnomalie: 0 }, counts: { high: 0, medium: 0, low: 0 } };

  const mean = montants.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(montants.reduce((s, m) => s + (m - mean) ** 2, 0) / n);
  const seuil = mean + seuilSigma * std;

  // Montants atypiques
  for (const e of entries) { const a = Math.max(e.debit, e.credit); if (a > seuil) anomalies.push({ type: 'MONTANT_ATYPIQUE', severity: a > mean + 3 * std ? 'high' : 'medium', title: `Montant atypique : ${a.toLocaleString()}`, description: `${e.account} — ${e.label} (${((a - mean) / std).toFixed(1)} sigma)`, account: e.account, value: a, date: e.date }); }

  // Écritures weekend
  for (const e of entries) { if (!e.date) continue; const d = new Date(e.date); if (d.getDay() === 0 || d.getDay() === 6) anomalies.push({ type: 'ECRITURE_WEEKEND', severity: 'low', title: `Écriture ${d.getDay() === 0 ? 'dimanche' : 'samedi'}`, description: `${e.date} — ${e.account} ${e.label}`, account: e.account, date: e.date }); }

  // Doublons
  const seen = new Map<string, number>();
  for (const e of entries) { const k = `${e.date}|${e.account}|${e.debit}|${e.credit}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  for (const [k, c] of seen) { if (c > 1) { const [date, account] = k.split('|'); anomalies.push({ type: 'DOUBLON', severity: 'medium', title: `${c} écritures identiques`, description: `${date} — Compte ${account}`, account, date }); } }

  // Soldes anormaux
  for (const r of balance) {
    if (r.account[0] === '6' && r.soldeC > 1000) anomalies.push({ type: 'SOLDE_ANORMAL', severity: 'high', title: 'Charge en solde créditeur', description: `${r.account} (${r.label}) : ${r.soldeC.toLocaleString()}`, account: r.account, value: r.soldeC });
    if (r.account[0] === '7' && r.soldeD > 1000) anomalies.push({ type: 'SOLDE_ANORMAL', severity: 'high', title: 'Produit en solde débiteur', description: `${r.account} (${r.label}) : ${r.soldeD.toLocaleString()}`, account: r.account, value: r.soldeD });
  }

  // Concentration tiers
  const ca = entries.filter((e) => e.account.startsWith('70')).reduce((s, e) => s + (e.credit - e.debit), 0);
  if (ca > 0) { const tc = new Map<string, number>(); for (const e of entries) { if (!e.account.startsWith('70') || !e.tiers) continue; tc.set(e.tiers, (tc.get(e.tiers) ?? 0) + (e.credit - e.debit)); } for (const [t, m] of tc) { const p = (m / ca) * 100; if (p > 30) anomalies.push({ type: 'CONCENTRATION', severity: 'medium', title: `Concentration ${p.toFixed(0)}% du CA`, description: `Tiers "${t}" = ${m.toLocaleString()}`, value: m }); } }

  // Équilibre par journal
  const journals = new Map<string, { d: number; c: number }>();
  for (const e of entries) { const j = journals.get(e.journal) ?? { d: 0, c: 0 }; j.d += e.debit; j.c += e.credit; journals.set(e.journal, j); }
  for (const [j, v] of journals) { const e = Math.abs(v.d - v.c); if (e > 1) anomalies.push({ type: 'EQUILIBRE_JOURNAL', severity: 'high', title: `Journal ${j} déséquilibré`, description: `Débit ${v.d.toLocaleString()} vs Crédit ${v.c.toLocaleString()} (écart ${e.toLocaleString()})`, value: e }); }

  const sorted = anomalies.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity])).slice(0, 50);
  return { anomalies: sorted, stats: { totalEcritures: n, montantMoyen: Math.round(mean), ecartType: Math.round(std), seuilAnomalie: Math.round(seuil) },
    counts: { high: anomalies.filter((a) => a.severity === 'high').length, medium: anomalies.filter((a) => a.severity === 'medium').length, low: anomalies.filter((a) => a.severity === 'low').length } };
}
