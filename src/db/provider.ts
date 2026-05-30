/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
/**
 * DataProvider — couche d'abstraction entre l'app et le stockage.
 *
 * Supabase est la source de vérité OBLIGATOIRE en mode web.
 * Mode Electron (build desktop) : SQLite local via IPC.
 * Dexie n'est plus utilisé par les engines migrés — il subsiste uniquement
 * pour les modules en cours de migration (cf. liste plus bas).
 *
 * ─── GUIDE DE MIGRATION DEPUIS Dexie direct (`db.*`) ─────────────────────────
 *
 * Patterns à substituer dans les engines & composants :
 *
 * | Avant (Dexie direct)                                          | Après (DAL)                                     |
 * |---------------------------------------------------------------|-------------------------------------------------|
 * | db.organizations.toArray()                                    | dataProvider.getOrganizations()                 |
 * | db.organizations.get(id)                                      | dataProvider.getOrganization(id)                |
 * | db.fiscalYears.where('orgId').equals(o).toArray()             | dataProvider.getFiscalYears(o)                  |
 * | db.periods.where('orgId').equals(o).toArray()                 | dataProvider.getPeriods(o)                      |
 * | db.accounts.where('orgId').equals(o).toArray()                | dataProvider.getAccounts(o)                     |
 * | db.gl.where('orgId').equals(o).toArray()                      | dataProvider.getGLEntries({orgId:o})            |
 * | db.gl.where('[orgId+periodId]').equals([o,p]).toArray()       | dataProvider.getGLEntries({orgId:o,periodId:p}) |
 * | db.budgets.where('[orgId+year+version]').equals([o,y,v])      | dataProvider.getBudgets(o,y,v)                  |
 * | db.budgets.where('[orgId+year+version]').between([o,y,'']…)   | dataProvider.getBudgetsByYear(o,y)              |
 * | db.budgets.where('orgId').equals(o).toArray()                 | dataProvider.getAllBudgets(o)                   |
 * | db.imports.where('orgId').equals(o).toArray()                 | dataProvider.getImports(o)                      |
 * | db.reports.where('orgId').equals(o).toArray()                 | dataProvider.getReports(o)                      |
 * | db.attentionPoints / actionPoints / templates / mappings      | méthodes équivalentes du DAL                    |
 *
 * Bonnes pratiques :
 *  - Paralléliser les lectures avec `Promise.all([...])` quand possible.
 *  - Toujours typer le retour avec les types exportés depuis `./schema` (Period[], GLEntry[]…).
 *  - Pour les écritures atomiques (delete + insert), suivre le pattern de `saveBudget`
 *    dans `engine/budget.ts` : pas de transaction DB, mais ordre garanti.
 *
 * Modules NON encore migrés (nécessitent extension du DAL) :
 *  - Comptabilité analytique (analytic_axes / codes / rules / assignments / budgets)
 *  - Activités (activities)
 *  - Chat (channels, chat_messages)
 *  - Audit period lock (period_audit_log)
 *
 * Composants React : `useLiveQuery` ne fonctionne qu'avec Dexie. Pour migrer un
 * composant, utiliser `useEffect` + `useState` + appel `dataProvider.*` (ou créer
 * un hook `useDataProvider` dédié si le besoin se généralise).
 */
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine,
  ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate,
  AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, AnalyticBudget,
  Activity, Channel, ChatMessage, TiersUnmatched, TiersRule, GLAuditLogEntry,
  GLTiersEntry, TiersCategory,
} from './schema';
import { withCache } from './cachedProvider';

export interface GLFilter {
  orgId: string;
  periodId?: string;
  importId?: string | number;
  account?: string;
  fromDate?: string;
  toDate?: string;
}

export interface DataProvider {
  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  upsertOrganization(org: Organization): Promise<void>;
  deleteOrganization(id: string): Promise<void>;
  /** Suppression cascade : org + fiscal_years + periods + accounts + gl + imports + budgets + mappings. */
  deleteOrganizationCascade(id: string): Promise<void>;

