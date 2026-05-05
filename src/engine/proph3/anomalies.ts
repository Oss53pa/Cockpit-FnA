// Détection d'anomalies comptables Proph3
//
// Source de données : Supabase via dataProvider (obligatoire).
//
// ─── Améliorations post-audit ──────────────────────────────────────────────
//   1. Écart-type non biaisé (correction de Bessel n-1) sur petits échantillons.
//   2. Hash de doublons inclut tiers + journal + pièce pour éviter faux positifs.
//   3. Une seule passe sur entries pour les compteurs au lieu de 6 itérations.
//   4. Limite max retournée configurable (évite exfiltration massive en cas d'org pollué).
import { dataProvider } from '../../db/provider';
import type { BalanceRow } from '../balance';

export type AnomalySeverity = 'low' | 'medium' | 'high';
export interface Anomaly {
  type: string;
  severity: AnomalySeverity;
  title: string;
  description: string;
  account?: string;
  value?: number;
  date?: string;
}
export interface AnomalyReport {
  anomalies: Anomaly[];
  stats: { totalEcritures: number; montantMoyen: number; ecartType: number; seuilAnomalie: number };
  counts: Record<AnomalySeverity, number>;
}

const MIN_SAMPLE_FOR_STATS = 10;
const SOLDE_ANORMAL_THRESHOLD = 1000;     // XOF
const CONCENTRATION_THRESHOLD = 30;       // %
const MAX_RETURNED_ANOMALIES = 50;
const EQUILIBRE_TOLERANCE = 1;            // tolérance d'arrondi par journal

