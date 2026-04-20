// Moteur analytique pour dashboards spécialisés
import { db } from '../db/schema';
import { findSyscoAccount } from '../syscohada/coa';

// Classification SYSCOHADA des sous-classes 8 (HAO & Impôts)
// — 81, 83, 85, 87, 89 : charges (solde débiteur)
// — 82, 84, 86, 88     : produits (solde créditeur)
const CHARGE_CLASS8 = new Set(['81', '83', '85', '87', '89']);
const PRODUIT_CLASS8 = new Set(['82', '84', '86', '88']);

function isChargeAccount(account: string): boolean {
  const c0 = account[0];
  if (c0 === '6') return true;
  if (c0 === '7') return false;
  if (c0 === '8') return CHARGE_CLASS8.has(account.substring(0, 2));
  return false;
}
function isProduitAccount(account: string): boolean {
  const c0 = account[0];
  if (c0 === '7') return true;
  if (c0 === '6') return false;
  if (c0 === '8') return PRODUIT_CLASS8.has(account.substring(0, 2));
  return false;
}

// ─── Évolution mensuelle par préfixe ────────────────────────────────────────
export async function monthlyByPrefix(orgId: string, year: number, prefixes: string[]) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const thisYear = periods.filter((p) => p.year === year && p.month >= 1).sort((a, b) => a.month - b.month);
  const values: number[] = Array(12).fill(0);
  for (const p of thisYear) {
    const entries = await db.gl.where('periodId').equals(p.id).toArray();
    for (const e of entries) {
      if (!prefixes.some((pfx) => e.account.startsWith(pfx))) continue;
      // charges (6, 81, 83, 85, 87, 89) = positif en débit net
      // produits (7, 82, 84, 86, 88) = positif en crédit net
      if (isChargeAccount(e.account)) {
        values[p.month - 1] += (e.debit - e.credit);
      } else if (isProduitAccount(e.account)) {
        values[p.month - 1] += (e.credit - e.debit);
      } else {
        // Classes 1-5 (bilan) : on prend le débit - crédit brut
        values[p.month - 1] += (e.debit - e.credit);
      }
    }
  }
  return { labels: MONTHS, values };
}

