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
  Space, SpaceAction, SpaceCriterion, SpaceDecision, SpaceEvent, SpaceEventType,
  SpaceSnapshot, SpaceSolution, SpaceStatus,
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
  action_overdue: { label: 'Action en retard', icon: '⏰', tone: 'work' },
  deadline_changed: { label: 'Échéance modifiée', icon: '📅', tone: 'work' },
  entry_referenced: { label: 'Pièce référencée', icon: '🧾', tone: 'gl' },
  snapshot_created: { label: 'Snapshot figé', icon: '📸', tone: 'gl' },
  criterion_satisfied: { label: 'Critère satisfait', icon: '🟢', tone: 'life' },
  criterion_reopened: { label: 'Critère rouvert', icon: '🔴', tone: 'life' },
  space_opened: { label: 'Espace ouvert', icon: '🚀', tone: 'life' },
  status_changed: { label: 'Statut modifié', icon: '🔄', tone: 'life' },
  member_added: { label: 'Membre ajouté', icon: '👤', tone: 'life' },
  space_resolved: { label: 'Espace résolu', icon: '🏁', tone: 'life' },
  space_archived: { label: 'Espace archivé', icon: '📦', tone: 'life' },
  proph3t_summary: { label: 'Synthèse Proph3t', icon: '✨', tone: 'ai' },
  proph3t_alert: { label: 'Alerte Vigie Proph3t', icon: '⚠️', tone: 'ai' },
  proph3t_report: { label: 'Rapport de clôture Proph3t', icon: '📄', tone: 'ai' },
};

export const STATUS_META: Record<SpaceStatus, { label: string; color: string }> = {
  ouvert: { label: 'Ouvert', color: '#3b82f6' },
  analyse: { label: 'Analyse', color: '#8b5cf6' },
  action: { label: 'Action', color: '#f59e0b' },
  resolu: { label: 'Résolu', color: '#22c55e' },
  archive: { label: 'Archivé', color: '#737373' },
  abandonne: { label: 'Abandonné', color: '#ef4444' },
};

// ── Vigie (relances automatiques Proph3t) — §8.5 du CDC ────────────────────
// Règles par défaut, cadence en jours :
//  · action en retard          → relance à l'assigné (J+1 = dès dépassement)
//  · +48 h (retard ≥ 2 j)       → escalade au responsable de l'espace
//  · chemin critique bloqué     → alerte espace (l'espace ne peut converger)
// Chaque alerte est idempotente : une clé unique évite les doublons de relance.
export type VigieAlert = {
  key: string;                                  // idempotence (ex. 'overdue:42')
  kind: 'overdue' | 'escalation' | 'critical_block';
  actionId?: number;
  target: string;                               // destinataire (assigné / responsable)
  message: string;
  daysLate: number;
};

function daysBetween(dueDate: string, today: Date): number {
  const [y, m, d] = dueDate.split('-').map((n) => parseInt(n, 10));
  const due = Date.UTC(y, (m || 1) - 1, d || 1);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - due) / 86400000);
}

/**
 * Calcule les relances Vigie À ÉMETTRE pour un espace, en excluant celles déjà
 * présentes (via `existingKeys`). Fonction pure — la matérialisation en
 * événements `proph3t_alert` est faite par l'appelant.
 */
