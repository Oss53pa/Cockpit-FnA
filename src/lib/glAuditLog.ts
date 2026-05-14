/**
 * Audit log des modifications a posteriori sur les écritures GL.
 *
 * La chaîne SHA-256 d'origine (lib/auditHash.ts) prouve qu'aucune écriture
 * n'a été altérée depuis son insertion initiale. Mais quand on enrichit
 * une écriture (ajout d'un code tiers via le GL Tiers, correction d'un
 * libellé via l'UI…), cette chaîne est cassée — modification légitime mais
 * traçabilité perdue.
 *
 * Ce module persiste un log immuable de chaque modification : qui, quand,
 * quel champ, ancienne valeur, nouvelle valeur, source de la modification.
 * Le log lui-même est chaîné en SHA-256 par org pour détecter toute
 * insertion/suppression a posteriori dans le log.
 *
 * Table : fna_gl_audit_log (migration 019).
 */

import { dataProvider } from '../db/provider';

export type AuditChange = {
  glEntryId: number;
  field: 'tiers' | 'label' | 'analyticalAxis' | 'analyticalSection' | 'lettrage';
  oldValue: string | undefined;
  newValue: string | undefined;
  reason: 'tiers_import' | 'manual_match' | 'manual_edit' | 'unlettrage';
  sourceKind?: 'TIERS' | 'MANUAL' | 'GL';
  sourceId?: number;
};

// ─── Helper local pour SHA-256 (réutilise crypto.subtle) ─────────────
// On dépend pas directement de auditHash.ts pour rester découpé (ses helpers
// internes sont privés). On fournit une implémentation minimale ici.
async function sha256(input: string): Promise<string> {
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) || null;
  if (!subtle) throw new Error('Web Crypto API non disponible — glAuditLog nécessite crypto.subtle');
  const buffer = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Logge un batch de modifications GL avec chaîne SHA-256.
 *
 * Récupère le dernier `audit_hash` de l'org, calcule la chaîne pour chaque
 * nouveau row, et insère le batch via dataProvider.
 *
 * Non bloquant : si la migration 019 n'est pas appliquée (ou si la table
 * n'existe pas), on log un warning et on continue. L'absence d'audit log
 * ne doit pas faire échouer l'opération métier.
 *
 * @param orgId Organization
 * @param changes Liste des modifications à logger
 * @returns nombre de rows insérés (0 si échec gracieux)
 */
export async function logGLChanges(
  orgId: string,
  changes: AuditChange[],
): Promise<number> {
  if (changes.length === 0) return 0;
  try {
    // Récupère le dernier audit_hash de l'org (chaîne par org)
    let prevHash = '';
    try {
      prevHash = await dataProvider.getLastGLAuditHash?.(orgId) ?? '';
    } catch {
      prevHash = '';
    }
    const now = Date.now();
    const rows: GLAuditLogRow[] = [];
    for (const ch of changes) {
      const canonical = [
        prevHash,
        orgId,
        ch.glEntryId,
        now,
        ch.field,
        ch.oldValue ?? '',
        ch.newValue ?? '',
        ch.reason,
        ch.sourceKind ?? '',
        ch.sourceId ?? 0,
      ].join('||');
      const h = await sha256(canonical);
      rows.push({
        orgId,
        glEntryId: ch.glEntryId,
        changedAt: now,
        field: ch.field,
        oldValue: ch.oldValue,
        newValue: ch.newValue,
        reason: ch.reason,
        sourceKind: ch.sourceKind,
        sourceId: ch.sourceId,
        auditHash: h,
        previousAuditHash: prevHash,
      });
      prevHash = h;
    }
    if (dataProvider.bulkInsertGLAuditLog) {
      await dataProvider.bulkInsertGLAuditLog(rows);
    }
    return rows.length;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[glAuditLog] logging non bloquant a échoué :', e);
    return 0;
  }
}

// Type local (le type complet est dans db/schema.ts)
export type GLAuditLogRow = {
  orgId: string;
  glEntryId: number;
  changedAt: number;
  field: AuditChange['field'];
  oldValue?: string;
  newValue?: string;
  reason: AuditChange['reason'];
  sourceKind?: AuditChange['sourceKind'];
  sourceId?: number;
  auditHash: string;
  previousAuditHash: string;
};

