// Moteur Budget — versions, répartition, écarts
import { db, BudgetLine } from '../db/schema';
import { findSyscoAccount } from '../syscohada/coa';

export type BudgetSummary = {
  account: string;
  label: string;
  monthly: number[];    // 12 valeurs
  total: number;
};

export type VarianceRow = {
  account: string;
  label: string;
  budget: number;
  realise: number;
  ecart: number;
  ecartPct: number;
  status: 'favorable' | 'defavorable' | 'neutral';
};

// Saisonnalités prédéfinies
export const SEASONALITIES = {
  linear: Array(12).fill(1 / 12),
  growth: [0.06, 0.07, 0.08, 0.08, 0.09, 0.09, 0.08, 0.07, 0.09, 0.10, 0.10, 0.09],
  decline: [0.12, 0.11, 0.10, 0.09, 0.09, 0.08, 0.08, 0.07, 0.07, 0.07, 0.06, 0.06],
  seasonal_h2: [0.05, 0.05, 0.06, 0.07, 0.08, 0.08, 0.10, 0.11, 0.11, 0.10, 0.10, 0.09],
  commercial: [0.08, 0.07, 0.08, 0.08, 0.08, 0.09, 0.07, 0.06, 0.09, 0.10, 0.10, 0.10],
} as const;

export type SeasonalityKey = keyof typeof SEASONALITIES;

export const SEASONALITY_LABELS: Record<SeasonalityKey, string> = {
  linear: 'Linéaire (1/12 par mois)',
  growth: 'Croissance (progression mensuelle)',
  decline: 'Décroissance',
  seasonal_h2: 'Saisonnier 2ᵉ semestre',
  commercial: 'Commercial (pic fin d\'année)',
};

export function distribute(annualAmount: number, seasonality: SeasonalityKey): number[] {
  return SEASONALITIES[seasonality].map((w) => Math.round(annualAmount * w));
}

// Récupère les versions de budget disponibles pour une société/année
export async function listBudgetVersions(orgId: string, year: number): Promise<string[]> {
  const lines = await db.budgets.where('[orgId+year+version]').between([orgId, year, ''], [orgId, year, '\uffff']).toArray();
  return Array.from(new Set(lines.map((l) => l.version))).sort();
}

// Charge le budget complet d'une version
export async function loadBudget(orgId: string, year: number, version: string): Promise<BudgetSummary[]> {
  const lines = await db.budgets
    .where('[orgId+year+version]').equals([orgId, year, version]).toArray();
  const map = new Map<string, number[]>();
  for (const l of lines) {
    const arr = map.get(l.account) ?? Array(12).fill(0);
    arr[l.month - 1] += l.amount;
    map.set(l.account, arr);
  }
  const result: BudgetSummary[] = [];
  for (const [account, monthly] of map) {
    const sysco = findSyscoAccount(account);
    result.push({
      account,
      label: sysco?.label ?? 'Compte',
      monthly,
      total: monthly.reduce((s, n) => s + n, 0),
    });
  }
  return result.sort((a, b) => a.account.localeCompare(b.account));
}

// Enregistre un budget (efface l'existant pour cette version avant insertion)
// Push automatiquement vers Supabase pour multi-device.
export async function saveBudget(
  orgId: string, year: number, version: string,
  items: Array<{ account: string; monthly: number[] }>,
) {
  let inserted: Omit<BudgetLine, 'id'>[] = [];
  await db.transaction('rw', db.budgets, async () => {
    await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).delete();
    const toInsert: Omit<BudgetLine, 'id'>[] = [];
    for (const it of items) {
      for (let m = 0; m < 12; m++) {
        if (it.monthly[m]) {
          toInsert.push({ orgId, year, version, account: it.account, month: m + 1, amount: it.monthly[m] });
        }
      }
    }
    if (toInsert.length) await db.budgets.bulkAdd(toInsert as BudgetLine[]);
    inserted = toInsert;
  });

  // Push vers Supabase (fire-and-forget) pour multi-device
  if (inserted.length > 0) {
    void (async () => {
      try {
        const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
        if (!isSupabaseConfigured) return;
        await (supabase as any).from('fna_budgets')
          .delete()
          .eq('org_id', orgId).eq('year', year).eq('version', version);
        const rows = inserted.map((r) => ({
          org_id: r.orgId, year: r.year, version: r.version,
          account: r.account, month: r.month, amount: r.amount,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          await (supabase as any).from('fna_budgets').insert(rows.slice(i, i + 500));
        }
      } catch (e) {
        console.warn('[saveBudget] Push Supabase failed (non-bloquant):', e);
      }
    })();
  }
}

// Duplique une version
export async function duplicateVersion(
  orgId: string, year: number, from: string, to: string,
) {
  const lines = await db.budgets.where('[orgId+year+version]').equals([orgId, year, from]).toArray();
  const copies = lines.map(({ id: _id, ...rest }) => ({ ...rest, version: to }));
  if (copies.length) await db.budgets.bulkAdd(copies as BudgetLine[]);
}

// Supprime une version entière
export async function deleteVersion(orgId: string, year: number, version: string) {
  await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).delete();
}

