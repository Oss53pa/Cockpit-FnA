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
  }
}

export const db = new CockpitDB();
