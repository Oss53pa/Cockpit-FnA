/**
 * Audit trail — chaînage SHA-256 des écritures comptables.
 *
 * Chaque écriture du Grand Livre porte un `hash` calculé à partir de :
 *   - Le hash de l'écriture précédente (`previousHash`)
 *   - Les champs canoniques de l'écriture (id, date, journal, piece, lignes triées)
 *
 * Si UNE seule écriture est altérée a posteriori (modification d'un montant, d'une
 * date, d'un compte), tous les hashes suivants deviennent invalides — la fonction
 * `verifyChain` permet de détecter exactement à quelle écriture la chaîne casse.
 *
 * Conformité :
 *   - SYSCOHADA art. 17 : conservation des pièces comptables intègres
 *   - AUDCIF : traçabilité et inaltérabilité des données financières
 *   - RGPD : pseudonymisation possible des libellés sensibles avant hash
 *
 * Implémentation : Web Crypto API (`crypto.subtle`) — pas de dépendance externe.
 */

import type { GLEntry } from '../db/schema';

/**
 * Représentation hashable d'une ligne d'écriture.
 * Tous les champs critiques pour l'intégrité comptable sont inclus.
 */
export interface HashableEntry {
  id: number | string;
  date: string;
  journal: string;
  piece: string;
  account: string;
  label: string;
  debit: number;
  credit: number;
  tiers?: string;
}

/** Résultat de vérification d'une chaîne d'écritures. */
export interface VerifyResult {
  /** True si toutes les écritures ont un hash cohérent avec la précédente. */
  valid: boolean;
  /** ID de l'écriture où la chaîne casse (si invalid). */
  brokenAt?: string;
  /** Index dans le tableau d'origine (si invalid). */
  brokenIndex?: number;
  /** Nombre total d'écritures vérifiées. */
  count: number;
  /** Hash final de la chaîne (utile pour comparer entre exports). */
  finalHash?: string;
}

// ── Helpers internes ─────────────────────────────────────────────────

/**
 * Sérialise une écriture en chaîne canonique stable.
 * L'ordre des champs et le formatage sont déterministes — deux écritures
 * identiques produisent toujours le même hash.
 */
function canonicalize(entry: HashableEntry): string {
  // Format pipe-séparé, champs dans un ordre stable.
  // Les nombres sont représentés sans notation scientifique pour eviter les
  // variations selon le moteur JS.
  return [
    String(entry.id),
    entry.date,
    entry.journal || '',
    entry.piece || '',
    entry.account,
    entry.label || '',
    entry.debit.toFixed(2),
    entry.credit.toFixed(2),
    entry.tiers || '',
  ].join('|');
}

/**
 * Calcule SHA-256 d'une string et retourne l'hexadécimal.
 * Compatible navigateur (crypto.subtle) et Node 16+.
 */
async function sha256Hex(input: string): Promise<string> {
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) || null;
  if (!subtle) {
    throw new Error('Web Crypto API non disponible — auditHash nécessite crypto.subtle');
  }
  const buffer = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── API publique ─────────────────────────────────────────────────────

/**
 * Calcule le hash d'une seule écriture, en chaînant avec le previousHash.
 *
 * @param entry         L'écriture à hasher
 * @param previousHash  Hash de l'écriture précédente dans la chaîne, ou '' pour la première
 * @returns             Hash hexadécimal SHA-256 (64 caractères)
 *
 * @example
 *   const h1 = await hashEntry({ id: 1, date: '2026-01-15', ... }, '');
 *   const h2 = await hashEntry({ id: 2, date: '2026-01-16', ... }, h1);
 */
export async function hashEntry(entry: HashableEntry, previousHash: string): Promise<string> {
  const canonical = `${previousHash}||${canonicalize(entry)}`;
  return sha256Hex(canonical);
}

/**
 * Calcule le hash de toutes les écritures d'une chaîne (utile pour batch
 * insertions ou recalcul après import).
 *
 * @returns Tableau parallèle à `entries` avec le hash de chaque écriture
 */
export async function hashChain(entries: HashableEntry[], initialHash = ''): Promise<string[]> {
  const hashes: string[] = [];
  let prev = initialHash;
  for (const entry of entries) {
    const h = await hashEntry(entry, prev);
    hashes.push(h);
    prev = h;
  }
  return hashes;
}

/**
 * Vérifie l'intégrité d'une chaîne d'écritures.
 * Recalcule chaque hash et compare avec celui stocké.
 *
 * @param entries  Écritures avec leurs hash et previousHash stockés
 * @returns        Résultat avec `valid: true` si tout matche, sinon `brokenAt`
 *
 * @example
 *   const entries = await db.gl.toArray();
 *   const result = await verifyChain(entries);
 *   if (!result.valid) {
 *     console.error(`Chaîne cassée à l'écriture ${result.brokenAt}`);
 *   }
 */
export async function verifyChain(
  entries: Array<HashableEntry & { hash?: string; previousHash?: string }>,
  initialHash = '',
): Promise<VerifyResult> {
  let prev = initialHash;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.hash) {
      return {
        valid: false,
        brokenAt: String(entry.id),
        brokenIndex: i,
        count: i,
      };
    }
    // Vérification du chaînage : previousHash stocké == prev calculé
    if (entry.previousHash !== undefined && entry.previousHash !== prev) {
      return {
        valid: false,
        brokenAt: String(entry.id),
        brokenIndex: i,
        count: i,
      };
    }
    // Recalcul du hash et comparaison
    const expected = await hashEntry(entry, prev);
    if (expected !== entry.hash) {
      return {
        valid: false,
        brokenAt: String(entry.id),
        brokenIndex: i,
        count: i,
      };
    }
    prev = entry.hash;
  }
  return { valid: true, count: entries.length, finalHash: prev };
}

/**
 * Helper : signe un GLEntry Dexie en lui ajoutant hash + previousHash.
 * À appeler avant `db.gl.add()` dans le pipeline d'import.
 */
export async function signGLEntry(
  entry: GLEntry,
  previousHash: string,
): Promise<GLEntry & { hash: string; previousHash: string }> {
  const hashable: HashableEntry = {
    id: entry.id ?? `${entry.orgId}-${entry.date}-${entry.account}-${entry.piece}`,
    date: entry.date,
    journal: entry.journal,
    piece: entry.piece,
    account: entry.account,
    label: entry.label,
    debit: entry.debit,
    credit: entry.credit,
    tiers: entry.tiers,
  };
  const hash = await hashEntry(hashable, previousHash);
  return { ...entry, hash, previousHash };
}
