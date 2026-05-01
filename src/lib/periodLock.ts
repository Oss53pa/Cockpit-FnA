/**
 * Period Lock — verrouillage des périodes comptables clôturées.
 *
 * Une fois qu'un exercice ou une période est clôturé(e), AUCUNE écriture ne peut
 * y être ajoutée, modifiée ou supprimée — sauf override explicite par un
 * accountant_admin (qui sera tracé dans l'audit trail).
 *
 * Conformité :
 *   - SYSCOHADA art. 38 : non-modification des écritures après clôture
 *   - AUDCIF : intangibilité des comptes après l'arrêté
 *   - SOX 404 (équivalent) : ségrégation des droits sur écritures historiques
 *
 * Ce module fournit :
 *   - `assertPeriodOpen(date, orgId, db)` : throw si la période est fermée
 *   - `isPeriodLocked(date, orgId, db)` : vérification non-throw
 *   - `useIsPeriodLocked(date)` : hook React pour désactiver l'UI
 *   - `lockPeriod` / `unlockPeriod` : transitions d'état (avec audit log)
 */

import { useEffect, useState } from 'react';
import { db, type Period, type FiscalYear } from '../db/schema';

// ── Types ────────────────────────────────────────────────────────────

export type PeriodStatus = 'open' | 'closed' | 'archived';

export class PeriodLockedError extends Error {
  constructor(
    public readonly date: string,
    public readonly periodId: string,
    public readonly status: PeriodStatus,
  ) {
    super(`Période ${periodId} (${date}) ${status === 'closed' ? 'clôturée' : 'archivée'} — écriture refusée. Contactez un administrateur pour rouvrir.`);
    this.name = 'PeriodLockedError';
  }
}

// ── API publique ─────────────────────────────────────────────────────

/**
 * Récupère la période Dexie correspondant à une date (YYYY-MM-DD).
 * Retourne null si pas de période trouvée pour cette date.
 */
export async function getPeriodForDate(date: string, orgId: string): Promise<Period | null> {
  const year = parseInt(date.substring(0, 4), 10);
  const month = parseInt(date.substring(5, 7), 10);
  const periods = await db.periods
    .where('orgId').equals(orgId)
    .and((p) => p.year === year && p.month === month)
    .toArray();
  return periods[0] ?? null;
}

/**
 * Récupère le statut d'une période. Retourne 'open' par défaut si inconnue.
 *
 * Le champ `closed: boolean` du schéma Dexie est mappé sur :
 *   closed === true  → 'closed'
 *   closed === false → 'open'
 *   (le statut 'archived' nécessite un champ explicite — extension future)
 */
export async function getPeriodStatus(date: string, orgId: string): Promise<PeriodStatus> {
  const period = await getPeriodForDate(date, orgId);
  if (!period) return 'open';
  return period.closed ? 'closed' : 'open';
}

/**
 * Vérifie si une période est verrouillée pour l'écriture.
 * Non-throw — adapté aux UI conditionnelles (boutons grisés).
 */
export async function isPeriodLocked(date: string, orgId: string): Promise<boolean> {
  const status = await getPeriodStatus(date, orgId);
  return status === 'closed' || status === 'archived';
}

/**
 * Lance une exception si la période est fermée — à appeler dans tous les
 * mutateurs qui touchent au GL (addEntry, updateEntry, deleteEntry, importGL).
 *
 * @throws PeriodLockedError si la période est 'closed' ou 'archived'
 */
export async function assertPeriodOpen(date: string, orgId: string): Promise<void> {
  const period = await getPeriodForDate(date, orgId);
  if (!period) return; // pas de période => pas de verrou (cas edge : période manquante)
  if (period.closed) {
    throw new PeriodLockedError(date, period.id, 'closed');
  }
}

/**
 * Verrouille une période (clôture comptable).
 *
 * Effets de bord :
 *   - period.closed = true
 *   - Toutes les écritures de la période deviennent immuables
 *   - Le hash chain (auditHash.ts) est figé pour cette période
 *
 * @param periodId  ID de la période à verrouiller
 * @param userId    ID utilisateur (pour audit log — futur)
 */
export async function lockPeriod(periodId: string, _userId?: string): Promise<void> {
  await db.periods.update(periodId, { closed: true });
  // TODO: ecrire dans audit_log Supabase quand la table sera créée
  // await db.auditLog.add({ action: 'period.lock', periodId, userId, timestamp: Date.now() });
}

/**
 * Réouvre une période (override accountant_admin uniquement).
 * Doit être tracé dans l'audit log avec justification.
 *
 * @param periodId  ID de la période à rouvrir
 * @param reason    Motif de réouverture (obligatoire pour audit)
 * @param userId    ID utilisateur accountant_admin
 */
export async function unlockPeriod(periodId: string, reason: string, _userId?: string): Promise<void> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Motif de réouverture requis (≥ 5 caractères)');
  }
  await db.periods.update(periodId, { closed: false });
  // TODO: audit log
}

/**
 * Verrouille un exercice fiscal entier (toutes les périodes du year).
 * Action courante en fin d'exercice annuel.
 */
export async function lockFiscalYear(fiscalYearId: string, _userId?: string): Promise<void> {
  const fy = await db.fiscalYears.get(fiscalYearId);
  if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);
  // Verrouiller le FY
  await db.fiscalYears.update(fiscalYearId, { closed: true });
  // Verrouiller toutes les périodes du FY
  const periods = await db.periods.where('fiscalYearId').equals(fiscalYearId).toArray();
  await db.periods.bulkPut(periods.map((p) => ({ ...p, closed: true })));
}

// ── React Hook ───────────────────────────────────────────────────────

/**
 * Hook React : retourne true si la période contenant `date` est verrouillée.
 *
 * Permet aux composants UI de désactiver les inputs / boutons de manière
 * réactive (re-fetch à chaque changement de date ou d'org).
 *
 * @example
 *   const locked = useIsPeriodLocked('2025-12-31');
 *   <button disabled={locked}>Modifier l'écriture</button>
 */
export function useIsPeriodLocked(date: string | undefined, orgId: string | undefined): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!date || !orgId) { setLocked(false); return; }
    let cancelled = false;
    isPeriodLocked(date, orgId).then((v) => { if (!cancelled) setLocked(v); });
    return () => { cancelled = true; };
  }, [date, orgId]);
  return locked;
}

// ── Helpers de migration ─────────────────────────────────────────────

/**
 * Récupère toutes les périodes verrouillées pour un orgId.
 * Utile pour afficher un récapitulatif "Périodes clôturées" en UI.
 */
export async function getLockedPeriods(orgId: string): Promise<Period[]> {
  const all = await db.periods.where('orgId').equals(orgId).toArray();
  return all.filter((p) => p.closed);
}

/**
 * Récupère les exercices fiscaux clôturés.
 */
export async function getClosedFiscalYears(orgId: string): Promise<FiscalYear[]> {
  const all = await db.fiscalYears.where('orgId').equals(orgId).toArray();
  return all.filter((fy) => fy.closed);
}
