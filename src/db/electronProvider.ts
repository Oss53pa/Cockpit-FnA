/**
 * ElectronProvider — implémentation SQLite via IPC.
 * Utilisée quand l'app tourne dans Electron (window.electronAPI présent).
 */
import type { DataProvider, GLFilter } from './provider';
import type { Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine, ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate } from './schema';

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

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const rows = await api().db.getAll('fiscal_years', { org_id: orgId });
    return rows.map(toCamel) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    await api().db.upsert('fiscal_years', { ...toSnake(fy), sync_status: 'pending' }, ['id']);
  }

  // Periods
  async getPeriods(orgId: string) {
    const rows = await api().db.query('SELECT * FROM periods WHERE org_id = ? ORDER BY month', [orgId]);
    return rows.map(toCamel) as Period[];
  }
  async upsertPeriod(p: Period) {
    await api().db.upsert('periods', { ...toSnake(p), sync_status: 'pending' }, ['id']);
  }

  // Accounts
  async getAccounts(orgId: string) {
    const rows = await api().db.getAll('accounts', { org_id: orgId });
    return rows.map(toCamel) as Account[];
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    for (const a of accounts) {
      await api().db.upsert('accounts', { ...toSnake(a), sync_status: 'pending' }, ['org_id', 'code']);
    }
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

  // File storage (local disk in Electron)
  async uploadFile(_orgId: string, _fileName: string, _file: File | Blob): Promise<string> {
    return '';
  }
  async downloadFile(_path: string): Promise<Blob> {
    return new Blob();
  }
}