export function runVigie(
  space: Pick<Space, 'status' | 'ownerId'>,
  actions: Array<Pick<SpaceAction, 'id' | 'label' | 'status' | 'dueDate' | 'assignee' | 'isCriticalPath'>>,
  existingKeys: Set<string>,
  today = new Date(),
): VigieAlert[] {
  if (isFrozen(space.status) || space.status === 'resolu') return [];
  const owner = space.ownerId || 'Responsable';
  const out: VigieAlert[] = [];
  for (const a of actions) {
    if (a.status === 'done' || !a.dueDate || a.id === undefined) continue;
    const late = daysBetween(a.dueDate, today);
    if (late < 1) continue;                       // pas encore en retard (J+1)
    const assignee = a.assignee || owner;
    const overdueKey = `overdue:${a.id}`;
    if (!existingKeys.has(overdueKey)) {
      out.push({ key: overdueKey, kind: 'overdue', actionId: a.id, target: assignee, daysLate: late,
        message: `Action « ${a.label} » en retard (${late} j) — relance à ${assignee}.` });
    }
    if (late >= 2) {
      const escKey = `escalation:${a.id}`;
      if (!existingKeys.has(escKey)) {
        out.push({ key: escKey, kind: 'escalation', actionId: a.id, target: owner, daysLate: late,
          message: `Retard ≥ 48 h sur « ${a.label} » — escalade au responsable ${owner}.` });
      }
    }
    if (a.isCriticalPath) {
      const critKey = `critical:${a.id}`;
      if (!existingKeys.has(critKey)) {
        out.push({ key: critKey, kind: 'critical_block', actionId: a.id, target: owner, daysLate: late,
          message: `Chemin critique bloqué : « ${a.label} » en retard — l'espace ne peut converger.` });
      }
    }
  }
  return out;
}

// ── Snapshots : hash SHA-256 du contenu figé (§9.2) ────────────────────────
/** Sérialisation canonique déterministe (clés triées) pour un hash stable. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** SHA-256 hex du payload d'un snapshot (Web Crypto). Deux snapshots identiques
 *  produisent le même hash ; toute différence de données change le hash. */
