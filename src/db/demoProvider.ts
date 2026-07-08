/**
 * DemoProvider — wrapper qui intercepte les lectures pour retourner des
 * fixtures hardcodées quand le mode démo est actif.
 *
 * Active si :
 *   - `localStorage['demo-mode'] === '1'`
 *   - L'argument `orgId` (ou le filtre.orgId) commence par `demo-org`
 *
 * Pour TOUTES les autres opérations (writes, hors démo, autres orgs) →
 * délègue au provider sous-jacent (SupabaseProvider en prod).
 *
 * Avantage : aucune page n'a besoin de connaître la démo. Le routage est
 * fait au niveau de la DAL.
 */
import { safeLocalStorage } from '../lib/safeStorage';
import type { DataProvider, GLFilter } from './provider';
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine,
  ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate,
  AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, AnalyticBudget,
  Activity, Channel, ChatMessage, TiersUnmatched, TiersRule, GLAuditLogEntry,
  GLTiersEntry, TiersCategory,
  Space, SpaceCriterion, SpaceSolution, SpaceAction, SpaceEvent, SpaceDecision, SpaceSnapshot,
} from './schema';
import { db } from './schema';
import {
  isDemoActive, DEMO_ORG, DEMO_BALANCE, DEMO_PERIODS, DEMO_IMPORTS,
  DEMO_ACCOUNTS, DEMO_ATTENTION_POINTS, DEMO_ACTION_PLANS, DEMO_GL_TIERS,
} from '../engine/demoFixtures';

const Y = new Date().getFullYear();

// ─── GL entries fixturisés (échantillon réduit pour l'affichage) ──────
function buildDemoGLEntries(orgId: string): GLEntry[] {
  const out: GLEntry[] = [];
  let id = 1;
  const journals = ['VT', 'AC', 'OD', 'BQ', 'PAIE'];
  const accounts4 = ['401001', '401002', '401003', '411001', '411002', '411003'];
  // 250 écritures synthétiques sur 12 mois
  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, '0');
    const lastDay = new Date(Y, m, 0).getDate();
    for (let i = 0; i < 20; i++) {
      const day = String(1 + Math.floor((i / 20) * (lastDay - 1))).padStart(2, '0');
      const date = `${Y}-${monthStr}-${day}`;
      const journal = journals[i % journals.length];
      const piece = `${journal}-${String(id).padStart(4, '0')}`;
      const acc1 = accounts4[i % accounts4.length];
      const acc2 = i % 2 === 0 ? '701' : '602';
      const amount = Math.round(800_000 + i * 150_000 + m * 50_000);
      out.push({
        id: id++, orgId, periodId: `p-demo-${Y}-${m}`, date, journal, piece,
        account: acc1, label: `Pièce ${piece}`,
        debit: i % 2 === 0 ? amount : 0, credit: i % 2 === 0 ? 0 : amount,
      });
      out.push({
        id: id++, orgId, periodId: `p-demo-${Y}-${m}`, date, journal, piece,
        account: acc2, label: `Pièce ${piece}`,
        debit: i % 2 === 0 ? 0 : amount, credit: i % 2 === 0 ? amount : 0,
      });
    }
  }
  return out;
}

let CACHED_GL: { orgId: string; entries: GLEntry[] } | null = null;
function demoGLEntries(orgId: string): GLEntry[] {
  if (!CACHED_GL || CACHED_GL.orgId !== orgId) {
    CACHED_GL = { orgId, entries: buildDemoGLEntries(orgId) };
  }
  return CACHED_GL.entries;
}

// ─── Budgets fixturisés ────────────────────────────────────────────────
function demoBudgets(orgId: string): BudgetLine[] {
  const budgetData = [
    { account: '701', annual: 90_000_000 },
    { account: '702', annual: 130_000_000 },
    { account: '706', annual: 60_000_000 },
    { account: '601', annual: 30_000_000 },
    { account: '602', annual: 28_000_000 },
    { account: '622', annual: 14_400_000 },
    { account: '624', annual: 4_200_000 },
    { account: '625', annual: 2_640_000 },
    { account: '627', annual: 3_000_000 },
    { account: '628', annual: 3_360_000 },
    { account: '631', annual: 1_020_000 },
    { account: '661', annual: 102_000_000 },
    { account: '664', annual: 20_400_000 },
    { account: '671', annual: 2_100_000 },
    { account: '681', annual: 9_500_000 },
  ];
  const lines: BudgetLine[] = [];
  for (const b of budgetData) {
    const monthly = Math.round(b.annual / 12);
    for (let m = 1; m <= 12; m++) {
      lines.push({
        orgId, year: Y, version: `V1_${Y}`, account: b.account,
        month: m, amount: monthly,
      } as BudgetLine);
    }
  }
  return lines;
}

