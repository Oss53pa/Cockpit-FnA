import Dexie, { Table } from 'dexie';

export type AccountingSystem = 'Normal' | 'Allégé' | 'SMT';

/**
 * Système de plan comptable applicable à l'org. Détermine comment classifier
 * les comptes (racine de classe, comptes parents, etc.) — utilisé par le
 * rapprochement tiers, la balance, les KPI. Cf. src/engine/accountingSystems.ts.
 */
export type CoaSystem = 'SYSCOHADA' | 'PCG_FR' | 'IFRS' | 'US_GAAP';

export type Organization = {
  id: string;
  name: string;
  currency: string;
  sector: string;
  accountingSystem?: AccountingSystem; // Normal (défaut) / Allégé (PME) / SMT (TPE)
  /**
   * Plan comptable de l'org. Défaut : SYSCOHADA (Afrique de l'Ouest).
   * Détermine la logique de classification des comptes (classRoot, isParent).
   */
  coaSystem?: CoaSystem;
  rccm?: string;
  ifu?: string;
  address?: string;
  createdAt: number;
  /**
   * Rôle de l'utilisateur courant DANS cette org (issu de fna_user_orgs).
   * Renseigné par SupabaseProvider.getOrganizations() qui JOIN fna_user_orgs.
   * Optionnel : absent en mode démo / Dexie cache / Electron.
   */
  role?: 'admin' | 'editor' | 'viewer';
};

export type FiscalYear = {
  id: string;
  orgId: string;
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  closed: boolean;
};

export type Period = {
  id: string;
  orgId: string;
  fiscalYearId: string;
  year: number;
  month: number;      // 1..12 (13 = inventaire)
  label: string;      // 'Mars 2026'
  closed: boolean;
};

export type Account = {
  code: string;       // compte (ex: "411001")
  orgId: string;
  label: string;
  syscoCode?: string; // compte SYSCOHADA mappé (ex: "411")
  class: string;
  type: 'A' | 'P' | 'C' | 'R' | 'X';
};

export type GLEntry = {
  id?: number;
  orgId: string;
  periodId: string;
  date: string;           // YYYY-MM-DD
  journal: string;        // code journal (VT, AC, OD, BQ...)
  piece: string;          // n° de pièce
  account: string;        // compte mouvementé
  label: string;          // libellé écriture
  debit: number;
  credit: number;
  tiers?: string;         // code tiers (client/fournisseur)
  analyticalAxis?: string;
  analyticalSection?: string;
  lettrage?: string;
  importId?: string;
  // Audit trail SHA-256 (cf. lib/auditHash.ts) — optionnels pour rétro-compat
  // sur les bases existantes. Les nouvelles écritures doivent toujours en avoir.
  hash?: string;          // SHA-256 hex (64 chars) calculé via signGLEntry()
  previousHash?: string;  // hash de l'écriture précédente dans la chaîne
};

export type ImportLog = {
  id?: number;
  orgId: string;
  date: number;           // timestamp
  user: string;
  fileName: string;
  fileHash?: string;
  source: string;         // SAGE / PERFECTO / ...
  kind: 'GL' | 'BUDGET' | 'COA' | 'BALANCE' | 'TIERS' | 'IMMO' | 'ANALYTIC_AXES' | 'ANALYTIC_CODES';
  // Métadonnées optionnelles selon le type d'import
  year?: number;         // BUDGET : année de l'exercice
  version?: string;      // BUDGET : nom de la version
  count: number;
  rejected: number;
  status: 'success' | 'partial' | 'error';
  report?: string;        // JSON des erreurs
};

export type BudgetLine = {
  id?: number;
  orgId: string;
  year: number;
  version: string;        // V1, V2, forecast
  account: string;
  month: number;          // 1..12
  amount: number;
  analyticalAxis?: string;
  analyticalSection?: string;
};

export type AccountMapping = {
  orgId: string;
  sourceCode: string;      // code dans le fichier source
  targetCode: string;      // compte SYSCOHADA cible
};