export async function hashSnapshot(data: unknown): Promise<string> {
  const buf = new TextEncoder().encode(canonicalJson(data));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Rapport de clôture Proph3t (§10) ───────────────────────────────────────
// Assemblage DÉTERMINISTE : les chiffres viennent des données (mode strict
// financier, aucun calcul par LLM). Proph3t ne fait que rédiger l'habillage.
export type ClosureReport = {
  title: string;
  generatedAt: number;
  meta: { anchor: string; owner: string; durationDays: number; convergencePct: number; status: string };
  sections: Array<{ heading: string; rows: string[] }>;
};

const fmtXofI = (v: number) => `${Math.trunc(Math.abs(v)).toLocaleString('fr-FR')} XOF`;
const fmtD = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR') : '—');

export function buildClosureReport(
  space: Space,
  parts: {
    solutions: SpaceSolution[]; actions: SpaceAction[]; decisions: SpaceDecision[];
    events: SpaceEvent[]; snapshots: SpaceSnapshot[]; criteria: SpaceCriterion[];
  },
  now = Date.now(),
): ClosureReport {
  const { solutions, actions, decisions, events, snapshots, criteria } = parts;
  const durationDays = Math.max(0, Math.round((((space.archivedAt ?? now) - space.createdAt) / 86400000)));
  const kept = solutions.filter((s) => s.status === 'kept');
  const discarded = solutions.filter((s) => s.status === 'discarded');
  const doneActions = actions.filter((a) => a.status === 'done');

  // Chronologie : événements structurants, datés.
  const KEY_EVENTS: SpaceEventType[] = [
    'space_opened', 'problem_stated', 'solution_kept', 'decision_approved',
    'entry_referenced', 'snapshot_created', 'criterion_satisfied', 'space_resolved', 'space_archived',
  ];
  const chrono = events
    .filter((e) => KEY_EVENTS.includes(e.eventType))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => `${fmtD(e.createdAt)} — ${EVENT_META[e.eventType]?.label ?? e.eventType}${e.payload?.title ? ` : ${e.payload.title}` : e.payload?.label ? ` : ${e.payload.label}` : ''}`);

  const gapInitial = Math.trunc(Math.abs(space.initialGapXof ?? 0));
  const convergencePct = Math.trunc(space.convergenceBp / 100);
  const gapFinal = gapInitial > 0 ? Math.trunc(gapInitial * (1 - space.convergenceBp / 10000)) : 0;

  const sections: ClosureReport['sections'] = [
    { heading: '1. Problème', rows: [
      space.problemStatement,
      space.problemImpact ? `Impact : ${space.problemImpact}` : '',
      `Origine : ${ANCHOR_META[space.anchorType]?.label ?? space.anchorType} · ${space.anchorRef}`,
    ].filter(Boolean) },
    { heading: '2. Solutions', rows: [
      ...kept.map((s) => `✅ Retenue : ${s.title}${s.proposedBy ? ` (proposée par ${s.proposedBy})` : ''}`),
      ...discarded.map((s) => `🚫 Écartée : ${s.title}${s.statusReason ? ` — motif : ${s.statusReason}` : ' — (sans motif)'}`),
      ...(kept.length + discarded.length === 0 ? ['Aucune solution formalisée.'] : []),
    ] },
    { heading: '3. Chronologie', rows: chrono.length ? chrono : ['(aucun événement structurant)'] },
    { heading: '4. Décisions & validations', rows: decisions.length ? decisions.map((d) =>
      `${d.ref} · ${d.title}${d.amountXof ? ` · ${fmtXofI(d.amountXof)}` : ''} · ${d.status === 'approved' ? 'Approuvée' : d.status === 'rejected' ? 'Rejetée' : 'En attente'} · validation ${d.requiredRoles.join(' puis ')}${(d.approvedBy ?? []).length ? ` (signé : ${(d.approvedBy ?? []).join(', ')})` : ''}`,
    ) : ['Aucune décision de gouvernance.'] },
    { heading: '5. Pièces & snapshots', rows: [
      ...snapshots.map((s) => `📸 ${s.label} · SHA-256 ${s.hashSha256.slice(0, 16)}… · ${fmtD(s.takenAt)}`),
      ...events.filter((e) => e.eventType === 'entry_referenced' && e.payload?.ref).map((e) => `🧾 Pièce référencée : ${e.payload!.ref}`),
      ...(snapshots.length === 0 ? ['Aucun snapshot figé.'] : []),
    ] },
    { heading: '6. Écarts avant / après', rows: gapInitial > 0
      ? [`Écart initial : ${fmtXofI(gapInitial)}`, `Écart résiduel estimé : ${fmtXofI(gapFinal)}`, `Convergence finale : ${convergencePct} %`]
      : [`Convergence finale : ${convergencePct} % (basée sur les critères de sortie)`] },
    { heading: '7. Critères de sortie', rows: criteria.length ? criteria.map((c) =>
      `${c.satisfied ? '🟢' : '🔴'} ${c.label} (${c.kind === 'computed' ? 'calculé' : 'contrôle manuel'})`,
    ) : ['Aucun critère défini.'] },
    { heading: '8. Bilan', rows: [
      `Durée de résolution : ${durationDays} jour(s).`,
      `Actions : ${doneActions.length}/${actions.length} complétées.`,
      `Décisions approuvées : ${decisions.filter((d) => d.status === 'approved').length}.`,
      discarded.length ? `Leçon : ${discarded.length} piste(s) écartée(s) documentée(s) — capitalisable pour des cas similaires.` : 'Leçon : résolution directe sans alternative écartée.',
    ] },
  ];

  return {
    title: `Rapport de clôture — ${space.title}`,
    generatedAt: now,
    meta: {
      anchor: `${ANCHOR_META[space.anchorType]?.label ?? space.anchorType} · ${space.anchorRef}`,
      owner: space.ownerId, durationDays, convergencePct, status: space.status,
    },
    sections,
  };
}

export const ANCHOR_META: Record<string, { label: string; hint: string }> = {
  account_period: { label: 'Compte × période', hint: 'Ex. écart de rapprochement 521100 / 2026-03' },
  reconciliation: { label: 'Rapprochement', hint: 'Justification des suspens d\'une session' },
  partner: { label: 'Tiers', hint: 'Recouvrement créance 411, litige fournisseur 401' },
  journal_entry: { label: 'Écriture', hint: 'Contestation / correction d\'une pièce' },
  closing_period: { label: 'Clôture de période', hint: 'Ex. espace « Clôture Mars 2026 »' },
  budget_line: { label: 'Ligne budgétaire', hint: 'Dépassement à instruire' },
};