// ─── Fiscal years ──────────────────────────────────────────────────────
function demoFiscalYears(orgId: string): FiscalYear[] {
  return [
    {
      id: `fy-${orgId}-${Y}`, orgId, year: Y,
      startDate: `${Y}-01-01`, endDate: `${Y}-12-31`, closed: false,
    } as FiscalYear,
  ];
}

function isDemo(orgId?: string | null): boolean {
  return isDemoActive(orgId);
}

// ────────────────────────────────────────────────────────────────────
// DemoProvider — délègue au fallback sauf si mode démo
// ────────────────────────────────────────────────────────────────────
export class DemoProvider implements DataProvider {
  constructor(private inner: DataProvider) {}

  // ── Organizations ──
  async getOrganizations(): Promise<Organization[]> {
    const real = await this.inner.getOrganizations().catch(() => [] as Organization[]);
    if (typeof window !== 'undefined' && safeLocalStorage.getItem('demo-mode') === '1') {
      // Inject demo org if missing
      const exists = real.some((o) => o.id.startsWith('demo-org'));
      if (!exists) return [DEMO_ORG, ...real];
    }
    return real;
  }
  async getOrganization(id: string) {
    if (isDemo(id)) return { ...DEMO_ORG, id };
    return this.inner.getOrganization(id);
  }
  upsertOrganization(org: Organization) {
    if (isDemo(org.id)) return Promise.resolve();
    return this.inner.upsertOrganization(org);
  }
  deleteOrganization(id: string) { return this.inner.deleteOrganization(id); }
  deleteOrganizationCascade(id: string) { return this.inner.deleteOrganizationCascade(id); }

