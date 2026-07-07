// Espace Collaboratif — moteur de résolution de problèmes
// -------------------------------------------------------------------------
// Règles d'or (cahier des charges Espace Collaboratif v1.0) :
//  1. La convergence est CALCULÉE côté moteur, jamais saisie. Stockée en points
//     de base entiers (0-10000) — arithmétique entière, aucun float.
//  2. Le fil d'événements est append-only : une correction = un nouvel événement.
//  3. La clôture (resolu) est VERROUILLÉE tant que tous les critères de sortie
//     ne sont pas satisfaits, dont au moins un critère au total.
//  4. Les décisions sont gouvernées par une matrice de seuils FCFA (montants
//     entiers XOF) résolue au moment de la proposition.
import type {
  Space, SpaceAction, SpaceCriterion, SpaceEventType, SpaceStatus,
} from '../db/schema';

// ── Convergence (points de base, jamais saisie) ───────────────────────────
/**
 * Convergence en points de base (0-10000).
 * - Si l'espace a un écart initial figé ET qu'un écart courant est fourni :
 *   bp = 10000 − (ecart_restant × 10000 / ecart_initial) — division entière,
 *   arrondi au point de base inférieur, borné [0, 10000].
 * - Sinon : ratio des critères satisfaits (criteres_ok × 10000 / criteres_total).
 */
export function computeConvergenceBp(
  space: Pick<Space, 'initialGapXof'>,
  criteria: Pick<SpaceCriterion, 'satisfied'>[],
  currentGapXof?: number,
): number {
  const initial = Math.trunc(Math.abs(space.initialGapXof ?? 0));
  if (initial > 0 && currentGapXof !== undefined && Number.isFinite(currentGapXof)) {
    const remaining = Math.trunc(Math.abs(currentGapXof));
    const consumedBp = Math.trunc((remaining * 10000) / initial);
    return Math.max(0, Math.min(10000, 10000 - consumedBp));
  }
  if (criteria.length === 0) return 0;
  const ok = criteria.filter((c) => c.satisfied).length;
  return Math.max(0, Math.min(10000, Math.trunc((ok * 10000) / criteria.length)));
}

/** Formule affichée à côté de la convergence (transparence « calculé · jamais saisie »). */
export function convergenceFormula(space: Pick<Space, 'initialGapXof'>): string {
  if ((space.initialGapXof ?? 0) > 0) return '10000 − (écart restant × 10000 / écart initial)';
  return 'critères satisfaits × 10000 / critères totaux';
}

// ── Verrou de clôture ──────────────────────────────────────────────────────
/** La transition vers `resolu` exige TOUS les critères satisfaits (≥ 1 critère). */
export function canResolve(criteria: Pick<SpaceCriterion, 'satisfied'>[]): boolean {
  return criteria.length > 0 && criteria.every((c) => c.satisfied);
}

// ── Machine à états ────────────────────────────────────────────────────────
// ouvert → analyse → action → resolu → archive ; abandonne accessible depuis
// ouvert/analyse/action (motif obligatoire, tracé).
const TRANSITIONS: Record<SpaceStatus, SpaceStatus[]> = {
  ouvert: ['analyse', 'abandonne'],
  analyse: ['action', 'ouvert', 'abandonne'],
  action: ['resolu', 'analyse', 'abandonne'],
  resolu: ['archive', 'action'],
  archive: [],
  abandonne: [],
};

export function nextStatuses(status: SpaceStatus): SpaceStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransition(from: SpaceStatus, to: SpaceStatus): boolean {
  return nextStatuses(from).includes(to);
}

/** Un espace archivé ou abandonné est gelé en lecture seule. */
export function isFrozen(status: SpaceStatus): boolean {
  return status === 'archive' || status === 'abandonne';
}

// ── Décisions : matrice de validation par seuils (XOF entiers) ─────────────
export type ApprovalRule = { decisionType: string; minAmountXof: number; requiredRoles: string[] };

/** Matrice par défaut (paramétrable par org à terme). Ordre : seuil décroissant. */
export const DEFAULT_APPROVAL_MATRIX: ApprovalRule[] = [
  { decisionType: 'passage_en_perte', minAmountXof: 10_000_000, requiredRoles: ['DAF', 'DG'] },
  { decisionType: 'passage_en_perte', minAmountXof: 0, requiredRoles: ['DAF'] },
  { decisionType: 'abattement', minAmountXof: 1_000_000, requiredRoles: ['DAF'] },
  { decisionType: 'abattement', minAmountXof: 0, requiredRoles: ['Comptable'] },
  { decisionType: 'regularisation', minAmountXof: 1_000_000, requiredRoles: ['DAF'] },
  { decisionType: 'regularisation', minAmountXof: 0, requiredRoles: ['Comptable'] },
  { decisionType: 'report', minAmountXof: 0, requiredRoles: ['Comptable'] },
  { decisionType: 'methode_comptable', minAmountXof: 0, requiredRoles: ['DAF'] },
];

export const DECISION_TYPES: { value: string; label: string }[] = [
  { value: 'regularisation', label: 'Régularisation' },
  { value: 'abattement', label: 'Abattement' },
  { value: 'passage_en_perte', label: 'Passage en perte' },
  { value: 'report', label: 'Report' },
  { value: 'methode_comptable', label: 'Méthode comptable' },
];

