// Moteur de calcul — Balances dérivées du Grand Livre
import { db, GLEntry } from '../db/schema';
import { findSyscoAccount, classOf } from '../syscohada/coa';

export type AuxBalanceRow = {
  tier: string;          // code tiers ou n° compte auxiliaire
  label: string;         // libellé du compte ou du tiers
  account: string;       // compte (411xxx ou 401xxx)
  debit: number;
  credit: number;
  solde: number;         // soldeD positif = créance/dette
};

// Balance auxiliaire — clients (411) ou fournisseurs (401) groupée par tiers
export async function computeAuxBalance(opts: {
  orgId: string; year?: number; kind: 'client' | 'fournisseur'; importId?: string;
}): Promise<AuxBalanceRow[]> {
  const { orgId, year, kind, importId } = opts;
  const prefix = kind === 'client' ? '411' : '401';
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const ids = new Set(periods.filter((p) => year === undefined || p.year === year).map((p) => p.id));
  const entries = await db.gl.where('orgId').equals(orgId).toArray();
  const accountLabels = new Map((await db.accounts.where('orgId').equals(orgId).toArray()).map((a) => [a.code, a.label] as const));

  // Filtrer une fois pour toutes les écritures du préfixe
  const auxEntries = entries.filter((e) =>
    ids.has(e.periodId) &&
    e.account.startsWith(prefix) &&
    (!importId || importId === 'all' || e.importId === importId),
  );

  // Détection du niveau de détail RÉEL disponible :
  //   1) « tiers » : au moins une écriture a un code tiers renseigné
  //   2) « comptes auxiliaires multiples » : il existe PLUSIEURS comptes
  //      différents sous le préfixe (ex : 411001, 411002…). 1 seul compte
  //      type 411100 ne compte PAS comme détail.
  //   3) Sinon : on prend le LIBELLÉ d'écriture comme proxy de tiers
  //      (chaque libellé distinct = un tiers présumé)
  let hasTiers = false;
  const distinctAccounts = new Set<string>();
  for (const e of auxEntries) {
    if (e.tiers) hasTiers = true;
    distinctAccounts.add(e.account);
  }
  const hasMultipleAuxAccounts = distinctAccounts.size > 1;

  const map = new Map<string, AuxBalanceRow>();
  for (const e of auxEntries) {
    let key: string;
    let label: string;
    let tier: string;

    if (hasTiers && e.tiers) {
      // Niveau 1 : code tiers explicite
      key = `T:${e.tiers}`;
      label = e.label?.trim() || accountLabels.get(e.account) || '—';
      tier = e.tiers;
    } else if (hasMultipleAuxAccounts) {
      // Niveau 2 : plusieurs comptes auxiliaires distincts → un par tier
      key = `A:${e.account}`;
      label = accountLabels.get(e.account) ?? e.label ?? '—';
      tier = e.account;
    } else if (e.label?.trim()) {
      // Niveau 3 : un seul compte parent (ex: 411100) — on ventile par libellé
      // d'écriture pour distinguer les tiers individuellement.
      const lbl = e.label.trim();
      key = `L:${e.account}|${lbl}`;
      label = lbl;
      tier = lbl;
    } else {
      // Cas dégénéré : tout sur un compte sans libellé
      key = `A:${e.account}`;
      label = accountLabels.get(e.account) ?? '—';
      tier = e.account;
    }

    const cur = map.get(key) ?? { tier, label, account: e.account, debit: 0, credit: 0, solde: 0 };
    cur.debit += e.debit;
    cur.credit += e.credit;
    cur.solde = cur.debit - cur.credit;
    map.set(key, cur);
  }

  return Array.from(map.values())
    .filter((r) => Math.abs(r.solde) > 0.01)
    .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
}

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
  importId?: string;      // filtrer sur une version d'import précise
};

export async function computeBalance(opts: BalanceOpts): Promise<BalanceRow[]> {
  const { orgId, year, fromMonth, uptoMonth, includeOpening = true, importId } = opts;

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
  const entries: GLEntry[] = all.filter((e) =>
    periodIds.has(e.periodId) && (!importId || importId === 'all' || e.importId === importId),
  );

  // Aggrégation par compte
  const acc = new Map<string, { debit: number; credit: number; label: string }>();
  // Calcul libellé GL le plus fréquent par compte
  const glFreq = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const cur = acc.get(e.account) ?? { debit: 0, credit: 0, label: e.label };
    cur.debit += e.debit;
    cur.credit += e.credit;
    acc.set(e.account, cur);
    if (e.label) {
      const lbl = e.label.trim();
      if (lbl) {
        let m = glFreq.get(e.account); if (!m) { m = new Map(); glFreq.set(e.account, m); }
        m.set(lbl, (m.get(lbl) ?? 0) + 1);
      }
    }
  }
  const glLabel = (code: string): string | undefined => {
    const m = glFreq.get(code); if (!m) return undefined;
    let best = ''; let bestN = 0;
    for (const [k, v] of m) if (v > bestN) { best = k; bestN = v; }
    return best || undefined;
  };

  // Récupérer les libellés officiels (db.accounts) — peut être vide si Plan Comptable non importé
  const accMeta = await db.accounts.where('orgId').equals(orgId).toArray();
  const labelMap = new Map(accMeta.map((a) => [a.code, a]));

  const rows: BalanceRow[] = [];
  for (const [code, v] of acc) {
    const sysco = findSyscoAccount(code);
    const meta = labelMap.get(code);
    const solde = v.debit - v.credit;
    rows.push({
      account: code,
      label: meta?.label ?? glLabel(code) ?? sysco?.label ?? 'Compte non identifié',
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