  // ── Fiscal years & Periods ──
  async getFiscalYears(orgId: string): Promise<FiscalYear[]> {
    if (isDemo(orgId)) return demoFiscalYears(orgId);
    return this.inner.getFiscalYears(orgId);
  }
  upsertFiscalYear(fy: FiscalYear) {
    if (isDemo(fy.orgId)) return Promise.resolve();
    return this.inner.upsertFiscalYear(fy);
  }
  bulkUpsertFiscalYears(fys: FiscalYear[]) {
    if (fys[0] && isDemo(fys[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertFiscalYears(fys);
  }
  deleteFiscalYearCascade(fy: FiscalYear) { return this.inner.deleteFiscalYearCascade(fy); }
  setFiscalYearClosed(fy: FiscalYear, closed: boolean) { return this.inner.setFiscalYearClosed(fy, closed); }
  async getPeriods(orgId: string): Promise<Period[]> {
    if (isDemo(orgId)) return DEMO_PERIODS.map((p) => ({ ...p, orgId })) as Period[];
    return this.inner.getPeriods(orgId);
  }
  upsertPeriod(p: Period) {
    if (isDemo(p.orgId)) return Promise.resolve();
    return this.inner.upsertPeriod(p);
  }
  bulkUpsertPeriods(ps: Period[]) {
    if (ps[0] && isDemo(ps[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertPeriods(ps);
  }

  // ── Accounts ──
  async getAccounts(orgId: string): Promise<Account[]> {
    if (isDemo(orgId)) return DEMO_ACCOUNTS.map((a) => ({ ...a, orgId }));
    return this.inner.getAccounts(orgId);
  }
  async getAccount(orgId: string, code: string): Promise<Account | undefined> {
    if (isDemo(orgId)) return DEMO_ACCOUNTS.find((a) => a.code === code);
    return this.inner.getAccount(orgId, code);
  }
  upsertAccount(a: Account) {
    if (isDemo(a.orgId)) return Promise.resolve();
    return this.inner.upsertAccount(a);
  }
  bulkUpsertAccounts(accounts: Account[]) {
    if (accounts[0] && isDemo(accounts[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertAccounts(accounts);
  }
  deleteAccount(orgId: string, code: string) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteAccount(orgId, code);
  }
  deleteAccounts(orgId: string) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteAccounts(orgId);
  }

  // ── GL Entries ──
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    if (isDemo(filter.orgId)) {
      let entries = demoGLEntries(filter.orgId);
      if (filter.periodId) entries = entries.filter((e) => e.periodId === filter.periodId);
      if (filter.account) entries = entries.filter((e) => e.account.startsWith(filter.account!));
      if (filter.fromDate) entries = entries.filter((e) => e.date >= filter.fromDate!);
      if (filter.toDate) entries = entries.filter((e) => e.date <= filter.toDate!);
      return entries;
    }
    return this.inner.getGLEntries(filter);
  }
  bulkInsertGL(entries: GLEntry[]) {
    if (entries[0] && isDemo(entries[0].orgId)) return Promise.resolve();
    return this.inner.bulkInsertGL(entries);
  }
  bulkUpsertGL(entries: GLEntry[]) {
    if (entries[0] && isDemo(entries[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertGL(entries);
  }
  updateGLEntry(id: number, changes: Partial<GLEntry>) { return this.inner.updateGLEntry(id, changes); }
  deleteGLByImport(importId: number) { return this.inner.deleteGLByImport(importId); }

  // ── Imports ──
  async getImports(orgId: string): Promise<ImportLog[]> {
    if (isDemo(orgId)) return DEMO_IMPORTS.map((i) => ({ ...i, orgId })) as unknown as ImportLog[];
    return this.inner.getImports(orgId);
  }
  addImport(log: Omit<ImportLog, 'id'>) {
    if (isDemo(log.orgId)) return Promise.resolve(1);
    return this.inner.addImport(log);
  }
  deleteImport(id: number) { return this.inner.deleteImport(id); }

  // ── Tiers unmatched ──
  async getTiersUnmatched(orgId: string, opts?: { onlyPending?: boolean; importId?: number }) {
    if (isDemo(orgId)) return [];
    return this.inner.getTiersUnmatched(orgId, opts);
  }
  bulkInsertTiersUnmatched(rows: Omit<TiersUnmatched, 'id'>[]) {
    if (rows[0] && isDemo(rows[0].orgId)) return Promise.resolve();
    return this.inner.bulkInsertTiersUnmatched(rows);
  }
  updateTiersUnmatched(id: number, changes: Partial<TiersUnmatched>) {
    return this.inner.updateTiersUnmatched(id, changes);
  }
  deleteTiersUnmatched(id: number) { return this.inner.deleteTiersUnmatched(id); }
  deleteTiersUnmatchedByImport(importId: number) { return this.inner.deleteTiersUnmatchedByImport(importId); }

  // ── Grand Livre Tiers (livre auxiliaire stocké) ──
  async getGLTiers(orgId: string, opts?: { importId?: number; category?: TiersCategory; fromDate?: string; toDate?: string }): Promise<GLTiersEntry[]> {
    if (isDemo(orgId)) {
      let rows = DEMO_GL_TIERS.map((r) => ({ ...r, orgId })) as GLTiersEntry[];
      if (opts?.category) rows = rows.filter((r) => r.category === opts.category);
      return rows;
    }
    return this.inner.getGLTiers?.(orgId, opts) ?? Promise.resolve([]);
  }
  bulkInsertGLTiers(rows: Omit<GLTiersEntry, 'id'>[]) {
    if (rows[0] && isDemo(rows[0].orgId)) return Promise.resolve();
    return this.inner.bulkInsertGLTiers?.(rows) ?? Promise.resolve();
  }
  deleteGLTiersByImport(importId: number) {
    return this.inner.deleteGLTiersByImport?.(importId) ?? Promise.resolve();
  }
  deleteGLTiers(orgId: string) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteGLTiers?.(orgId) ?? Promise.resolve();
  }

  // ── Tiers rules (règles de correction mémorisées) ──
  async getTiersRules(orgId: string): Promise<TiersRule[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getTiersRules(orgId);
  }
  upsertTiersRule(rule: Omit<TiersRule, 'id'> & { id?: number }) {
    if (isDemo(rule.orgId)) return Promise.resolve(rule.id ?? 1);
    return this.inner.upsertTiersRule(rule);
  }
  deleteTiersRule(id: number) { return this.inner.deleteTiersRule(id); }

  // ── GL Audit log ──
  async getGLAuditLog(orgId: string, opts?: { glEntryId?: number; limit?: number }) {
    if (isDemo(orgId)) return [];
    return this.inner.getGLAuditLog?.(orgId, opts) ?? [];
  }
  async getLastGLAuditHash(orgId: string) {
    if (isDemo(orgId)) return '';
    return this.inner.getLastGLAuditHash?.(orgId) ?? '';
  }
  async bulkInsertGLAuditLog(rows: Omit<GLAuditLogEntry, 'id'>[]) {
    if (rows[0] && isDemo(rows[0].orgId)) return;
    return this.inner.bulkInsertGLAuditLog?.(rows);
  }
  async appendGLAuditLogAtomic(
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
  ) {
    if (isDemo(orgId)) return changes.length;
    // Si l'inner ne supporte pas (Electron) → retourner null pour fallback
    return this.inner.appendGLAuditLogAtomic?.(orgId, changes) ?? null;
  }

  // ── Budgets ──
  async getBudgets(orgId: string, year: number, version: string) {
    if (isDemo(orgId)) return demoBudgets(orgId).filter((b) => b.year === year && b.version === version);
    return this.inner.getBudgets(orgId, year, version);
  }
  async getBudgetsByYear(orgId: string, year: number) {
    if (isDemo(orgId)) return demoBudgets(orgId).filter((b) => b.year === year);
    return this.inner.getBudgetsByYear(orgId, year);
  }
  async getAllBudgets(orgId: string) {
    if (isDemo(orgId)) return demoBudgets(orgId);
    return this.inner.getAllBudgets(orgId);
  }
  bulkUpsertBudgets(lines: BudgetLine[]) {
    if (lines[0] && isDemo(lines[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertBudgets(lines);
  }
  deleteBudgets(orgId: string, year: number, version: string) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteBudgets(orgId, year, version);
  }
  deleteAllBudgets(orgId: string) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteAllBudgets(orgId);
  }
  deleteImportsByKind(orgId: string, kind: ImportLog['kind']) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteImportsByKind(orgId, kind);
  }

  // ── Reports ──
  async getReports(orgId: string): Promise<ReportDoc[]> {
    if (isDemo(orgId)) {
      const now = Date.now();
      return [
        {
          id: 1, orgId, title: `Reporting mensuel ${Y}`, type: 'monthly',
          author: 'Démo Cockpit', status: 'draft',
          createdAt: now - 86_400_000 * 5, updatedAt: now,
          content: JSON.stringify({ source: 'demoFixtures' }),
        } as ReportDoc,
      ];
    }
    return this.inner.getReports(orgId);
  }
  getReport(id: number) { return this.inner.getReport(id); }
  upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }) {
    if (isDemo(doc.orgId)) return Promise.resolve(doc.id ?? 1);
    return this.inner.upsertReport(doc);
  }
  deleteReport(id: number) { return this.inner.deleteReport(id); }

  // ── Templates ──
  async getTemplates(orgId: string): Promise<ReportTemplate[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getTemplates(orgId);
  }
  upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }) {
    if (isDemo(t.orgId)) return Promise.resolve(t.id ?? 1);
    return this.inner.upsertTemplate(t);
  }
  deleteTemplate(id: number) { return this.inner.deleteTemplate(id); }

  // ── Attention points ──
  async getAttentionPoints(orgId: string): Promise<AttentionPoint[]> {
    if (isDemo(orgId)) return DEMO_ATTENTION_POINTS.map((p) => ({ ...p, orgId }));
    return this.inner.getAttentionPoints(orgId);
  }
  upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }) {
    if (isDemo(p.orgId)) return Promise.resolve(p.id ?? 1);
    return this.inner.upsertAttentionPoint(p);
  }
  deleteAttentionPoint(id: number) { return this.inner.deleteAttentionPoint(id); }

  // ── Action plans ──
  async getActionPlans(orgId: string): Promise<ActionPlan[]> {
    if (isDemo(orgId)) return DEMO_ACTION_PLANS.map((p) => ({ ...p, orgId }));
    return this.inner.getActionPlans(orgId);
  }
  upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }) {
    if (isDemo(p.orgId)) return Promise.resolve(p.id ?? 1);
    return this.inner.upsertActionPlan(p);
  }
  deleteActionPlan(id: number) { return this.inner.deleteActionPlan(id); }

