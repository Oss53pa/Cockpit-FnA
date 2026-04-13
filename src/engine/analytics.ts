// Moteur analytique pour dashboards spécialisés
import { db } from '../db/schema';
import { findSyscoAccount } from '../syscohada/coa';

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
      // classe 6 = débit positif, classe 7 = crédit positif
      const isCharge = e.account[0] === '6';
      values[p.month - 1] += isCharge ? (e.debit - e.credit) : (e.credit - e.debit);
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
    const isCharge = e.account[0] === '6';
    const v = isCharge ? (e.debit - e.credit) : (e.credit - e.debit);
    map.set(e.account, (map.get(e.account) ?? 0) + v);
  }
  return Array.from(map, ([code, value]) => ({
    code,
    label: findSyscoAccount(code)?.label ?? 'Compte',
    value,
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

// ─── Balance âgée (clients ou fournisseurs) ─────────────────────────────────
export type AgedTier = { tier: string; label: string; total: number; buckets: number[] };
const BUCKETS = ['Non échu', '0-30j', '31-60j', '61-90j', '> 90j'];

export async function agedBalance(orgId: string, year: number, kind: 'client' | 'fournisseur', importId?: string): Promise<{ buckets: string[]; rows: AgedTier[] }> {
  const prefix = kind === 'client' ? '411' : '401';
  const sign = kind === 'client' ? 1 : -1; // clients = solde débiteur, fournisseurs = solde créditeur
  const today = new Date();
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();

  // Regrouper par tiers (+ libellé associé)
  const accountLabels = new Map((await db.accounts.where('orgId').equals(orgId).toArray()).map((a) => [a.code, a.label] as const));
  const perTiers = new Map<string, { date: string; amount: number; account: string; label: string }[]>();
  for (const e of entries) {
    if (!ids.has(e.periodId)) continue;
    if (!e.account.startsWith(prefix)) continue;
    if (importId && importId !== 'all' && e.importId !== importId) continue;
    const amt = (e.debit - e.credit) * sign;
    const tier = e.tiers || e.account;
    const label = accountLabels.get(e.account) ?? e.label ?? '—';
    const arr = perTiers.get(tier) ?? [];
    arr.push({ date: e.date, amount: amt, account: e.account, label });
    perTiers.set(tier, arr);
  }

  const rows: AgedTier[] = [];
  for (const [tier, movements] of perTiers) {
    const buckets = [0, 0, 0, 0, 0];
    const total = movements.reduce((s, m) => s + m.amount, 0);
    if (Math.abs(total) < 1) continue;
    // Répartition approximée par date moyenne
    for (const m of movements) {
      const d = new Date(m.date);
      const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      let idx = 0;
      if (days < 0) idx = 0;
      else if (days <= 30) idx = 1;
      else if (days <= 60) idx = 2;
      else if (days <= 90) idx = 3;
      else idx = 4;
      buckets[idx] += m.amount;
    }
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