// ─── Top N par racine ────────────────────────────────────────────────────────
export async function topAccountsByPrefix(orgId: string, year: number, prefixes: string[], limit = 10) {
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (!prefixes.some((p) => e.account.startsWith(p))) continue;
    let v: number;
    if (isChargeAccount(e.account)) v = e.debit - e.credit;
    else if (isProduitAccount(e.account)) v = e.credit - e.debit;
    else v = e.debit - e.credit;
    map.set(e.account, (map.get(e.account) ?? 0) + v);
  }
  return Array.from(map, ([code, value]) => ({
    code,
    label: findSyscoAccount(code)?.label ?? 'Compte',
    value,
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

// ─── Balance âgée (clients ou fournisseurs) — algo FIFO correct ─────────────
// Principe : on lettre les règlements FIFO sur les factures les plus anciennes.
// Ce qui RESTE non lettré est ventilé dans les buckets selon l'âge de la facture.
// Sans ça, un règlement récent pour une vieille facture créerait des montants
// négatifs dans 0-30j et un solde nul globalement alors qu'il y a en réalité
// des créances ouvertes ailleurs → bug "0-30j à 0 mais % non zéro".
export type AgedTier = { tier: string; label: string; total: number; buckets: number[] };
const BUCKETS = ['Non échu', '0-30j', '31-60j', '61-90j', '> 90j'];

// Délai de paiement standard (en jours) appliqué par défaut aux factures
// quand le GL ne porte pas de date d'échéance distincte de la date d'émission.
// 30 j est la norme commerciale OHADA (clients / fournisseurs).
const DEFAULT_PAYMENT_TERM_DAYS = 30;

function bucketFromDays(daysSinceInvoice: number, paymentTermDays = DEFAULT_PAYMENT_TERM_DAYS): number {
  // Décale l'âge depuis la date d'émission vers l'âge depuis l'échéance :
  //   facture émise il y a 10 j (échéance dans 20 j)  → overdue = -20 → Non échu
  //   facture émise il y a 45 j (échue depuis 15 j)   → overdue =  15 → 0-30j
  //   facture émise il y a 95 j (échue depuis 65 j)   → overdue =  65 → 61-90j
  const overdue = daysSinceInvoice - paymentTermDays;
  if (overdue < 0) return 0;       // pas encore échue
  if (overdue <= 30) return 1;
  if (overdue <= 60) return 2;
  if (overdue <= 90) return 3;
  return 4;
}

export async function agedBalance(orgId: string, year: number, kind: 'client' | 'fournisseur', importId?: string): Promise<{ buckets: string[]; rows: AgedTier[] }> {
  const prefix = kind === 'client' ? '411' : '401';
  // Côté client : débits = factures (créances), crédits = encaissements (lettrés)
  // Côté fournisseur : crédits = factures (dettes),  débits   = paiements   (lettrés)
  const today = new Date();
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  const accountLabels = new Map((await db.accounts.where('orgId').equals(orgId).toArray()).map((a) => [a.code, a.label] as const));

  type Mvt = { date: string; amount: number; isInvoice: boolean; account: string; label: string };
  const perTiers = new Map<string, Mvt[]>();

  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (!e.account.startsWith(prefix)) continue;
    if (importId && importId !== 'all' && e.importId !== importId) continue;
    const tier = e.tiers || e.account;
    const label = accountLabels.get(e.account) ?? e.label ?? '—';
    const arr = perTiers.get(tier) ?? [];
    if (kind === 'client') {
      // débit = facture, crédit = règlement
      if (e.debit > 0) arr.push({ date: e.date, amount: e.debit, isInvoice: true, account: e.account, label });
      if (e.credit > 0) arr.push({ date: e.date, amount: e.credit, isInvoice: false, account: e.account, label });
    } else {
      // fournisseur : crédit = facture, débit = règlement
      if (e.credit > 0) arr.push({ date: e.date, amount: e.credit, isInvoice: true, account: e.account, label });
      if (e.debit > 0) arr.push({ date: e.date, amount: e.debit, isInvoice: false, account: e.account, label });
    }
    perTiers.set(tier, arr);
  }

  const rows: AgedTier[] = [];
  for (const [tier, movements] of perTiers) {
    // Tri chronologique
    movements.sort((a, b) => a.date.localeCompare(b.date));
    // Liste des factures avec montant ouvert résiduel (mutable)
    const openInvoices = movements.filter((m) => m.isInvoice).map((m) => ({ date: m.date, open: m.amount }));
    // Cumul des règlements
    let totalPayments = movements.filter((m) => !m.isInvoice).reduce((s, m) => s + m.amount, 0);
    // Imputation FIFO : règlements appliqués aux factures les plus anciennes
    for (const inv of openInvoices) {
      if (totalPayments <= 0) break;
      const applied = Math.min(inv.open, totalPayments);
      inv.open -= applied;
      totalPayments -= applied;
    }
    // Si paiements > factures (avoir / surpaiement) : crédit en faveur du tier
    // → on l'enregistre dans "Non échu" en valeur négative
    const surplus = totalPayments > 0 ? -totalPayments : 0;

    const buckets = [0, 0, 0, 0, 0];
    let total = surplus;
    buckets[0] += surplus;

    for (const inv of openInvoices) {
      if (inv.open < 0.01) continue;
      const d = new Date(inv.date);
      const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      const idx = bucketFromDays(days);
      buckets[idx] += inv.open;
      total += inv.open;
    }

    if (Math.abs(total) < 1) continue;
    const label = movements[0]?.label ?? '—';
    rows.push({ tier, label, total, buckets });
  }
  rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return { buckets: BUCKETS, rows };
}

// ─── Évolution trésorerie ──────────────────────────────────────────────────
export async function tresorerieMonthly(orgId: string, year: number) {
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  const cumul: number[] = Array(12).fill(0);
  const enc: number[] = Array(12).fill(0);
  const dec: number[] = Array(12).fill(0);
  let opening = 0;

  // Récup ouverture (mois 0)
  const openPeriod = periods.find((p) => p.year === year && p.month === 0);
  if (openPeriod) {
    for (const e of entries) {
      if (e.periodId !== openPeriod.id) continue;
      if (!['5'].some((p) => e.account.startsWith(p))) continue;
      if (e.account.startsWith('56')) opening -= (e.credit - e.debit);
      else opening += (e.debit - e.credit);
    }
  }

  let running = opening;
  for (let m = 1; m <= 12; m++) {
    const p = periods.find((x) => x.year === year && x.month === m);
    if (!p) continue;
    let encMois = 0, decMois = 0;
    for (const e of entries) {
      if (e.periodId !== p.id) continue;
      if (!['5'].some((px) => e.account.startsWith(px))) continue;
      if (e.account.startsWith('56')) { encMois -= e.credit; decMois -= e.debit; }
      else { encMois += e.debit; decMois += e.credit; }
    }
    enc[m - 1] = encMois;
    dec[m - 1] = decMois;
    running += encMois - decMois;
    cumul[m - 1] = running;
  }
  return { labels: MONTHS, cumul, encaissements: enc, decaissements: dec, opening };
}

// ─── Immobilisations ────────────────────────────────────────────────────────
export async function immobilisationsDetail(orgId: string, year: number) {
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));

  const cats = [
    { code: '21', label: 'Incorporelles' },
    { code: '22', label: 'Terrains' },
    { code: '23', label: 'Bâtiments' },
    { code: '24', label: 'Matériel' },
    { code: '245', label: 'Matériel transport' },
    { code: '26', label: 'Participations' },
    { code: '27', label: 'Autres financières' },
  ];
  const data: Array<{ label: string; brute: number; amort: number; vnc: number }> = [];
  for (const c of cats) {
    let brute = 0, amort = 0;
    for (const e of entries) {
      if (!ids.has(e.periodId)) continue;
      if (e.account.startsWith(c.code)) brute += (e.debit - e.credit);
      const amortCode = '28' + c.code.substring(1);
      if (e.account.startsWith(amortCode)) amort += (e.credit - e.debit);
    }
    data.push({ label: c.label, brute: Math.max(brute, 0), amort: Math.max(amort, 0), vnc: brute - amort });
  }
  return data;
}

// ─── Masse salariale mensuelle ──────────────────────────────────────────────
export async function masseSalariale(orgId: string, year: number) {
  const { labels, values } = await monthlyByPrefix(orgId, year, ['66']);
  return { labels, values };
}

// ─── Fiscalité ──────────────────────────────────────────────────────────────
export async function fiscalite(orgId: string, year: number) {
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  let tvaCol = 0, tvaDed = 0, tvaAPayer = 0, is = 0, taxes = 0;
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (e.account.startsWith('443')) tvaCol += (e.credit - e.debit);
    if (e.account.startsWith('445')) tvaDed += (e.debit - e.credit);
    if (e.account.startsWith('441')) is += (e.credit - e.debit);
    if (e.account.startsWith('64')) taxes += (e.debit - e.credit);
  }
  tvaAPayer = tvaCol - tvaDed;
  return { tvaCollectee: tvaCol, tvaDeductible: tvaDed, tvaAPayer, is, taxes };
}
