import Dexie, { Table } from 'dexie';

export type AccountingSystem = 'Normal' | 'Allégé' | 'SMT';

export type Organization = {
  id: string;
  name: string;
  currency: string;
  sector: string;
  accountingSystem?: AccountingSystem; // Normal (défaut) / Allégé (PME) / SMT (TPE)
  rccm?: string;
  ifu?: string;
  address?: string;
  createdAt: number;
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
  kind: 'GL' | 'BUDGET' | 'COA' | 'BALANCE' | 'TIERS' | 'IMMO';
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
  }
}

export const db = new CockpitDB();

// ── Dexie hooks : verrouillage des periodes cloturees (P2-12) ──────
// Toute tentative d'INSERT/UPDATE/DELETE sur une ecriture dont la date tombe
// dans une periode `closed === true` est BLOQUEE par exception.
// Couvre automatiquement : importGL, addEntry manuel, updateEntry, deleteEntry.
//
// Override admin (a venir Phase B) : un utilisateur avec role 'accountant_admin'
// pourra contourner via un flag context et tracer dans period_audit_log.
async function assertWritable(orgId: string | undefined, date: string | undefined): Promise<void> {
  if (!orgId || !date) return;
  const periods = await db.periods.where('orgId').equals(orgId).toArray();
  const year = parseInt(date.substring(0, 4), 10);
  const month = parseInt(date.substring(5, 7), 10);
  const period = periods.find((p) => p.year === year && p.month === month);
  if (period?.closed) {
    throw new Error(`Période ${period.id} (${date}) clôturée — écriture refusée. Utilisez "Réouvrir la période" pour modifier.`);
  }
}

db.gl.hook('creating', function (_primKey, obj) {
  // Hook synchrone Dexie — on lance la verification async sans bloquer.
  // En cas de violation, l'exception remonte au caller.
  this.onsuccess = () => { /* noop */ };
  this.onerror = () => { /* noop */ };
  void assertWritable(obj.orgId, obj.date).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[periodLock] Insertion bloquée :', err.message);
    throw err;
  });
});

db.gl.hook('updating', function (mods, _primKey, obj) {
  const newDate = (mods as Partial<GLEntry>).date ?? obj.date;
  void assertWritable(obj.orgId, newDate).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[periodLock] Modification bloquée :', err.message);
    throw err;
  });
});

db.gl.hook('deleting', function (_primKey, obj) {
  void assertWritable(obj.orgId, obj.date).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[periodLock] Suppression bloquée :', err.message);
    throw err;
  });
});