// Calcul des écarts budget vs réalisé par compte
export async function computeVariance(
  orgId: string, year: number, version: string,
): Promise<VarianceRow[]> {
  const budget = await loadBudget(orgId, year, version);
  const budgetMap = new Map(budget.map((b) => [b.account, b.total]));

  // Récupérer le réalisé : solde par compte de charges/produits pour l'année
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const periodIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const perAccount = new Map<string, number>();
  for (const e of entries) {
    if (!periodIds.has(e.periodId)) continue;
    // classe 6 = charge (débit - crédit), classe 7 = produit (crédit - débit) pour avoir même signe
    const c = e.account[0];
    if (c !== '6' && c !== '7') continue;
    const v = c === '6' ? e.debit - e.credit : e.credit - e.debit;
    perAccount.set(e.account, (perAccount.get(e.account) ?? 0) + v);
  }

  // Roll-up budget parent → enfants du réalisé
  // Le budget peut être saisi sur des codes courts (60, 622) alors que le réalisé
  // est détaillé (605118, 622100). On distribue proportionnellement au réalisé.
  const budgetCodes = Array.from(budgetMap.keys());
  const realiseCodes = Array.from(perAccount.keys());
  const absorbedChildren = new Set<string>();
  const sortedBudgetCodes = [...budgetCodes].sort((a, b) => a.length - b.length);
  for (const budCode of sortedBudgetCodes) {
    const exactRealise = perAccount.get(budCode) ?? 0;
    const children = realiseCodes.filter(
      (c) => c !== budCode && c.startsWith(budCode) && c.length > budCode.length && !absorbedChildren.has(c),
    );
    if (children.length === 0) continue;
    let childRealise = 0;
    for (const c of children) childRealise += perAccount.get(c) ?? 0;
    if (childRealise !== 0 || exactRealise === 0) {
      perAccount.set(budCode, exactRealise + childRealise);
      for (const c of children) absorbedChildren.add(c);
    }
  }
  // Sens inverse : réalisé orphelin → agrège budgets enfants
  const realiseOrphans = realiseCodes.filter(
    (c) => !budgetMap.has(c) && !absorbedChildren.has(c),
  );
  for (const realCode of realiseOrphans) {
    const childBudgets = budgetCodes.filter(
      (b) => b !== realCode && b.startsWith(realCode) && b.length > realCode.length,
    );
    if (childBudgets.length === 0) continue;
    let agg = budgetMap.get(realCode) ?? 0;
    for (const cb of childBudgets) agg += budgetMap.get(cb) ?? 0;
    if (agg !== 0) {
      budgetMap.set(realCode, agg);
      for (const cb of childBudgets) budgetMap.delete(cb);
    }
  }
  for (const c of absorbedChildren) perAccount.delete(c);

  // Agrégation tous comptes (budget + réalisé)
  const all = new Set<string>([...budgetMap.keys(), ...perAccount.keys()]);
  const rows: VarianceRow[] = [];
  for (const account of all) {
    const budgetAmt = budgetMap.get(account) ?? 0;
    const realiseAmt = perAccount.get(account) ?? 0;
    const ecart = realiseAmt - budgetAmt;
    const ecartPct = budgetAmt !== 0 ? (ecart / Math.abs(budgetAmt)) * 100 : 0;
    const sysco = findSyscoAccount(account);
    const isCharge = account.startsWith('6');
    // Pour charges : réalisé > budget = défavorable. Pour produits : réalisé < budget = défavorable.
    const status: VarianceRow['status'] =
      Math.abs(ecart) < 1 ? 'neutral' :
      isCharge ? (ecart <= 0 ? 'favorable' : 'defavorable') : (ecart >= 0 ? 'favorable' : 'defavorable');

    rows.push({
      account,
      label: sysco?.label ?? 'Compte',
      budget: budgetAmt,
      realise: realiseAmt,
      ecart,
      ecartPct,
      status,
    });
  }
  return rows.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
}