  // ── Mappings ──
  async getMappings(orgId: string): Promise<AccountMapping[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getMappings(orgId);
  }
  upsertMapping(m: AccountMapping) {
    if (isDemo(m.orgId)) return Promise.resolve();
    return this.inner.upsertMapping(m);
  }

  // ── Analytique (vide en démo) ──
  async getAnalyticAxes(orgId: string): Promise<AnalyticAxis[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getAnalyticAxes(orgId);
  }
  upsertAnalyticAxis(a: AnalyticAxis) {
    if (isDemo(a.orgId)) return Promise.resolve();
    return this.inner.upsertAnalyticAxis(a);
  }
  deleteAnalyticAxis(id: string) { return this.inner.deleteAnalyticAxis(id); }
  async getAnalyticCodes(orgId: string, axisId?: string): Promise<AnalyticCode[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getAnalyticCodes(orgId, axisId);
  }
  upsertAnalyticCode(c: AnalyticCode) {
    if (isDemo(c.orgId)) return Promise.resolve();
    return this.inner.upsertAnalyticCode(c);
  }
  bulkUpsertAnalyticCodes(codes: AnalyticCode[]) {
    if (codes[0] && isDemo(codes[0].orgId)) return Promise.resolve();
    return this.inner.bulkUpsertAnalyticCodes(codes);
  }
  deleteAnalyticCode(id: string) { return this.inner.deleteAnalyticCode(id); }
  detachAnalyticChildren(parentId: string) { return this.inner.detachAnalyticChildren(parentId); }
  async getAnalyticRules(orgId: string): Promise<AnalyticRule[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getAnalyticRules(orgId);
  }
  upsertAnalyticRule(r: AnalyticRule) {
    if (isDemo(r.orgId)) return Promise.resolve();
    return this.inner.upsertAnalyticRule(r);
  }
  deleteAnalyticRule(id: string) { return this.inner.deleteAnalyticRule(id); }
  updateAnalyticRulePriority(id: string, p: number) { return this.inner.updateAnalyticRulePriority(id, p); }
  async getAnalyticAssignments(orgId: string): Promise<AnalyticAssignment[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getAnalyticAssignments(orgId);
  }
  bulkInsertAnalyticAssignments(a: AnalyticAssignment[]) {
    if (a[0] && isDemo(a[0].orgId)) return Promise.resolve();
    return this.inner.bulkInsertAnalyticAssignments(a);
  }
  updateAnalyticAssignment(id: number, c: Partial<AnalyticAssignment>) { return this.inner.updateAnalyticAssignment(id, c); }
  deleteAnalyticAssignmentsByOrgFilter(orgId: string, p: (a: AnalyticAssignment) => boolean) {
    if (isDemo(orgId)) return Promise.resolve();
    return this.inner.deleteAnalyticAssignmentsByOrgFilter(orgId, p);
  }
  deleteAnalyticAssignmentsByCode(codeId: string) { return this.inner.deleteAnalyticAssignmentsByCode(codeId); }
  async getAnalyticBudgets(orgId: string): Promise<AnalyticBudget[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getAnalyticBudgets(orgId);
  }

