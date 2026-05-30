// Moteur de calcul — Balances dérivées du Grand Livre
//
// Source de données : Supabase via dataProvider (obligatoire).
// Aucun accès direct à `db` Dexie — voir src/db/provider.ts pour le pattern.
import type { GLEntry, TiersRule } from '../db/schema';
import { dataProvider } from '../db/provider';
import { findSyscoAccount, classOf } from '../syscohada/coa';
import { matchesTiersRule, loadTiersRules } from './tiersRules';

// Filtre permettant de retrouver dans le Grand Livre les écritures à l'origine
// d'une ligne de balance auxiliaire ou de rapprochement (drill-down).
export type GLDrillFilter = {
  account?: string;        // match exact sur le compte
  accountPrefix?: string;  // match préfixe (compte collectif, ex '411')
  accountIn?: string[];    // match si le compte fait partie de cette liste
  tiers?: string;          // match exact sur le code tiers
  label?: string;          // match exact sur le libellé d'écriture
  noTiers?: boolean;       // uniquement les écritures SANS code tiers
};

// Teste si une écriture GL correspond à un filtre de drill-down.
export function matchesDrill(e: GLEntry, d: GLDrillFilter): boolean {
  if (d.tiers !== undefined && (e.tiers ?? '') !== d.tiers) return false;
  if (d.account !== undefined && e.account !== d.account) return false;
  if (d.accountPrefix !== undefined && !e.account.startsWith(d.accountPrefix)) return false;
  if (d.accountIn !== undefined && !d.accountIn.includes(e.account)) return false;
  if (d.label !== undefined && (e.label?.trim() ?? '') !== d.label) return false;
  if (d.noTiers && e.tiers) return false;
  return true;
}

export type AuxBalanceRow = {
  tier: string;          // code tiers ou n° compte auxiliaire
  label: string;         // libellé du compte ou du tiers
  account: string;       // compte (411xxx ou 401xxx)
  debit: number;
  credit: number;
  solde: number;         // soldeD positif = créance/dette
  drill: GLDrillFilter;  // filtre GL reproduisant exactement cette ligne
};

// Pure — construit la balance auxiliaire à partir d'écritures DÉJÀ filtrées
// (par préfixe de compte + période). Extrait de computeAuxBalance pour être
// réutilisé par computeTiersReconciliation : garantit que la vue « Rapprochement »
// et la vue « Balance auxiliaire » affichent EXACTEMENT le même détail par tiers.
export function buildAuxBalance(
  auxEntries: GLEntry[],
  accountLabels: Map<string, string>,
): AuxBalanceRow[] {
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

  // Détection des comptes parents (collectifs) : un compte est « parent » s'il
  // est préfixe strict d'un autre compte du même jeu. Ex : 411 est parent si
  // 411001 existe. Les écritures sur ces comptes parents sont des centralisations
  // qui dupliquent les lignes individuelles des tiers → à exclure.
  const parentAccounts = new Set<string>();
  const allCodes = Array.from(distinctAccounts);
  for (const code of allCodes) {
    for (const other of allCodes) {
      if (other !== code && other.startsWith(code)) {
        parentAccounts.add(code);
        break;
      }
    }
  }

  const map = new Map<string, AuxBalanceRow>();
  for (const e of auxEntries) {
    let key: string;
    let label: string;
    let tier: string;
    let drill: GLDrillFilter;

    if (hasTiers) {
      // Si l'org dispose de codes tiers, on agrège UNIQUEMENT par tiers.
      // Les écritures sans code tiers sur un compte parent (collectif 411/401)
      // sont des centralisations qui dupliquent les lignes tiers → on les exclut.
      if (e.tiers) {
        key = `T:${e.tiers}`;
        label = e.label?.trim() || accountLabels.get(e.account) || '—';
        tier = e.tiers;
        // Le drill reste borné au compte collectif (3 chiffres) pour ne pas
        // capturer un tiers homonyme sur une autre classe.
        drill = { tiers: e.tiers, accountPrefix: e.account.substring(0, 3) };
      } else if (parentAccounts.has(e.account)) {
        continue; // centralisation sur compte collectif → skip
      } else {
        // Écriture sans tiers sur un compte auxiliaire non-parent (ex: OD sur
        // 411500 sans code tiers) — on la garde dans un bucket résiduel.
        key = `__SANS_TIERS__:${e.account}`;
        label = `Sans tiers (${e.account})`;
        tier = `— ${e.account}`;
        drill = { account: e.account, noTiers: true };
      }
    } else if (hasMultipleAuxAccounts) {
      // Niveau 2 : plusieurs comptes auxiliaires distincts → un par tier
      key = `A:${e.account}`;
      label = accountLabels.get(e.account) ?? e.label ?? '—';
      tier = e.account;
      drill = { account: e.account };
    } else if (e.label?.trim()) {
      // Niveau 3 : un seul compte parent (ex: 411100) — on ventile par libellé
      // d'écriture pour distinguer les tiers individuellement.
      const lbl = e.label.trim();
      key = `L:${e.account}|${lbl}`;
      label = lbl;
      tier = lbl;
      drill = { account: e.account, label: lbl };
    } else {
      // Cas dégénéré : tout sur un compte sans libellé
      key = `A:${e.account}`;
      label = accountLabels.get(e.account) ?? '—';
      tier = e.account;
      drill = { account: e.account };
    }

    const cur = map.get(key) ?? { tier, label, account: e.account, debit: 0, credit: 0, solde: 0, drill };
    cur.debit += e.debit;
    cur.credit += e.credit;
    cur.solde = cur.debit - cur.credit;
    map.set(key, cur);
  }

  // (P2-2) Filtrage des soldes nuls : pour XOF (devise sans subdivision OHADA),
  // tout solde non nul = ≥ 1 unité. On tolère donc < 1 = lettré / nul.
  return Array.from(map.values())
    .filter((r) => Math.round(Math.abs(r.solde)) >= 1)
    .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
}