  // Fiscal years & Periods
  getFiscalYears(orgId: string): Promise<FiscalYear[]>;
  upsertFiscalYear(fy: FiscalYear): Promise<void>;
  bulkUpsertFiscalYears(fys: FiscalYear[]): Promise<void>;
  /** Supprime un exercice + toutes ses périodes + toutes les écritures GL de cette année. */
  deleteFiscalYearCascade(fy: FiscalYear): Promise<void>;
  /** Bascule le flag `closed` sur l'exercice + toutes ses périodes. */
  setFiscalYearClosed(fy: FiscalYear, closed: boolean): Promise<void>;
  getPeriods(orgId: string): Promise<Period[]>;
  upsertPeriod(p: Period): Promise<void>;
  bulkUpsertPeriods(ps: Period[]): Promise<void>;

  // Accounts
  getAccounts(orgId: string): Promise<Account[]>;
  getAccount(orgId: string, code: string): Promise<Account | undefined>;
  upsertAccount(account: Account): Promise<void>;
  bulkUpsertAccounts(accounts: Account[]): Promise<void>;
  /** Supprime un compte spécifique (orgId + code). */
  deleteAccount(orgId: string, code: string): Promise<void>;
  /** Supprime tous les comptes d'une organisation. */
  deleteAccounts(orgId: string): Promise<void>;

  // GL Entries
  getGLEntries(filter: GLFilter): Promise<GLEntry[]>;
  bulkInsertGL(entries: GLEntry[]): Promise<void>;
  /** Bulk upsert basé sur l'id (insertion ou mise à jour). */
  bulkUpsertGL(entries: GLEntry[]): Promise<void>;
  /** Mise à jour partielle d'une écriture par id. */
  updateGLEntry(id: number, changes: Partial<GLEntry>): Promise<void>;
  deleteGLByImport(importId: number): Promise<void>;

  // Imports
  getImports(orgId: string): Promise<ImportLog[]>;
  addImport(log: Omit<ImportLog, 'id'>): Promise<number>;
  deleteImport(id: number): Promise<void>;

  // Tiers unmatched — lignes GL Tiers non rapprochées (révision manuelle)
  getTiersUnmatched(orgId: string, opts?: { onlyPending?: boolean; importId?: number }): Promise<TiersUnmatched[]>;
  bulkInsertTiersUnmatched(rows: Omit<TiersUnmatched, 'id'>[]): Promise<void>;
  updateTiersUnmatched(id: number, changes: Partial<TiersUnmatched>): Promise<void>;
  deleteTiersUnmatched(id: number): Promise<void>;
  /** Supprime toutes les lignes unmatched liées à un import (cascade quand on supprime l'import). */
  deleteTiersUnmatchedByImport(importId: number): Promise<void>;

  // Tiers rules — règles de correction tiers mémorisées (réappliquées aux imports)
  getTiersRules(orgId: string): Promise<TiersRule[]>;
  upsertTiersRule(rule: Omit<TiersRule, 'id'> & { id?: number }): Promise<number>;
  deleteTiersRule(id: number): Promise<void>;

  // ── Grand Livre Tiers (livre auxiliaire stocké) ───────────────────
  // Optionnel : implémenté par Supabase + Demo. ElectronProvider peut l'omettre.
  // Les appelants utilisent l'optional chaining (`dataProvider.getGLTiers?.(...)`).
  getGLTiers?(orgId: string, opts?: { importId?: number; category?: TiersCategory; fromDate?: string; toDate?: string }): Promise<GLTiersEntry[]>;
  bulkInsertGLTiers?(rows: Omit<GLTiersEntry, 'id'>[]): Promise<void>;
  deleteGLTiersByImport?(importId: number): Promise<void>;
  /** Purge tout le GL Tiers d'une org (réimport complet). */
  deleteGLTiers?(orgId: string): Promise<void>;
  // GL Audit log — modifications a posteriori (post-insertion) sur les écritures GL.
  // Chaîne SHA-256 par org, immuable (pas de UPDATE/DELETE policies en DB).
  getGLAuditLog?(orgId: string, opts?: { glEntryId?: number; limit?: number }): Promise<GLAuditLogEntry[]>;
  /** Retourne le dernier audit_hash d'une org (pour chaîner les nouveaux logs). */
  getLastGLAuditHash?(orgId: string): Promise<string>;
  bulkInsertGLAuditLog?(rows: Omit<GLAuditLogEntry, 'id'>[]): Promise<void>;
  /**
   * RPC atomique : append le batch d'audit log avec chaîne SHA-256 calculée
   * server-side et lock `SELECT FOR UPDATE` pour sérialiser les writes
   * concurrents (résout race condition de la voie client).
   * @returns nombre de rows insérés, ou `null` si la RPC n'est pas déployée
   *   (l'appelant doit alors fallback sur `bulkInsertGLAuditLog`).
   */
  appendGLAuditLogAtomic?(
    orgId: string,
    changes: Array<{
      glEntryId: number;
      field: string;
      oldValue?: string;
      newValue?: string;
      reason: string;
      sourceKind?: string;
      sourceId?: number;
    }>,
  ): Promise<number | null>;