  // ── Activities ──
  async getActivities(orgId: string): Promise<Activity[]> {
    if (isDemo(orgId)) {
      // Pas d'activités en démo (le module activity est riche, on simplifie)
      return [];
    }
    return this.inner.getActivities(orgId);
  }
  getActivity(id: number) { return this.inner.getActivity(id); }
  addActivity(act: Omit<Activity, 'id'>) {
    if (isDemo(act.orgId)) return Promise.resolve(1);
    return this.inner.addActivity(act);
  }
  updateActivity(id: number, c: Partial<Activity>) { return this.inner.updateActivity(id, c); }
  deleteActivity(id: number) { return this.inner.deleteActivity(id); }

  // ── Chat ──
  async getChannels(orgId: string): Promise<Channel[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getChannels(orgId);
  }
  getChannel(id: string) { return this.inner.getChannel(id); }
  upsertChannel(c: Channel) {
    if (isDemo(c.orgId)) return Promise.resolve();
    return this.inner.upsertChannel(c);
  }
  deleteChannel(id: string) { return this.inner.deleteChannel(id); }
  findChannel(orgId: string, p: (c: Channel) => boolean) {
    if (isDemo(orgId)) return Promise.resolve(undefined);
    return this.inner.findChannel(orgId, p);
  }
  getChatMessage(id: number) { return this.inner.getChatMessage(id); }
  getChatMessagesByChannel(channelId: string) { return this.inner.getChatMessagesByChannel(channelId); }
  async getChatMessagesByOrg(orgId: string): Promise<ChatMessage[]> {
    if (isDemo(orgId)) return [];
    return this.inner.getChatMessagesByOrg(orgId);
  }
  addChatMessage(msg: Omit<ChatMessage, 'id'>) {
    if (isDemo(msg.orgId)) return Promise.resolve(1);
    return this.inner.addChatMessage(msg);
  }
  updateChatMessage(id: number, c: Partial<ChatMessage>) { return this.inner.updateChatMessage(id, c); }
  deleteChatMessage(id: number) { return this.inner.deleteChatMessage(id); }