/**
 * Audit log : trace immuable de chaque modification a posteriori sur une
 * écriture GL (post-insertion). Chaîné SHA-256 par org pour détecter toute
 * insertion/suppression a posteriori dans le log lui-même.
 */
export type GLAuditLogEntry = {
  id?: number;
  orgId: string;
  glEntryId: number;
  changedAt: number;        // timestamp ms
  changedBy?: string;
  field: 'tiers' | 'label' | 'analyticalAxis' | 'analyticalSection' | 'lettrage';
  oldValue?: string;
  newValue?: string;
  reason: 'tiers_import' | 'manual_match' | 'manual_edit' | 'unlettrage';
  sourceKind?: 'TIERS' | 'MANUAL' | 'GL';
  sourceId?: number;
  auditHash: string;
  previousAuditHash: string;
};

/**
 * Ligne de GL Tiers qui n'a pas pu être rapprochée d'une écriture GL
 * existante lors de l'import. Persistée pour révision manuelle.
 *
 * Le GL Tiers ne crée jamais d'écritures dans fna_gl_entries — il enrichit
 * uniquement avec le code tiers. Les lignes orphelines atterrissent ici
 * avec leur contexte complet + un motif (no_candidate, tiers_conflict,
 * ambiguous) pour que le comptable puisse les arbitrer.
 */
export type TiersUnmatched = {
  id?: number;
  orgId: string;
  importId?: number;
  rowIndex: number;          // n° de ligne dans le fichier source
  date: string;              // YYYY-MM-DD
  account: string;
  codeTiers: string;
  labelTiers?: string;
  debit: number;
  credit: number;
  journal?: string;
  piece?: string;
  label?: string;
  reason: 'no_candidate' | 'tiers_conflict' | 'ambiguous';
  candidateIds?: number[];   // si reason === 'ambiguous'
  // Résolution manuelle (null = en attente)
  resolvedAt?: number;       // timestamp ms
  resolvedBy?: string;       // auth.uid() ou user identifier
  resolvedTo?: number;       // id de l'écriture GL liée si matched
  resolution?: 'matched' | 'dismissed' | 'manual_create';
  createdAt: number;
};

/**
 * Catégorie de tiers SYSCOHADA (classe 4), dérivée du compte collectif.
 *   client (41) · fournisseur (40) · personnel (42) · etat (43-44) · autres (45-48)
 */
export type TiersCategory = 'client' | 'fournisseur' | 'personnel' | 'etat' | 'autres';

/**
 * Écriture du GRAND LIVRE TIERS (livre auxiliaire) — détail par tiers individuel
 * du compte collectif (411/401/42…). Stockée comme un VRAI livre, indépendant du
 * GL général : c'est la source des balances auxiliaires (groupées par compte +
 * code tiers). Le rapprochement Σ(auxiliaire par collectif) = solde GL collectif
 * sert de contrôle de cohérence (la « communion »), pas de prérequis.
 */
export type GLTiersEntry = {
  id?: number;
  orgId: string;
  importId?: number;        // import TIERS source (fna_imports.id)
  periodId?: string;        // journalisation : période rattachée (déduite de la date)
  date: string;             // YYYY-MM-DD
  account: string;          // compte collectif (411100, 401000…)
  codeTiers: string;        // code tiers individuel (CLI001, FRN042…)
  labelTiers?: string;      // nom du tiers
  label?: string;           // libellé écriture
  debit: number;
  credit: number;
  journal?: string;
  piece?: string;
  category: TiersCategory;  // dérivée du compte (filtrage rapide par nature)
  createdAt: number;
};

/**
 * Règle de correction tiers MÉMORISÉE. Issue d'une correction manuelle d'une
 * incohérence du rapprochement (écriture de classe 4 sans code tiers) :
 *   • action 'assign' : « compte (+ libellé contient) → poser le code tiers X ».
 *     Réappliquée automatiquement après chaque import GL pour ne pas refaire la
 *     correction à la main.
 *   • action 'ignore' : marque l'écart comme justifié (régularisation, OD…) →
 *     exclu de l'écart du rapprochement, avec un motif.
 */