  /**
   * Import GL Tiers atomique via RPC Postgres (transaction unique).
   * Encapsule : addImport + bulkUpsertGL (enrichissements) + bulkInsertTiersUnmatched.
   *
   * Retourne `{ importId }` en cas de succès, ou `null` si le provider ne
   * supporte pas l'opération atomique (ex: Demo, Electron, RPC non déployée).
   * L'appelant doit alors fallback sur les 3 appels séquentiels classiques.
   */
  importTiersAtomic?(payload: {
    orgId: string;
    user: string;
    fileName: string;
    fileHash?: string;
    source: string;
    count: number;
    rejected: number;
    status: 'success' | 'partial' | 'error';
    report: string;
    enriched: Array<{ id: number; tiers: string; label?: string }>;
    unmatched: Array<Omit<TiersUnmatched, 'id' | 'importId' | 'orgId'>>;
  }): Promise<{ importId: number } | null>;

  // Budgets
  getBudgets(orgId: string, year: number, version: string): Promise<BudgetLine[]>;
  /** Toutes les lignes pour `orgId` + `year`, toutes versions confondues. */
  getBudgetsByYear(orgId: string, year: number): Promise<BudgetLine[]>;
  getAllBudgets(orgId: string): Promise<BudgetLine[]>;
  bulkUpsertBudgets(lines: BudgetLine[]): Promise<void>;
  deleteBudgets(orgId: string, year: number, version: string): Promise<void>;
  /** Supprime TOUS les budgets d'une organisation (toutes années & versions). */
  deleteAllBudgets(orgId: string): Promise<void>;
  /** Supprime tous les imports d'un kind donné. */
  deleteImportsByKind(orgId: string, kind: ImportLog['kind']): Promise<void>;

  // Reports
  getReports(orgId: string): Promise<ReportDoc[]>;
  getReport(id: number): Promise<ReportDoc | undefined>;
  upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number>;
  deleteReport(id: number): Promise<void>;

  // Templates
  getTemplates(orgId: string): Promise<ReportTemplate[]>;
  upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number>;
  deleteTemplate(id: number): Promise<void>;

  // Attention points
  getAttentionPoints(orgId: string): Promise<AttentionPoint[]>;
  upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number>;
  deleteAttentionPoint(id: number): Promise<void>;

  // Action plans
  getActionPlans(orgId: string): Promise<ActionPlan[]>;
  upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number>;
  deleteActionPlan(id: number): Promise<void>;

  // Mappings
  getMappings(orgId: string): Promise<AccountMapping[]>;
  upsertMapping(m: AccountMapping): Promise<void>;

  // ── Comptabilité analytique ────────────────────────────────────────
  getAnalyticAxes(orgId: string): Promise<AnalyticAxis[]>;
  upsertAnalyticAxis(axis: AnalyticAxis): Promise<void>;
  deleteAnalyticAxis(id: string): Promise<void>;

  getAnalyticCodes(orgId: string, axisId?: string): Promise<AnalyticCode[]>;
  upsertAnalyticCode(code: AnalyticCode): Promise<void>;
  bulkUpsertAnalyticCodes(codes: AnalyticCode[]): Promise<void>;
  deleteAnalyticCode(id: string): Promise<void>;
  /** Détache les codes enfants (set parentId = undefined) */
  detachAnalyticChildren(parentId: string): Promise<void>;

