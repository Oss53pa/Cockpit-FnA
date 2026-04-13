// Moteur de calcul — Balance générale
import { db, GLEntry } from '../db/schema';
import { findSyscoAccount, classOf } from '../syscohada/coa';

export type BalanceRow = {
  account: string;
  label: string;
  syscoCode?: string;
  class?: string;
  debit: number;
  credit: number;
  solde: number;          // positif = solde débiteur, négatif = créditeur
  soldeD: number;
  soldeC: number;
};

export type BalanceOpts = {
  orgId: string;
  year?: number;
  fromMonth?: number;     // inclusif (1..12)
  uptoMonth?: number;     // inclusif ; undefined = jusqu'à décembre
  includeOpening?: boolean; // inclure les à-nouveaux (mois 0)
};

export async function computeBalance(opts: BalanceOpts): Promise<BalanceRow[]> {
  const { orgId, year, fromMonth, uptoMonth, includeOpening = true } = opts;

  // Récupérer les périodes concernées
  let periods = await db.periods.where('orgId').equals(orgId).toArray();
  if (year !== undefined) periods = periods.filter((p) => p.year === year);

  const fm = fromMonth ?? 1;
  const um = uptoMonth ?? 12;
  periods = periods.filter((p) => {
    if (p.month === 0) return includeOpening;
    return p.month >= fm && p.month <= um;
  });

  const periodIds = new Set(periods.map((p) => p.id));
  const all = await db.gl.where('orgId').equals(orgId).toArray();
  const entries: GLEntry[] = all.filter((e) => periodIds.has(e.periodId));

  // Aggrégation par compte
  const acc = new Map<string, { debit: number; credit: number; label: string }>();
  for (const e of entries) {
    const cur = acc.get(e.account) ?? { debit: 0, credit: 0, label: e.label };
    cur.debit += e.debit;
    cur.credit += e.credit;
    acc.set(e.account, cur);
  }

  // Récupérer les libellés officiels
  const accMeta = await db.accounts.where('orgId').equals(orgId).toArray();
  const labelMap = new Map(accMeta.map((a) => [a.code, a]));

  const rows: BalanceRow[] = [];
  for (const [code, v] of acc) {
    const sysco = findSyscoAccount(code);
    const meta = labelMap.get(code);
    const solde = v.debit - v.credit;
    rows.push({
      account: code,
      label: meta?.label ?? sysco?.label ?? 'Compte non identifié',
      syscoCode: sysco?.code,
      class: classOf(code),
      debit: v.debit,
      credit: v.credit,
      solde,
      soldeD: solde > 0 ? solde : 0,
      soldeC: solde < 0 ? -solde : 0,
    });
  }
  rows.sort((a, b) => a.account.localeCompare(b.account));
  return rows;
}

// Agrégation par racine SYSCOHADA (2 chiffres)
export function aggregateBySyscoRoot(rows: BalanceRow[]): Map<string, BalanceRow> {
  const m = new Map<string, BalanceRow>();
  for (const r of rows) {
    const sysco = findSyscoAccount(r.account);
    if (!sysco) continue;
    const root = sysco.code.length >= 2 ? sysco.code.substring(0, 2) : sysco.code;
    const cur = m.get(root) ?? {
      account: root,
      label: findSyscoAccount(root)?.label ?? '',
      syscoCode: root,
      class: root[0],
      debit: 0, credit: 0, solde: 0, soldeD: 0, soldeC: 0,
    };
    cur.debit += r.debit;
    cur.credit += r.credit;
    cur.solde += r.solde;
    cur.soldeD = cur.solde > 0 ? cur.solde : 0;
    cur.soldeC = cur.solde < 0 ? -cur.solde : 0;
    m.set(root, cur);
  }
  return m;
}

// Solde net d'un ensemble de codes (préfixes)
export function sumBy(rows: BalanceRow[], prefixes: string[]): number {
  let total = 0;
  for (const r of rows) {
    if (prefixes.some((p) => r.account.startsWith(p))) total += r.solde;
  }
  return total;
}