export type TiersRule = {
  id?: number;
  orgId: string;
  account: string;            // compte GL ciblé (match exact)
  labelContains?: string;     // optionnel : le libellé doit contenir ce motif (insensible casse)
  action: 'assign' | 'ignore';
  tiers?: string;             // action 'assign' : code tiers à poser
  tiersLabel?: string;        // action 'assign' : libellé tiers (optionnel)
  reason?: string;            // justification (action 'ignore') ou note libre
  createdAt: number;
  createdBy?: string;
};

export type ReportDoc = {
  id?: number;
  orgId: string;
  title: string;
  type: string;
  author: string;
  status: 'draft' | 'review' | 'approved' | 'diffused';
  createdAt: number;
  updatedAt: number;
  content?: string;
};

export type AttentionPoint = {
  id?: number;
  orgId: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';        // probabilité d'occurrence
  category: string;                                // Financier, Comptable, Fiscal, Opérationnel...
  source?: string;                                  // ratio, compte, section concernée
  owner?: string;                                   // responsable du point
  detectedAt: number;
  detectedBy?: string;                              // personne qui a détecté
  targetResolutionDate?: string;                    // date cible de résolution (YYYY-MM-DD)
  estimatedFinancialImpact?: number;                // en XOF
  impactDescription?: string;
  rootCause?: string;                               // cause racine
  recommendation?: string;                          // recommandation
  tags?: string[];
  status: 'open' | 'in_progress' | 'resolved' | 'ignored' | 'escalated';
  resolvedAt?: number;
  resolvedNote?: string;
  lastReviewedAt?: number;
  journal?: string;                                 // historique / commentaires
};