// Balance auxiliaire — clients (411) ou fournisseurs (401) groupée par tiers
export async function computeAuxBalance(opts: {
  orgId: string; year?: number; kind: 'client' | 'fournisseur'; importId?: string;
}): Promise<AuxBalanceRow[]> {
  const { orgId, year, kind, importId } = opts;
  const prefix = kind === 'client' ? '411' : '401';
  const [periods, entries, accounts] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAccounts(orgId),
  ]);
  const ids = new Set(periods.filter((p) => year === undefined || p.year === year).map((p) => p.id));
  const accountLabels = new Map(accounts.map((a) => [a.code, a.label] as const));

  // Filtrer une fois pour toutes les écritures du préfixe
  const auxEntries = entries.filter((e) =>
    ids.has(e.periodId) &&
    e.account.startsWith(prefix) &&
    (!importId || importId === 'all' || String(e.importId) === String(importId)),
  );

  return buildAuxBalance(auxEntries, accountLabels);
}

// ─── Rapprochement Balance auxiliaire ↔ Grand Livre (par compte collectif) ──
// Pour chaque compte collectif tiers de la classe 4, décompose le solde du
// Grand Livre en 3 parts :
//   • soldeTiers          : écritures portant un code tiers (= rattaché)
//   • soldeCentralisation : écritures sans tiers sur un compte PARENT collectif
//                           (centralisations qui dupliquent le détail auxiliaire)
//   • soldeJustifie       : écritures sans tiers couvertes par une règle 'ignore'
//                           (régularisation, OD interne…) → écart « justifié ».
//   • ecart (soldeSansTiers) : écritures sans tiers, non centralisées, non
//                           justifiées = part RÉELLEMENT non rattachée à un tiers.
// soldeGL = soldeTiers + soldeCentralisation + soldeJustifie + ecart. Un écart
// nul = chaque mouvement (hors centralisation/justifié) est imputé à un tiers →
// les deux balances « communient ».
export type TiersReconRow = {
  collective: string;            // préfixe collectif (ex '411')
  label: string;
  category: string;              // clé de catégorie (client/fournisseur/personnel/…)
  categoryLabel: string;         // libellé de la catégorie
  kind: 'client' | 'fournisseur' | 'autre';
  soldeGL: number;               // net brut de TOUTES les écritures du collectif
  soldeTiers: number;            // net des écritures portant un code tiers
  soldeCentralisation: number;   // net des centralisations (compte parent, sans tiers)
  soldeJustifie: number;         // net des écritures sans tiers couvertes par une règle 'ignore'
  ecart: number;                 // net des écritures sans tiers hors centralisation / justifié
  ok: boolean;                   // |ecart| < 1 → tout est rattaché ou justifié
  nbTiers: number;               // nombre de codes tiers distincts
  nbEntries: number;             // nombre d'écritures du collectif
  nbEntriesSansTiers: number;    // écritures sans tiers réellement en écart
  nbEntriesCentralisation: number;
  nbEntriesJustifie: number;
  details: AuxBalanceRow[];      // détail par tiers (drill-down)
  drill: GLDrillFilter;          // filtre GL du collectif entier
  ecartDrill: GLDrillFilter;     // filtre GL des écritures sans tiers (l'écart réel)
  centralisationDrill: GLDrillFilter; // filtre GL des centralisations
  justifieDrill: GLDrillFilter;  // filtre GL des écritures justifiées
};

