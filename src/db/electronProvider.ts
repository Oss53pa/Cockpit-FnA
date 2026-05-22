/**
 * ElectronProvider — implémentation SQLite via IPC.
 * Utilisée quand l'app tourne dans Electron (window.electronAPI présent).
 */
import type { DataProvider, GLFilter } from './provider';
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine,
  ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate,
  AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, AnalyticBudget,
  Activity, Channel, ChatMessage,
} from './schema';

const api = () => (window as any).electronAPI;

/** Convert camelCase to snake_case for SQLite */
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    out[sk] = v;
  }
  return out;
}

/** Convert snake_case to camelCase */
function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = v;
  }
  return out;
}

export class ElectronProvider implements DataProvider {
  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const rows = await api().db.getAll('organizations');
    return rows.map(toCamel) as Organization[];
  }
  async getOrganization(id: string) {
    const row = await api().db.getOne('organizations', { id });
    return row ? toCamel(row) as Organization : undefined;
  }
  async upsertOrganization(org: Organization) {
    await api().db.upsert('organizations', { ...toSnake(org), sync_status: 'pending' }, ['id']);
  }
  async deleteOrganization(id: string) {
    await api().db.deleteRows('organizations', { id });
  }
  async deleteOrganizationCascade(id: string) {
    const tables = [
      'gl_entries', 'imports', 'budgets', 'account_mappings', 'accounts',
      'periods', 'fiscal_years', 'attention_points', 'action_plans',
      'reports', 'report_templates',
    ];
    for (const t of tables) {
      try { await api().db.deleteRows(t, { org_id: id }); } catch { /* ignore */ }
    }
    await api().db.deleteRows('organizations', { id });
  }

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const rows = await api().db.getAll('fiscal_years', { org_id: orgId });
    return rows.map(toCamel) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    await api().db.upsert('fiscal_years', { ...toSnake(fy), sync_status: 'pending' }, ['id']);
  }
  async bulkUpsertFiscalYears(fys: FiscalYear[]) {
    for (const fy of fys) {
      await api().db.upsert('fiscal_years', { ...toSnake(fy), sync_status: 'pending' }, ['id']);
    }
  }
  async deleteFiscalYearCascade(fy: FiscalYear) {
    await api().db.run(
      'DELETE FROM gl_entries WHERE org_id = ? AND date >= ? AND date <= ?',
      [fy.orgId, `${fy.year}-01-01`, `${fy.year}-12-31`],
    );
    await api().db.deleteRows('periods', { fiscal_year_id: fy.id });
    await api().db.deleteRows('fiscal_years', { id: fy.id });
  }
  async setFiscalYearClosed(fy: FiscalYear, closed: boolean) {
    await api().db.run('UPDATE fiscal_years SET closed = ? WHERE id = ?', [closed ? 1 : 0, fy.id]);
    await api().db.run('UPDATE periods SET closed = ? WHERE fiscal_year_id = ?', [closed ? 1 : 0, fy.id]);
  }

  // Periods
  async getPeriods(orgId: string) {
    const rows = await api().db.query('SELECT * FROM periods WHERE org_id = ? ORDER BY month', [orgId]);
    return rows.map(toCamel) as Period[];
  }
  async upsertPeriod(p: Period) {
    await api().db.upsert('periods', { ...toSnake(p), sync_status: 'pending' }, ['id']);
  }
  async bulkUpsertPeriods(ps: Period[]) {
    for (const p of ps) {
      await api().db.upsert('periods', { ...toSnake(p), sync_status: 'pending' }, ['id']);
    }
  }

  // Accounts
  async getAccounts(orgId: string) {
    const rows = await api().db.getAll('accounts', { org_id: orgId });
    return rows.map(toCamel) as Account[];
  }
  async getAccount(orgId: string, code: string) {
    const rows = await api().db.query('SELECT * FROM accounts WHERE org_id = ? AND code = ? LIMIT 1', [orgId, code]);
    return rows[0] ? toCamel(rows[0]) as Account : undefined;
  }
  async upsertAccount(account: Account) {
    await api().db.upsert('accounts', { ...toSnake(account), sync_status: 'pending' }, ['org_id', 'code']);
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    for (const a of accounts) {
      await api().db.upsert('accounts', { ...toSnake(a), sync_status: 'pending' }, ['org_id', 'code']);
    }
  }
  async deleteAccount(orgId: string, code: string) {
    await api().db.deleteRows('accounts', { org_id: orgId, code });
  }
  async deleteAccounts(orgId: string) {
    await api().db.deleteRows('accounts', { org_id: orgId });
  }

  // GL Entries
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    let sql = 'SELECT * FROM gl_entries WHERE org_id = ?';
    const params: any[] = [filter.orgId];
    if (filter.periodId) { sql += ' AND period_id = ?'; params.push(filter.periodId); }
    if (filter.importId) { sql += ' AND import_id = ?'; params.push(filter.importId); }
    if (filter.account) { sql += ' AND account = ?'; params.push(filter.account); }
    if (filter.fromDate) { sql += ' AND date >= ?'; params.push(filter.fromDate); }
    if (filter.toDate) { sql += ' AND date <= ?'; params.push(filter.toDate); }
    const rows = await api().db.query(sql, params);
    return rows.map(toCamel) as GLEntry[];
  }
  async bulkInsertGL(entries: GLEntry[]) {
    if (!entries.length) return;
    const cols = ['org_id', 'period_id', 'date', 'journal', 'piece', 'account', 'label', 'debit', 'credit', 'tiers', 'analytical_axis', 'analytical_section', 'lettrage', 'import_id', 'sync_status'];
    const rows = entries.map(e => {
      const s = toSnake(e);
      return cols.map(c => c === 'sync_status' ? 'pending' : s[c] ?? null);
    });
    await api().db.bulkInsert('gl_entries', cols, rows);
  }
  async bulkUpsertGL(entries: GLEntry[]) {
    for (const e of entries) {
      await api().db.upsert('gl_entries', { ...toSnake(e), sync_status: 'pending' }, ['id']);
    }
  }
  async updateGLEntry(id: number, changes: Partial<GLEntry>) {
    await api().db.upsert('gl_entries', { id, ...toSnake(changes), sync_status: 'pending' }, ['id']);
  }
  async deleteGLByImport(importId: number) {
    await api().db.deleteRows('gl_entries', { import_id: importId });
  }

  // Imports
  async getImports(orgId: string) {
    const rows = await api().db.query('SELECT * FROM imports WHERE org_id = ? ORDER BY date DESC', [orgId]);
    return rows.map(toCamel) as ImportLog[];
  }
  async addImport(log: Omit<ImportLog, 'id'>): Promise<number> {
    const row = { ...toSnake(log), sync_status: 'pending' };
    delete (row as any).id;
    const result = await api().db.run(
      `INSERT INTO imports (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
      Object.values(row)
    );
    return result.lastInsertRowid;
  }
  async deleteImport(id: number) {
    await api().db.deleteRows('imports', { id });
  }

  // Tiers unmatched — non implémenté en Electron pour l'instant (chemin Supabase prioritaire).
  // Les stubs renvoient des valeurs vides pour éviter de casser l'interface DataProvider.
  // À implémenter le jour où le mode Electron a une table tiers_unmatched en SQLite local.
  async getTiersUnmatched(_orgId: string, _opts?: { onlyPending?: boolean; importId?: number }) {
    return [];
  }
  async bulkInsertTiersUnmatched(_rows: any[]) {
    /* noop en Electron — voir TODO ci-dessus */
  }
  async updateTiersUnmatched(_id: number, _changes: any) {
    /* noop */
  }
  async deleteTiersUnmatched(_id: number) {
    /* noop */
  }
  async deleteTiersUnmatchedByImport(_importId: number) {
    /* noop */
  }

  // Tiers rules — non implémenté en Electron (chemin Supabase prioritaire).
  async getTiersRules(_orgId: string) {
    return [];
  }
  async upsertTiersRule(_rule: any): Promise<number> {
    return _rule?.id ?? 0;
  }
  async deleteTiersRule(_id: number) {
    /* noop */
  }

  // Budgets
  async getBudgets(orgId: string, year: number, version: string) {
    const rows = await api().db.query(
      'SELECT * FROM budgets WHERE org_id = ? AND year = ? AND version = ?',
      [orgId, year, version]
    );
    return rows.map(toCamel) as BudgetLine[];
  }
  async getAllBudgets(orgId: string) {
    const rows = await api().db.getAll('budgets', { org_id: orgId });
    return rows.map(toCamel) as BudgetLine[];
  }
  async getBudgetsByYear(orgId: string, year: number) {
    const rows = await api().db.query(
      'SELECT * FROM budgets WHERE org_id = ? AND year = ?',
      [orgId, year]
    );
    return rows.map(toCamel) as BudgetLine[];
  }
  async deleteAllBudgets(orgId: string) {
    await api().db.deleteRows('budgets', { org_id: orgId });
  }
  async deleteImportsByKind(orgId: string, kind: ImportLog['kind']) {
    await api().db.deleteRows('imports', { org_id: orgId, kind });
  }
  async bulkUpsertBudgets(lines: BudgetLine[]) {
    for (const l of lines) {
      await api().db.upsert('budgets', { ...toSnake(l), sync_status: 'pending' }, ['id']);
    }
  }
  async deleteBudgets(orgId: string, year: number, version: string) {
    await api().db.run(
      'DELETE FROM budgets WHERE org_id = ? AND year = ? AND version = ?',
      [orgId, year, version]
    );
  }

  // Reports
  async getReports(orgId: string) {
    const rows = await api().db.getAll('reports', { org_id: orgId });
    return rows.map(toCamel) as ReportDoc[];
  }
  async getReport(id: number) {
    const row = await api().db.getOne('reports', { id });
    return row ? toCamel(row) as ReportDoc : undefined;
  }
  async upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number> {
    const row = { ...toSnake(doc), sync_status: 'pending' };
    if (doc.id) {
      await api().db.upsert('reports', row, ['id']);
      return doc.id;
    }
    delete (row as any).id;
    const result = await api().db.run(
      `INSERT INTO reports (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
      Object.values(row)
    );
    return result.lastInsertRowid;
  }
  async deleteReport(id: number) { await api().db.deleteRows('reports', { id }); }

  // Templates
  async getTemplates(orgId: string) {
    const rows = await api().db.getAll('report_templates', { org_id: orgId });
    return rows.map(toCamel) as ReportTemplate[];
  }
  async upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number> {
    const row = { ...toSnake(t), sync_status: 'pending' };
    if (t.id) { await api().db.upsert('report_templates', row, ['id']); return t.id; }
    delete (row as any).id;
    const result = await api().db.run(
      `INSERT INTO report_templates (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
      Object.values(row)
    );
    return result.lastInsertRowid;
  }
  async deleteTemplate(id: number) { await api().db.deleteRows('report_templates', { id }); }

  // Attention points
  async getAttentionPoints(orgId: string) {
    const rows = await api().db.getAll('attention_points', { org_id: orgId });
    return rows.map(toCamel) as AttentionPoint[];
  }
  async upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number> {
    const row = { ...toSnake(p), sync_status: 'pending' };
    if (p.id) { await api().db.upsert('attention_points', row, ['id']); return p.id; }
    delete (row as any).id;
    const result = await api().db.run(
      `INSERT INTO attention_points (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
      Object.values(row)
    );
    return result.lastInsertRowid;
  }
  async deleteAttentionPoint(id: number) { await api().db.deleteRows('attention_points', { id }); }

  // Action plans
  async getActionPlans(orgId: string) {
    const rows = await api().db.getAll('action_plans', { org_id: orgId });
    return rows.map(toCamel) as ActionPlan[];
  }
  async upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number> {
    const row = { ...toSnake(p), sync_status: 'pending' };
    if (p.id) { await api().db.upsert('action_plans', row, ['id']); return p.id; }
    delete (row as any).id;
    const result = await api().db.run(
      `INSERT INTO action_plans (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
      Object.values(row)
    );
    return result.lastInsertRowid;
  }
  async deleteActionPlan(id: number) { await api().db.deleteRows('action_plans', { id }); }

  // Mappings
  async getMappings(orgId: string) {
    const rows = await api().db.getAll('account_mappings', { org_id: orgId });
    return rows.map(toCamel) as AccountMapping[];
  }
  async upsertMapping(m: AccountMapping) {
    await api().db.upsert('account_mappings', { ...toSnake(m), sync_status: 'pending' }, ['org_id', 'source_code']);
  }

  // ── Analytique / Activités / Chat — STUBS Electron ─────────────────
  // Le build Electron est secondaire. Si vous l'utilisez, étendez ces stubs
  // avec les vraies tables SQLite. Pour l'instant, ils retournent des collections
  // vides et lèvent sur les écritures pour signaler le manque d'implémentation.
  private notImpl(): never { throw new Error('Méthode non implémentée pour Electron — utilisez Supabase.'); }

  async getAnalyticAxes(_orgId: string): Promise<AnalyticAxis[]> { return []; }
  async upsertAnalyticAxis(_a: AnalyticAxis) { this.notImpl(); }
  async deleteAnalyticAxis(_id: string) { this.notImpl(); }

  async getAnalyticCodes(_orgId: string, _axisId?: string): Promise<AnalyticCode[]> { return []; }
  async upsertAnalyticCode(_c: AnalyticCode) { this.notImpl(); }
  async bulkUpsertAnalyticCodes(_cs: AnalyticCode[]) { this.notImpl(); }
  async deleteAnalyticCode(_id: string) { this.notImpl(); }
  async detachAnalyticChildren(_parentId: string) { this.notImpl(); }

  async getAnalyticRules(_orgId: string): Promise<AnalyticRule[]> { return []; }
  async upsertAnalyticRule(_r: AnalyticRule) { this.notImpl(); }
  async deleteAnalyticRule(_id: string) { this.notImpl(); }
  async updateAnalyticRulePriority(_id: string, _p: number) { this.notImpl(); }

  async getAnalyticAssignments(_orgId: string): Promise<AnalyticAssignment[]> { return []; }
  async bulkInsertAnalyticAssignments(_xs: AnalyticAssignment[]) { this.notImpl(); }
  async updateAnalyticAssignment(_id: number, _changes: Partial<AnalyticAssignment>) { this.notImpl(); }
  async deleteAnalyticAssignmentsByOrgFilter(_orgId: string, _pred: (a: AnalyticAssignment) => boolean) { this.notImpl(); }
  async deleteAnalyticAssignmentsByCode(_codeId: string) { this.notImpl(); }

  async getAnalyticBudgets(_orgId: string): Promise<AnalyticBudget[]> { return []; }

  async getActivities(_orgId: string): Promise<Activity[]> { return []; }
  async getActivity(_id: number): Promise<Activity | undefined> { return undefined; }
  async addActivity(_a: Omit<Activity, 'id'>): Promise<number> { return this.notImpl(); }
  async updateActivity(_id: number, _changes: Partial<Activity>) { this.notImpl(); }
  async deleteActivity(_id: number) { this.notImpl(); }

  async getChannels(_orgId: string): Promise<Channel[]> { return []; }
  async getChannel(_id: string): Promise<Channel | undefined> { return undefined; }
  async upsertChannel(_c: Channel) { this.notImpl(); }
  async deleteChannel(_id: string) { this.notImpl(); }
  async findChannel(_orgId: string, _pred: (c: Channel) => boolean): Promise<Channel | undefined> { return undefined; }

  async getChatMessage(_id: number): Promise<ChatMessage | undefined> { return undefined; }
  async getChatMessagesByChannel(_channelId: string): Promise<ChatMessage[]> { return []; }
  async getChatMessagesByOrg(_orgId: string): Promise<ChatMessage[]> { return []; }
  async addChatMessage(_msg: Omit<ChatMessage, 'id'>): Promise<number> { return this.notImpl(); }
  async updateChatMessage(_id: number, _changes: Partial<ChatMessage>) { this.notImpl(); }
  async deleteChatMessage(_id: number) { this.notImpl(); }

  // File storage (local disk in Electron)
  async uploadFile(_orgId: string, _fileName: string, _file: File | Blob): Promise<string> {
    return '';
  }
  async downloadFile(_path: string): Promise<Blob> {
    return new Blob();
  }
}
