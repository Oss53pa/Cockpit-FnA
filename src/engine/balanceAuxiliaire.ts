// Balance auxiliaire — calculée DIRECTEMENT depuis le Grand Livre Tiers
// (fna_gl_tiers), groupée par compte collectif + code tiers. Fonctionne
// toujours, indépendamment du rapprochement avec le GL général.
//
// Le rapprochement Σ(auxiliaire par collectif) = solde GL collectif est un
// CONTRÔLE de cohérence (la « communion »), exposé séparément.
import type { GLTiersEntry, TiersCategory } from '../db/schema';
import type { BalanceRow } from './balance';

export interface AuxBalanceRow {
  codeTiers: string;
  labelTiers: string;
  account: string;          // compte collectif (411100, 401000…)
  category: TiersCategory;
  debit: number;
  credit: number;
  solde: number;            // debit - credit
  count: number;            // nb d'écritures du tiers
}

/**
 * Balance auxiliaire : un solde par tiers (clé = compte collectif + code tiers).
 * @param opts.category   filtre par nature (client/fournisseur/...)
 * @param opts.account    filtre par préfixe de compte collectif (ex. "411")
 * @param opts.nonZeroOnly n'inclut que les soldes non nuls (défaut: true)
 */
export function computeBalanceAuxiliaire(
  entries: GLTiersEntry[],
  opts?: { category?: TiersCategory; account?: string; nonZeroOnly?: boolean },
): AuxBalanceRow[] {
  const nonZeroOnly = opts?.nonZeroOnly ?? true;
  const map = new Map<string, AuxBalanceRow>();
  for (const e of entries) {
    if (opts?.category && e.category !== opts.category) continue;
    if (opts?.account && !e.account.startsWith(opts.account)) continue;
    const key = `${e.account}|${e.codeTiers}`;
    let r = map.get(key);
    if (!r) {
      r = {
        codeTiers: e.codeTiers,
        labelTiers: e.labelTiers || e.codeTiers,
        account: e.account,
        category: e.category,
        debit: 0, credit: 0, solde: 0, count: 0,
      };
      map.set(key, r);
    }
    r.debit += e.debit;
    r.credit += e.credit;
    r.count += 1;
    if ((!r.labelTiers || r.labelTiers === r.codeTiers) && e.labelTiers) r.labelTiers = e.labelTiers;
  }
  let rows = Array.from(map.values());
  for (const r of rows) r.solde = r.debit - r.credit;
  if (nonZeroOnly) rows = rows.filter((r) => Math.abs(r.solde) > 0.5);
  return rows.sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
}

export interface AuxTotals {
  debit: number;
  credit: number;
  solde: number;
  nbTiers: number;
}

export function auxTotals(rows: AuxBalanceRow[]): AuxTotals {
  return rows.reduce<AuxTotals>(
    (acc, r) => {
      acc.debit += r.debit;
      acc.credit += r.credit;
      acc.solde += r.solde;
      acc.nbTiers += 1;
      return acc;
    },
    { debit: 0, credit: 0, solde: 0, nbTiers: 0 },
  );
}

export interface ReconciliationRow {
  account: string;          // compte collectif
  soldeGL: number;          // solde du collectif au GL général
  soldeAux: number;         // Σ soldes auxiliaires sur ce collectif
  ecart: number;            // soldeGL - soldeAux
  nbTiers: number;
  ok: boolean;              // |ecart| <= tolérance
}

/**
 * Rapprochement « communion » : pour chaque compte collectif présent dans
 * l'auxiliaire, compare Σ(soldes auxiliaires) au solde du collectif au GL
 * général. Un écart non nul = détail tiers incomplet ou écriture sans tiers.
 */
export function computeTiersReconciliation(
  aux: AuxBalanceRow[],
  glBalance: BalanceRow[],
  tolerance = 1,
): ReconciliationRow[] {
  const auxByAccount = new Map<string, { solde: number; nbTiers: number }>();
  for (const r of aux) {
    const cur = auxByAccount.get(r.account) ?? { solde: 0, nbTiers: 0 };
    cur.solde += r.solde;
    cur.nbTiers += 1;
    auxByAccount.set(r.account, cur);
  }
  const out: ReconciliationRow[] = [];
  for (const [account, agg] of auxByAccount) {
    // Solde GL du collectif : compte exact, sinon somme des sous-comptes (préfixe).
    const exact = glBalance.find((b) => b.account === account);
    const soldeGL = exact
      ? exact.solde
      : glBalance.filter((b) => b.account.startsWith(account)).reduce((s, b) => s + b.solde, 0);
    const ecart = soldeGL - agg.solde;
    out.push({
      account,
      soldeGL,
      soldeAux: agg.solde,
      ecart,
      nbTiers: agg.nbTiers,
      ok: Math.abs(ecart) <= tolerance,
    });
  }
  return out.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
}