export async function detectAnomalies(
  orgId: string,
  year: number,
  balance: BalanceRow[],
  seuilSigma = 2,
): Promise<AnomalyReport> {
  const anomalies: Anomaly[] = [];
  const [periods, all] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const pIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = all.filter((e) => pIds.has(e.periodId));
  const montants = entries.map((e) => Math.max(e.debit, e.credit)).filter((m) => m > 0);
  const n = montants.length;
  if (n < MIN_SAMPLE_FOR_STATS) {
    return {
      anomalies: [],
      stats: { totalEcritures: n, montantMoyen: 0, ecartType: 0, seuilAnomalie: 0 },
      counts: { high: 0, medium: 0, low: 0 },
    };
  }

  // ── Statistiques de base ──
  const mean = montants.reduce((a, b) => a + b, 0) / n;
  // CORRECTION (audit) : écart-type NON biaisé = Σ(x−μ)² / (n−1).
  // Pour échantillons (≠ population), Bessel correction est requise.
  const std = Math.sqrt(montants.reduce((s, m) => s + (m - mean) ** 2, 0) / (n - 1));
  const seuil = mean + seuilSigma * std;
  const seuil3sigma = mean + 3 * std;

  // ── Pré-calculs en UNE seule passe sur entries ──
  // CORRECTION (audit) : avant on parcourait `entries` 6 fois (montants atypiques,
  // weekend, doublons, équilibre journaux, concentration, soldes). On consolide
  // tout en une passe pour O(n) au lieu de O(6n).
  const dupKeys = new Map<string, { count: number; date: string; account: string; tiers?: string; piece?: string }>();
  const journalsAgg = new Map<string, { d: number; c: number }>();
  const ventesByTiers = new Map<string, number>();
  let caTotal = 0;

  for (const e of entries) {
    const a = Math.max(e.debit, e.credit);

    // (a) Montants atypiques
    if (a > seuil) {
      anomalies.push({
        type: 'MONTANT_ATYPIQUE',
        severity: a > seuil3sigma ? 'high' : 'medium',
        title: `Montant atypique : ${a.toLocaleString('fr-FR')}`,
        description: `${e.account} — ${e.label} (${((a - mean) / std).toFixed(1)} σ)`,
        account: e.account,
        value: a,
        date: e.date,
      });
    }

    // (b) Écritures weekend
    if (e.date) {
      const d = new Date(e.date);
      const day = d.getDay();
      if (day === 0 || day === 6) {
        anomalies.push({
          type: 'ECRITURE_WEEKEND',
          severity: 'low',
          title: `Écriture ${day === 0 ? 'dimanche' : 'samedi'}`,
          description: `${e.date} — ${e.account} ${e.label}`,
          account: e.account,
          date: e.date,
        });
      }
    }

    // (c) Hash de doublons — CORRECTION (audit) : inclut tiers + journal + pièce
    // pour éviter faux positifs (2 ventes au comptant légitimes le même jour).
    const dupKey = `${e.date}|${e.account}|${e.debit}|${e.credit}|${e.tiers ?? ''}|${e.journal ?? ''}|${e.piece ?? ''}`;
    const existing = dupKeys.get(dupKey);
    if (existing) {
      existing.count++;
    } else {
      dupKeys.set(dupKey, { count: 1, date: e.date, account: e.account, tiers: e.tiers, piece: e.piece });
    }

    // (d) Équilibre journaux
    if (e.journal) {
      const j = journalsAgg.get(e.journal) ?? { d: 0, c: 0 };
      j.d += e.debit;
      j.c += e.credit;
      journalsAgg.set(e.journal, j);
    }

    // (e) Concentration ventes par tiers (compte 70x = ventes)
    if (e.account.startsWith('70')) {
      const ca = e.credit - e.debit;
      caTotal += ca;
      if (e.tiers) {
        ventesByTiers.set(e.tiers, (ventesByTiers.get(e.tiers) ?? 0) + ca);
      }
    }
  }

  // ── Émission des anomalies aggrégées ──
  // (c') Doublons confirmés
  for (const [, info] of dupKeys) {
    if (info.count > 1) {
      anomalies.push({
        type: 'DOUBLON',
        severity: 'medium',
        title: `${info.count} écritures identiques`,
        description: `${info.date} — Compte ${info.account}${info.tiers ? ` · Tiers ${info.tiers}` : ''}${info.piece ? ` · Pièce ${info.piece}` : ''}`,
        account: info.account,
        date: info.date,
      });
    }
  }

  // (d') Journaux déséquilibrés
  for (const [j, v] of journalsAgg) {
    const ecart = Math.abs(v.d - v.c);
    if (ecart > EQUILIBRE_TOLERANCE) {
      anomalies.push({
        type: 'EQUILIBRE_JOURNAL',
        severity: 'high',
        title: `Journal ${j} déséquilibré`,
        description: `Débit ${v.d.toLocaleString('fr-FR')} vs Crédit ${v.c.toLocaleString('fr-FR')} (écart ${ecart.toLocaleString('fr-FR')})`,
        value: ecart,
      });
    }
  }

  // (e') Concentration tiers
  if (caTotal > 0) {
    for (const [t, m] of ventesByTiers) {
      const p = (m / caTotal) * 100;
      if (p > CONCENTRATION_THRESHOLD) {
        anomalies.push({
          type: 'CONCENTRATION',
          severity: 'medium',
          title: `Concentration ${p.toFixed(0)}% du CA`,
          description: `Tiers "${t}" = ${m.toLocaleString('fr-FR')}`,
          value: m,
        });
      }
    }
  }

  // (f) Soldes anormaux (sur la balance, pas sur entries — pas de doublonnage)
  for (const r of balance) {
    if (r.account[0] === '6' && r.soldeC > SOLDE_ANORMAL_THRESHOLD) {
      anomalies.push({
        type: 'SOLDE_ANORMAL',
        severity: 'high',
        title: 'Charge en solde créditeur',
        description: `${r.account} (${r.label}) : ${r.soldeC.toLocaleString('fr-FR')}`,
        account: r.account,
        value: r.soldeC,
      });
    }
    if (r.account[0] === '7' && r.soldeD > SOLDE_ANORMAL_THRESHOLD) {
      anomalies.push({
        type: 'SOLDE_ANORMAL',
        severity: 'high',
        title: 'Produit en solde débiteur',
        description: `${r.account} (${r.label}) : ${r.soldeD.toLocaleString('fr-FR')}`,
        account: r.account,
        value: r.soldeD,
      });
    }
  }

  const sevOrder: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };
  const sorted = anomalies
    .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])
    .slice(0, MAX_RETURNED_ANOMALIES);

  return {
    anomalies: sorted,
    stats: {
      totalEcritures: n,
      montantMoyen: Math.round(mean),
      ecartType: Math.round(std),
      seuilAnomalie: Math.round(seuil),
    },
    counts: {
      high:   anomalies.filter((a) => a.severity === 'high').length,
      medium: anomalies.filter((a) => a.severity === 'medium').length,
      low:    anomalies.filter((a) => a.severity === 'low').length,
    },
  };
}