export type ActionPlan = {
  id?: number;
  orgId: string;
  attentionPointId?: number;
  title: string;
  description?: string;
  // Responsabilité
  owner: string;                                    // responsable principal
  team?: string;                                    // équipe
  sponsor?: string;                                 // sponsor / donneur d'ordre
  // Dates
  startDate?: string;                               // YYYY-MM-DD
  dueDate?: string;                                 // YYYY-MM-DD
  reviewDate?: string;                              // date de revue
  // Pilotage
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'doing' | 'done' | 'blocked' | 'cancelled';
  progress: number;                                 // 0-100
  // Ressources
  budgetAllocated?: number;                         // XOF
  resourcesNeeded?: string;
  // Valeur
  deliverables?: string;                            // livrables attendus
  successCriteria?: string;                         // KPIs / critères de succès
  estimatedImpact?: string;
  // Suivi
  dependencies?: string;                            // autres actions nécessaires avant
  blockers?: string;                                // éléments bloquants actuels
  journal?: string;                                 // historique
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type ReportTemplate = {
  id?: number;
  orgId: string;
  name: string;
  description?: string;
  config: string;            // JSON sérialisé du report (blocks, identity, palette, format)
  createdAt: number;
  updatedAt: number;
};

// ── Comptabilité analytique multi-axes ──────────────────────────────────
//
// MODÈLE WBS CONDITIONNEL (Option A — branches sémantiques)
// ──────────────────────────────────────────────────────────
// L'app supporte maintenant un modèle hybride :
//   - Axe 1 (commun)        : Code Projet (toujours)
//   - Axe 2/3 conditionnels selon `branch` :
//       * 'revenue'        → Centre de revenu / Type de centre
//       * 'project_cost'   → CC ou Tâche / Code de gestion ou Ressource
//       * 'overhead'       → Cost Center FG / Code FG
//
// Si `branch` est undefined sur un code, il est universel (compatible avec
// toutes les lignes — comportement legacy avant cette refonte).
//
// La branche d'une ligne GL est dérivée par `inferBranch()` (cf.
// engine/analyticBranch.ts) à partir du compte (7x = revenue, 6x avec
// projet = project_cost, 6x sans projet = overhead).
export type AnalyticBranch = 'revenue' | 'project_cost' | 'overhead';

export type AnalyticAxis = {
  id: string;
  orgId: string;
  number: number;           // 1 à 5
  name: string;             // ex: "Projet", "Centre de coût"
  codeName: string;         // ex: "Code projet"
  required: boolean;
  active: boolean;
};

export type AnalyticCode = {
  id: string;
  orgId: string;
  axisId: string;
  code: string;             // ex: "IB005", "P0402"
  shortLabel: string;
  longLabel: string;
  parentId?: string;
  active: boolean;
  order: number;
  /**
   * Branche WBS à laquelle ce code appartient. Undefined = code universel
   * (peut être affecté à n'importe quelle ligne — comportement legacy).
   * Si défini, le code ne peut être affecté qu'à une ligne dont la branche
   * inferred matche.
   */
  branch?: AnalyticBranch;
};

export type AnalyticRule = {
  id: string;
  orgId: string;
  name: string;
  priority: number;
  active: boolean;
  conditionType: 'label_contains' | 'account_range' | 'journal_eq' | 'amount_between' | 'direct_code';
  conditionValue: string;
  targetAxis: number;       // axe cible (1-5)
  analyticCodeId: string;
  createdAt: number;
};

export type AnalyticAssignment = {
  id?: number;
  orgId: string;
  glEntryId: number;
  axisNumber: number;       // 1-5
  codeId: string;
  method: 'direct' | 'label' | 'account' | 'journal' | 'amount' | 'manual';
  ruleId?: string;
  assignedAt: number;
  /**
   * Branche WBS de la ligne GL au moment de l'affectation.
   * Calculée par `inferBranch()` à partir du compte et du contexte projet.
   * Stockée pour faciliter l'agrégation dashboard (évite recalcul).
   */
  branch?: AnalyticBranch;
};

export type AnalyticBudget = {
  id?: number;
  orgId: string;
  codeId: string;
  period: string;           // "2025-01" ou "2025"
  amount: number;
};

// ── Activity tracking : annotations / comments / corrections / validations ──
export type ActivityKind = 'annotation' | 'comment' | 'correction' | 'validation';
export type ActivityStatus = 'open' | 'resolved' | 'archived';
export type Activity = {
  id?: number;
  orgId: string;
  kind: ActivityKind;
  status: ActivityStatus;
  /** Contexte : URL ou identifiant logique (ex: '/reports/r-123', 'alert:rat-DSO'). */
  context: string;
  /** Libellé court du contexte (ex: 'Rapport mensuel Mai 2026'). */
  contextLabel?: string;
  /** Identifiant lié (rapport, point d'attention, écriture, etc.). */
  linkedId?: string;
  /** Auteur (email ou nom user app). */
  author: string;
  authorRole?: string;
  /** Texte du commentaire / annotation / correction. */
  content: string;
  /** Données additionnelles (ex: avant/après pour correction, signature pour validation). */
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

// ── Chat interne : channels + messages entre collaborateurs ──
export type ChannelKind = 'public' | 'private' | 'dm';
export type Channel = {
  id: string;
  orgId: string;
  kind: ChannelKind;
  name: string;
  description?: string;
  /** Liste des userId membres (null = tous accès si public) */
  members?: string[];
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  /** Pour les DM 1:1, pinné en haut */
  isPinned?: boolean;
};

export type ChatMessage = {
  id?: number;
  orgId: string;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  /** Mentions @user : liste d'userIds */
  mentions?: string[];
  /** Reactions emoji : { '👍': ['user1', 'user2'], '🚀': ['user3'] } */
  reactions?: Record<string, string[]>;
  /** ID du message parent si réponse en thread */
  replyTo?: number;
  /** Pièce jointe optionnelle (URL Supabase storage) */
  attachment?: { name: string; url: string; size?: number; type?: string };
  createdAt: number;
  editedAt?: number;
  /** Liste des userId qui ont lu le message */
  readBy?: string[];
};

// ── Espace Collaboratif : résolution de problèmes ancrée au grand livre ─────
// « Slack fait parler les gens ; l'Espace Collaboratif fait converger un
// problème vers zéro. » Un espace naît d'un problème ancré à un objet métier,
// vit selon la méthode (problème → solutions → actions → clôture) et meurt
// résolu — avec traçabilité append-only et convergence CALCULÉE (jamais saisie).
export type SpaceStatus = 'ouvert' | 'analyse' | 'action' | 'resolu' | 'archive' | 'abandonne';
export type SpaceAnchorType = 'account_period' | 'reconciliation' | 'partner' | 'journal_entry' | 'closing_period' | 'budget_line';

export type Space = {
  id: string;
  orgId: string;
  title: string;
  status: SpaceStatus;
  /** Énoncé structuré du problème (constat chiffré, date, origine). */
  problemStatement: string;
  problemImpact?: string;
  /** Ancrage obligatoire à un objet métier (structurel, pas décoratif). */
  anchorType: SpaceAnchorType;
  /** Référence de l'objet ancré : '521100·2026-03', code tiers, n° de pièce… */
  anchorRef: string;
  anchorLabel?: string;
  /** Écart initial figé à l'ouverture (XOF entier) — dénominateur de la convergence. */
  initialGapXof?: number;
  ownerId: string;
  ownerName?: string;
  members?: string[];
  dueDate?: string;          // YYYY-MM-DD
  /** Convergence en points de base (0-10000), CALCULÉE par computeConvergenceBp — jamais saisie. */
  convergenceBp: number;
  abandonReason?: string;
  /** Ancrages EXTERNES (§ Diffusion) : références vers des ressources hors FNA
   *  (ticket, GED, e-mail, relevé PDF…). Diffusion sortante, jamais du calcul. */
  externalRefs?: SpaceExternalRef[];
  resolvedAt?: number;
  archivedAt?: number;
  createdAt: number;
};

/** Ancrage externe : label + URL saisis par l'utilisateur, tracés au fil. */
export type SpaceExternalRef = {
  id: string;
  label: string;
  url: string;
  addedBy: string;
  addedAt: number;
};

export type SpaceCriterionKind = 'computed' | 'manual_check';
export type SpaceCriterion = {
  id?: number;
  orgId: string;
  spaceId: string;
  label: string;
  kind: SpaceCriterionKind;
  /** Pour kind='computed' : référence de calcul (ex. 'gl.gap' → écart GL restant). */
  computeRef?: string;
  satisfied: boolean;
  satisfiedBy?: string;
  satisfiedAt?: number;
  createdAt: number;
};

export type SpaceSolutionStatus = 'proposed' | 'kept' | 'discarded';
export type SpaceSolution = {
  id?: number;
  orgId: string;
  spaceId: string;
  title: string;
  body?: string;
  proposedBy: string;
  status: SpaceSolutionStatus;
  /** Motif obligatoire quand la solution est écartée (tracé). */
  statusReason?: string;
  decidedBy?: string;
  createdAt: number;
};

export type SpaceAction = {
  id?: number;
  orgId: string;
  spaceId: string;
  label: string;
  assignee?: string;
  dueDate?: string;          // YYYY-MM-DD
  isCriticalPath?: boolean;
  status: 'todo' | 'done';
  completedAt?: number;
  completedBy?: string;
  createdAt: number;
};

export type SpaceEventType =
  | 'message' | 'problem_stated' | 'solution_proposed' | 'solution_kept' | 'solution_discarded'
  | 'decision_proposed' | 'decision_approved' | 'decision_rejected'
  | 'action_created' | 'action_completed' | 'action_overdue' | 'deadline_changed'
  | 'entry_referenced' | 'criterion_satisfied' | 'criterion_reopened'
  | 'snapshot_created' | 'external_linked' | 'external_unlinked'
  | 'space_opened' | 'status_changed' | 'member_added'
  | 'space_resolved' | 'space_archived' | 'proph3t_summary' | 'proph3t_alert' | 'proph3t_report';

export type SpaceEvent = {
  id?: number;
  orgId: string;
  spaceId: string;
  eventType: SpaceEventType;
  actor: string;
  actorKind: 'user' | 'system' | 'proph3t';
  /** Surface d'origine — preuve visible de la bidirectionnalité (badge « via … »). */
  originSurface: 'space' | 'fna_workspace';
  payload?: Record<string, unknown>;
  createdAt: number;
};

export type SpaceDecisionStatus = 'proposed' | 'approved' | 'rejected';
export type SpaceDecision = {
  id?: number;
  orgId: string;
  spaceId: string;
  /** Référence lisible DEC-AAAA-NNN. */
  ref: string;
  decisionType: string;
  title: string;
  body?: string;
  amountXof?: number;
  status: SpaceDecisionStatus;
  /** Rôles requis, résolus par la matrice de seuils au moment de la proposition. */
  requiredRoles: string[];
  approvedBy?: string[];
  rejectedBy?: string;
  rejectReason?: string;
  createdAt: number;
};

/** Snapshot figé, horodaté et hashé (SHA-256) d'une donnée FNA/Atlas — §9 du CDC. */
export type SpaceSnapshot = {
  id?: number;
  orgId: string;
  spaceId: string;
  sourceApp: string;          // 'fna' | 'cashpilot' | ...
  sourceView: string;         // 'bilan' | 'balance' | 'ratios' | 'convergence_ref' | ...
  label: string;
  filters?: Record<string, unknown>;
  /** Données structurées gelées : { columns, rows, aggregates, context }. */
  data: Record<string, unknown>;
  hashSha256: string;
  takenBy: string;
  takenAt: number;
};

class CockpitDB extends Dexie {
  organizations!: Table<Organization, string>;
  fiscalYears!: Table<FiscalYear, string>;
  periods!: Table<Period, string>;
  accounts!: Table<Account, [string, string]>;
  gl!: Table<GLEntry, number>;
  imports!: Table<ImportLog, number>;
  budgets!: Table<BudgetLine, number>;
  mappings!: Table<AccountMapping, [string, string]>;
  reports!: Table<ReportDoc, number>;
  templates!: Table<ReportTemplate, number>;
  attentionPoints!: Table<AttentionPoint, number>;
  actionPlans!: Table<ActionPlan, number>;
  analyticAxes!: Table<AnalyticAxis, string>;
  analyticCodes!: Table<AnalyticCode, string>;
  analyticRules!: Table<AnalyticRule, string>;
  analyticAssignments!: Table<AnalyticAssignment, number>;
  analyticBudgets!: Table<AnalyticBudget, number>;
  activities!: Table<Activity, number>;
  channels!: Table<Channel, string>;
  chatMessages!: Table<ChatMessage, number>;
  tiersUnmatched!: Table<TiersUnmatched, number>;
  tiersRules!: Table<TiersRule, number>;
  glTiers!: Table<GLTiersEntry, number>;
  spaces!: Table<Space, string>;
  spaceCriteria!: Table<SpaceCriterion, number>;
  spaceSolutions!: Table<SpaceSolution, number>;
  spaceActions!: Table<SpaceAction, number>;
  spaceEvents!: Table<SpaceEvent, number>;
  spaceDecisions!: Table<SpaceDecision, number>;
  spaceSnapshots!: Table<SpaceSnapshot, number>;

  constructor() {
    super('CockpitFA');
    this.version(1).stores({
      organizations: 'id, name, sector',
      fiscalYears: 'id, orgId, year',
      periods: 'id, orgId, [orgId+year+month], year, month',
      accounts: '[orgId+code], orgId, code, class, syscoCode',
      gl: '++id, orgId, periodId, account, date, journal, tiers, [orgId+periodId], [orgId+account]',
      imports: '++id, orgId, date, kind',
      budgets: '++id, orgId, [orgId+year+version], account, month',
      mappings: '[orgId+sourceCode], orgId',
      reports: '++id, orgId, status, type',
    });
    this.version(2).stores({
      templates: '++id, orgId, name',
    });
    this.version(3).stores({
      attentionPoints: '++id, orgId, status, severity, detectedAt',
      actionPlans: '++id, orgId, status, priority, dueDate, attentionPointId',
    });
    this.version(4).upgrade(async (trans) => {
      await trans.table('organizations').toCollection().modify((org: Organization) => {
        if (!org.accountingSystem) org.accountingSystem = 'Normal';
      });
    });
    this.version(5).stores({
      analyticAxes: 'id, orgId, [orgId+number]',
      analyticCodes: 'id, orgId, axisId, code, parentId, [orgId+axisId]',
      analyticRules: 'id, orgId, priority, [orgId+active]',
      analyticAssignments: '++id, orgId, glEntryId, axisNumber, codeId, [orgId+glEntryId], [orgId+codeId]',
      analyticBudgets: '++id, orgId, codeId, period, [orgId+codeId]',
    });
    // v6 : table activities pour annotations / comments / corrections / validations
    this.version(6).stores({
      activities: '++id, orgId, kind, status, context, linkedId, createdAt, [orgId+createdAt], [orgId+kind], [orgId+status]',
    });
    // v7 : tables chat (channels + messages) entre collaborateurs
    this.version(7).stores({
      channels: 'id, orgId, kind, name, [orgId+kind], [orgId+name]',
      chatMessages: '++id, orgId, channelId, userId, createdAt, [channelId+createdAt], [orgId+channelId], replyTo',
    });
    // v8 : lignes GL Tiers non rapprochées (révision manuelle)
    this.version(8).stores({
      tiersUnmatched: '++id, orgId, importId, resolvedAt, reason, [orgId+resolvedAt], [orgId+importId]',
    });
    // v9 : règles de correction tiers mémorisées (réappliquées aux imports)
    this.version(9).stores({
      tiersRules: '++id, orgId, account, [orgId+account]',
    });
    // v10 : grand livre tiers (livre auxiliaire stocké, source des balances aux.)
    this.version(10).stores({
      glTiers: '++id, orgId, importId, account, codeTiers, category, date, [orgId+category], [orgId+importId]',
    });
    // v11 : Espace Collaboratif — résolution de problèmes ancrée au GL
    this.version(11).stores({
      spaces: 'id, orgId, status, [orgId+status], createdAt',
      spaceCriteria: '++id, spaceId, orgId, [spaceId+kind]',
      spaceSolutions: '++id, spaceId, orgId, status',
      spaceActions: '++id, spaceId, orgId, status, assignee, dueDate',
      spaceEvents: '++id, spaceId, orgId, createdAt, [spaceId+createdAt], eventType',
      spaceDecisions: '++id, spaceId, orgId, status',
    });
    // v12 : snapshots figés & hashés (SHA-256) — pièces de type « état gelé »
    this.version(12).stores({
      spaceSnapshots: '++id, spaceId, orgId, takenAt, [spaceId+takenAt], sourceView',
    });
  }
}

export const db = new CockpitDB();

// ── Verrouillage des périodes clôturées (P2-12) ────────────────────────────
//
// Le verrou N'EST PAS posé via des hooks Dexie `db.gl.hook(...)`. Il est
// appliqué à la FRONTIÈRE MÉTIER, dans `importGL()` (cf. engine/importer.ts),
// qui appelle `assertPeriodOpen(date, orgId)` (cf. lib/periodLock.ts) AVANT
// d'insérer de nouvelles écritures — refusant l'import dès qu'une date tombe
// dans une période `closed`.
//
// Pourquoi PAS un hook Dexie :
//   1. `db.gl` est un cache local alimenté par RÉPLICATION (pull Supabase →
//      Dexie, cf. supabaseSync.ts) et par le SEEDING démo (demoSeed.ts). Ces
//      écritures recopient légitimement des écritures historiques de périodes
//      déjà clôturées — un verrou au niveau du hook les rejetterait et
//      corromprait le cache (et casserait la restauration de sauvegarde).
//      Les vraies mutations utilisateur passent par `dataProvider` → Supabase,
//      jamais par `db.gl` directement.
//   2. Un hook `creating/updating/deleting` est SYNCHRONE : il ne peut ni lire
//      un autre object store (`periods`) depuis la transaction `gl`-scoped
//      (→ "object store not found" en boucle au seeding), ni `await` une
//      vérification async (la promesse se détache, l'écriture n'est jamais
//      réellement bloquée).
//
// Override admin (à venir) : un rôle 'accountant_admin' pourra rouvrir une
// période via `unlockPeriod()` (tracé dans l'audit log).