/** Résout les rôles requis pour une décision (règle au seuil le plus élevé atteint). */
export function requiredRolesFor(
  decisionType: string,
  amountXof: number | undefined,
  matrix: ApprovalRule[] = DEFAULT_APPROVAL_MATRIX,
): string[] {
  const amount = Math.trunc(Math.abs(amountXof ?? 0));
  const rules = matrix
    .filter((r) => r.decisionType === decisionType && amount >= r.minAmountXof)
    .sort((a, b) => b.minAmountXof - a.minAmountXof);
  return rules[0]?.requiredRoles ?? ['Comptable'];
}

/** Explication en clair de la règle appliquée (affichée dans l'UI de la décision). */
export function approvalRuleLabel(decisionType: string, amountXof: number | undefined): string {
  const roles = requiredRolesFor(decisionType, amountXof);
  const amount = Math.trunc(Math.abs(amountXof ?? 0));
  const typeLabel = DECISION_TYPES.find((t) => t.value === decisionType)?.label ?? decisionType;
  return `${typeLabel} · ${amount.toLocaleString('fr-FR')} XOF → validation ${roles.join(' puis ')} requise`;
}

/** Référence lisible DEC-AAAA-NNN (séquence par org, calculée depuis l'existant). */
export function nextDecisionRef(year: number, existingRefs: string[]): string {
  const prefix = `DEC-${year}-`;
  const max = existingRefs
    .filter((r) => r.startsWith(prefix))
    .map((r) => parseInt(r.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ── Actions : retards & chemin critique ────────────────────────────────────
export function isOverdue(action: Pick<SpaceAction, 'status' | 'dueDate'>, today = new Date()): boolean {
  if (action.status === 'done' || !action.dueDate) return false;
  const ref = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return action.dueDate < ref;
}

// ── Méta des événements (affichage du fil unifié) ──────────────────────────
export const EVENT_META: Record<SpaceEventType, { label: string; icon: string; tone: 'neutral' | 'method' | 'work' | 'gl' | 'gov' | 'life' | 'ai' }> = {
  message: { label: 'Message', icon: '💬', tone: 'neutral' },
  problem_stated: { label: 'Problème énoncé', icon: '🎯', tone: 'method' },
  solution_proposed: { label: 'Solution proposée', icon: '💡', tone: 'method' },
  solution_kept: { label: 'Solution retenue', icon: '✅', tone: 'method' },
  solution_discarded: { label: 'Solution écartée', icon: '🚫', tone: 'method' },
  decision_proposed: { label: 'Décision proposée', icon: '⚖️', tone: 'gov' },
  decision_approved: { label: 'Décision approuvée', icon: '🖋️', tone: 'gov' },
  decision_rejected: { label: 'Décision rejetée', icon: '❌', tone: 'gov' },
  action_created: { label: 'Action créée', icon: '📋', tone: 'work' },
  action_completed: { label: 'Action complétée', icon: '☑️', tone: 'work' },
  deadline_changed: { label: 'Échéance modifiée', icon: '📅', tone: 'work' },
  entry_referenced: { label: 'Pièce référencée', icon: '🧾', tone: 'gl' },
  criterion_satisfied: { label: 'Critère satisfait', icon: '🟢', tone: 'life' },
  criterion_reopened: { label: 'Critère rouvert', icon: '🔴', tone: 'life' },
  space_opened: { label: 'Espace ouvert', icon: '🚀', tone: 'life' },
  status_changed: { label: 'Statut modifié', icon: '🔄', tone: 'life' },
  member_added: { label: 'Membre ajouté', icon: '👤', tone: 'life' },
  space_resolved: { label: 'Espace résolu', icon: '🏁', tone: 'life' },
  space_archived: { label: 'Espace archivé', icon: '📦', tone: 'life' },
  proph3t_summary: { label: 'Synthèse Proph3t', icon: '✨', tone: 'ai' },
  proph3t_alert: { label: 'Alerte Proph3t', icon: '⚠️', tone: 'ai' },
};

export const STATUS_META: Record<SpaceStatus, { label: string; color: string }> = {
  ouvert: { label: 'Ouvert', color: '#3b82f6' },
  analyse: { label: 'Analyse', color: '#8b5cf6' },
  action: { label: 'Action', color: '#f59e0b' },
  resolu: { label: 'Résolu', color: '#22c55e' },
  archive: { label: 'Archivé', color: '#737373' },
  abandonne: { label: 'Abandonné', color: '#ef4444' },
};

export const ANCHOR_META: Record<string, { label: string; hint: string }> = {
  account_period: { label: 'Compte × période', hint: 'Ex. écart de rapprochement 521100 / 2026-03' },
  reconciliation: { label: 'Rapprochement', hint: 'Justification des suspens d\'une session' },
  partner: { label: 'Tiers', hint: 'Recouvrement créance 411, litige fournisseur 401' },
  journal_entry: { label: 'Écriture', hint: 'Contestation / correction d\'une pièce' },
  closing_period: { label: 'Clôture de période', hint: 'Ex. espace « Clôture Mars 2026 »' },
  budget_line: { label: 'Ligne budgétaire', hint: 'Dépassement à instruire' },
};