  getAnalyticRules(orgId: string): Promise<AnalyticRule[]>;
  upsertAnalyticRule(rule: AnalyticRule): Promise<void>;
  deleteAnalyticRule(id: string): Promise<void>;
  updateAnalyticRulePriority(id: string, priority: number): Promise<void>;

  getAnalyticAssignments(orgId: string): Promise<AnalyticAssignment[]>;
  bulkInsertAnalyticAssignments(assignments: AnalyticAssignment[]): Promise<void>;
  updateAnalyticAssignment(id: number, changes: Partial<AnalyticAssignment>): Promise<void>;
  deleteAnalyticAssignmentsByOrgFilter(orgId: string, predicate: (a: AnalyticAssignment) => boolean): Promise<void>;
  deleteAnalyticAssignmentsByCode(codeId: string): Promise<void>;

  getAnalyticBudgets(orgId: string): Promise<AnalyticBudget[]>;

  // ── Activités (annotations / commentaires / corrections) ──────────
  getActivities(orgId: string): Promise<Activity[]>;
  getActivity(id: number): Promise<Activity | undefined>;
  addActivity(act: Omit<Activity, 'id'>): Promise<number>;
  updateActivity(id: number, changes: Partial<Activity>): Promise<void>;
  deleteActivity(id: number): Promise<void>;

  // ── Chat (channels + messages) ────────────────────────────────────
  getChannels(orgId: string): Promise<Channel[]>;
  getChannel(id: string): Promise<Channel | undefined>;
  upsertChannel(c: Channel): Promise<void>;
  deleteChannel(id: string): Promise<void>;
  /** Première channel correspondant à `predicate` (pour les "lookups par nom"). */
  findChannel(orgId: string, predicate: (c: Channel) => boolean): Promise<Channel | undefined>;

  getChatMessage(id: number): Promise<ChatMessage | undefined>;
  getChatMessagesByChannel(channelId: string): Promise<ChatMessage[]>;
  getChatMessagesByOrg(orgId: string): Promise<ChatMessage[]>;
  addChatMessage(msg: Omit<ChatMessage, 'id'>): Promise<number>;
  updateChatMessage(id: number, changes: Partial<ChatMessage>): Promise<void>;
  deleteChatMessage(id: number): Promise<void>;

  // File storage
  uploadFile(orgId: string, fileName: string, file: File | Blob): Promise<string>;
  downloadFile(path: string): Promise<Blob>;
}

// ─── Provider selection ─────────────────────────────────────────────
//
// Supabase est OBLIGATOIRE en prod. Mode démo : DemoProvider intercepte
// toutes les lectures pour `demo-org*` et renvoie des fixtures hardcodées
// (cf. demoProvider.ts + demoFixtures.ts) — aucune auth requise.
import { isSupabaseConfigured } from '../lib/supabase';
import { SupabaseProvider } from './supabaseProvider';
import { DemoProvider } from './demoProvider';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

// Stub provider — utilisé quand Supabase n'est pas configuré ET qu'on est
// en mode démo. Toutes les méthodes throw : DemoProvider doit intercepter
// avant d'appeler ce fallback (vérification orgId 'demo-org*').
function createStubProvider(): DataProvider {
  const fail = () => {
    throw new Error('Supabase non configuré. Connectez-vous ou activez le mode démo.');
  };
  return new Proxy({} as any, {
    get: (_, prop) => {
      if (prop === 'then') return undefined;
      // Retourne une fonction qui lance — async ou sync OK car DemoProvider
      // intercepte avant pour les orgIds 'demo-org*'
      return (..._args: unknown[]) => fail();
    },
  }) as DataProvider;
}

function selectProvider(): DataProvider {
  if (isElectron) {
    // Sprint 6: Electron SQLite provider (build desktop)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ElectronProvider } = require('./electronProvider');
    return new DemoProvider(new ElectronProvider());
  }
  if (!isSupabaseConfigured) {
    // Démo possible sans Supabase — DemoProvider gère tout en local
    return new DemoProvider(createStubProvider());
  }
  return new DemoProvider(new SupabaseProvider());
}

// Wrap dans le cache TTL + déduplication pour éviter les multi-fetches de
// 8000+ entries paginé sur chaque navigation de page.
export const dataProvider: DataProvider = withCache(selectProvider());