  // ── Espace Collaboratif ──
  // En démo, les espaces vivent dans Dexie (IndexedDB local) : la démo est
  // pleinement fonctionnelle sans jamais écrire dans Supabase.
  getSpaces(orgId: string) {
    if (isDemo(orgId)) return db.spaces.where('orgId').equals(orgId).reverse().sortBy('createdAt');
    return this.inner.getSpaces(orgId);
  }
  async getSpace(id: string) {
    const local = await db.spaces.get(id);
    if (local && isDemo(local.orgId)) return local;
    if (local) return local; // fallback local-first
    return this.inner.getSpace(id);
  }
  upsertSpace(s: Space) {
    if (isDemo(s.orgId)) return db.spaces.put(s).then(() => undefined);
    return this.inner.upsertSpace(s);
  }
  async getSpaceCriteria(spaceId: string) {
    const local = await db.spaceCriteria.where('spaceId').equals(spaceId).toArray();
    if (local.length && isDemo(local[0].orgId)) return local;
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return local;
    return this.inner.getSpaceCriteria(spaceId);
  }
  upsertSpaceCriterion(c: SpaceCriterion) {
    if (isDemo(c.orgId)) return db.spaceCriteria.put(c).then(() => undefined);
    return this.inner.upsertSpaceCriterion(c);
  }
  async getSpaceSolutions(spaceId: string) {
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return db.spaceSolutions.where('spaceId').equals(spaceId).toArray();
    return this.inner.getSpaceSolutions(spaceId);
  }
  upsertSpaceSolution(s: SpaceSolution) {
    if (isDemo(s.orgId)) return db.spaceSolutions.put(s).then(() => undefined);
    return this.inner.upsertSpaceSolution(s);
  }
  async getSpaceActions(spaceId: string) {
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return db.spaceActions.where('spaceId').equals(spaceId).toArray();
    return this.inner.getSpaceActions(spaceId);
  }
  getSpaceActionsByOrg(orgId: string) {
    if (isDemo(orgId)) return db.spaceActions.where('orgId').equals(orgId).toArray();
    return this.inner.getSpaceActionsByOrg(orgId);
  }
  upsertSpaceAction(a: SpaceAction) {
    if (isDemo(a.orgId)) return db.spaceActions.put(a).then(() => undefined);
    return this.inner.upsertSpaceAction(a);
  }
  async getSpaceEvents(spaceId: string) {
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return db.spaceEvents.where('spaceId').equals(spaceId).sortBy('createdAt');
    return this.inner.getSpaceEvents(spaceId);
  }
  addSpaceEvent(e: Omit<SpaceEvent, 'id'>) {
    // Append-only, même en démo : add() uniquement, jamais put/update/delete.
    if (isDemo(e.orgId)) return db.spaceEvents.add(e as SpaceEvent).then(() => undefined);
    return this.inner.addSpaceEvent(e);
  }
  async getSpaceDecisions(spaceId: string) {
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return db.spaceDecisions.where('spaceId').equals(spaceId).toArray();
    return this.inner.getSpaceDecisions(spaceId);
  }
  getSpaceDecisionsByOrg(orgId: string) {
    if (isDemo(orgId)) return db.spaceDecisions.where('orgId').equals(orgId).toArray();
    return this.inner.getSpaceDecisionsByOrg(orgId);
  }
  upsertSpaceDecision(d: SpaceDecision) {
    if (isDemo(d.orgId)) return db.spaceDecisions.put(d).then(() => undefined);
    return this.inner.upsertSpaceDecision(d);
  }
  async getSpaceSnapshots(spaceId: string) {
    const space = await db.spaces.get(spaceId);
    if (space && isDemo(space.orgId)) return db.spaceSnapshots.where('spaceId').equals(spaceId).reverse().sortBy('takenAt');
    return this.inner.getSpaceSnapshots(spaceId);
  }
  addSpaceSnapshot(s: Omit<SpaceSnapshot, 'id'>) {
    if (isDemo(s.orgId)) return db.spaceSnapshots.add(s as SpaceSnapshot).then(() => undefined);
    return this.inner.addSpaceSnapshot(s);
  }

  // ── Files ──
  uploadFile(orgId: string, fileName: string, file: File | Blob) {
    if (isDemo(orgId)) return Promise.resolve(`demo://${fileName}`);
    return this.inner.uploadFile(orgId, fileName, file);
  }
  downloadFile(path: string) { return this.inner.downloadFile(path); }
}

// Export the balance for use elsewhere
export { DEMO_BALANCE };