// Catégorise un compte collectif classe 4 (mirroir des onglets de Grand Livre Tiers).
function tiersCategory(prefix: string): { key: string; label: string; kind: 'client' | 'fournisseur' | 'autre' } {
  switch (prefix.substring(0, 2)) {
    case '40': return { key: 'fournisseur', label: 'Fournisseurs', kind: 'fournisseur' };
    case '41': return { key: 'client', label: 'Clients', kind: 'client' };
    case '42': return { key: 'personnel', label: 'Personnel', kind: 'autre' };
    case '43': return { key: 'social', label: 'Organismes sociaux', kind: 'autre' };
    case '44': return { key: 'etat', label: 'État & collectivités', kind: 'autre' };
    case '45':
    case '46': return { key: 'groupe', label: 'Associés & groupe', kind: 'autre' };
    case '47': return { key: 'divers', label: 'Débiteurs & créditeurs divers', kind: 'autre' };
    case '48': return { key: 'hao', label: 'Créances & dettes HAO', kind: 'autre' };
    default: return { key: 'autre', label: 'Autres tiers', kind: 'autre' };
  }
}

// Pure — construit une ligne de rapprochement pour un compte collectif à partir
// de ses écritures (déjà filtrées par préfixe + période). `ignoreRules` permet
// de classer en « justifié » (hors écart) les écritures sans tiers couvertes
// par une règle 'ignore'.
export function buildReconRow(opts: {
  collective: string;
  label: string;
  category: string;
  categoryLabel: string;
  kind: 'client' | 'fournisseur' | 'autre';
  auxEntries: GLEntry[];
  accountLabels: Map<string, string>;
  ignoreRules?: TiersRule[];
}): TiersReconRow {
  const { collective, label, category, categoryLabel, kind, auxEntries, accountLabels } = opts;
  const ignoreRules = (opts.ignoreRules ?? []).filter((r) => r.action === 'ignore');
  const details = buildAuxBalance(auxEntries, accountLabels);

  // Détection des comptes parents (collectifs) : préfixe strict d'un autre compte
  // du groupe → leurs écritures sans tiers sont des centralisations.
  const accountsInGroup = Array.from(new Set(auxEntries.map((e) => e.account)));
  const parentAccounts = new Set<string>();
  for (const code of accountsInGroup) {
    for (const other of accountsInGroup) {
      if (other !== code && other.startsWith(code)) { parentAccounts.add(code); break; }
    }
  }

  let soldeTiers = 0, soldeCentralisation = 0, soldeSansTiers = 0, soldeJustifie = 0;
  let nbEntriesCentralisation = 0, nbEntriesSansTiers = 0, nbEntriesJustifie = 0;
  const tiersCodes = new Set<string>();
  const sansTiersAccounts = new Set<string>();
  const centralisationAccounts = new Set<string>();
  const justifieAccounts = new Set<string>();
  for (const e of auxEntries) {
    const m = e.debit - e.credit;
    if (e.tiers) {
      soldeTiers += m;
      tiersCodes.add(e.tiers);
    } else if (parentAccounts.has(e.account)) {
      soldeCentralisation += m;
      nbEntriesCentralisation++;
      centralisationAccounts.add(e.account);
    } else if (ignoreRules.some((r) => matchesTiersRule(e, r))) {
      soldeJustifie += m;
      nbEntriesJustifie++;
      justifieAccounts.add(e.account);
    } else {
      soldeSansTiers += m;
      nbEntriesSansTiers++;
      sansTiersAccounts.add(e.account);
    }
  }
  const soldeGL = soldeTiers + soldeCentralisation + soldeJustifie + soldeSansTiers;

  return {
    collective,
    label,
    category,
    categoryLabel,
    kind,
    soldeGL,
    soldeTiers,
    soldeCentralisation,
    soldeJustifie,
    ecart: soldeSansTiers,
    ok: Math.round(Math.abs(soldeSansTiers)) < 1,
    nbTiers: tiersCodes.size,
    nbEntries: auxEntries.length,
    nbEntriesSansTiers,
    nbEntriesCentralisation,
    nbEntriesJustifie,
    details,
    drill: { accountPrefix: collective },
    ecartDrill: { accountIn: Array.from(sansTiersAccounts), noTiers: true },
    centralisationDrill: { accountIn: Array.from(centralisationAccounts), noTiers: true },
    justifieDrill: { accountIn: Array.from(justifieAccounts), noTiers: true },
  };
}

export async function computeTiersReconciliation(opts: {
  orgId: string; year?: number; importId?: string;
}): Promise<TiersReconRow[]> {
  const { orgId, year, importId } = opts;
  const [periods, entries, accounts, rules] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
    dataProvider.getAccounts(orgId),
    loadTiersRules(orgId),
  ]);
  const ids = new Set(periods.filter((p) => year === undefined || p.year === year).map((p) => p.id));
  const accountLabels = new Map(accounts.map((a) => [a.code, a.label] as const));
  const ignoreRules = rules.filter((r) => r.action === 'ignore');
  const inScope = (e: GLEntry) =>
    ids.has(e.periodId) &&
    (!importId || importId === 'all' || String(e.importId) === String(importId));

  // Groupe toutes les écritures de la classe 4 par compte collectif (3 chiffres).
  const groups = new Map<string, GLEntry[]>();
  for (const e of entries) {
    if (!inScope(e) || e.account[0] !== '4') continue;
    const prefix = e.account.substring(0, 3);
    const arr = groups.get(prefix);
    if (arr) arr.push(e);
    else groups.set(prefix, [e]);
  }

  const rows: TiersReconRow[] = [];
  for (const [prefix, auxEntries] of groups) {
    const cat = tiersCategory(prefix);
    rows.push(buildReconRow({
      collective: prefix,
      label: findSyscoAccount(prefix)?.label ?? cat.label,
      category: cat.key,
      categoryLabel: cat.label,
      kind: cat.kind,
      auxEntries,
      accountLabels,
      ignoreRules,
    }));
  }
  rows.sort((a, b) => a.collective.localeCompare(b.collective));
  return rows;
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
  let periods = await dataProvider.getPeriods(orgId);
  if (year !== undefined) periods = periods.filter((p) => p.year === year);

  const fm = fromMonth ?? 1;
  const um = uptoMonth ?? 12;
  periods = periods.filter((p) => {
    if (p.month === 0) return includeOpening;
    return p.month >= fm && p.month <= um;
  });

  const periodIds = new Set(periods.map((p) => p.id));
  const all = await dataProvider.getGLEntries({ orgId });
  const entries: GLEntry[] = all.filter((e) =>
    periodIds.has(e.periodId) && (!importId || importId === 'all' || String(e.importId) === String(importId)),
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

  // Récupérer les libellés officiels (Plan Comptable) — peut être vide si non importé
  const accMeta = await dataProvider.getAccounts(orgId);
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

// Agrégation par racine SYSCOHADA (2 chiffres).
// (P2-1) Les comptes non mappés au plan SYSCOHADA officiel sont maintenant
// rangés dans un bucket "_NON_MAPPE" visible (au lieu d'être silencieusement
// ignorés). Un warning console est emis pour l'audit.
export function aggregateBySyscoRoot(rows: BalanceRow[]): Map<string, BalanceRow> {
  const m = new Map<string, BalanceRow>();
  const unmapped: string[] = [];
  for (const r of rows) {
    const sysco = findSyscoAccount(r.account);
    let root: string;
    let label: string;
    if (!sysco) {
      // Bucket "non-mappé" : le compte existe dans le GL mais pas dans le PCG
      // de référence. Probable plan tenant custom ou compte technique.
      root = '_NON_MAPPE';
      label = `Comptes non mappés au plan SYSCOHADA (${r.account[0] ?? '?'}xxx)`;
      unmapped.push(r.account);
    } else {
      root = sysco.code.length >= 2 ? sysco.code.substring(0, 2) : sysco.code;
      label = findSyscoAccount(root)?.label ?? '';
    }
    const cur = m.get(root) ?? {
      account: root,
      label,
      syscoCode: root,
      class: root[0] ?? '_',
      debit: 0, credit: 0, solde: 0, soldeD: 0, soldeC: 0,
    };
    cur.debit += r.debit;
    cur.credit += r.credit;
    cur.solde += r.solde;
    cur.soldeD = cur.solde > 0 ? cur.solde : 0;
    cur.soldeC = cur.solde < 0 ? -cur.solde : 0;
    m.set(root, cur);
  }
  if (unmapped.length > 0) {
    console.warn(`[balance] ${unmapped.length} comptes non mappés au plan SYSCOHADA :`, unmapped.slice(0, 10), unmapped.length > 10 ? `... (+${unmapped.length - 10})` : '');
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
