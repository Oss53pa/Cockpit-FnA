/**
 * DexieProvider — implémentation locale IndexedDB (comportement actuel).
 * Sert de fallback quand Supabase n'est pas configuré ou hors ligne.
 */
import type { DataProvider, GLFilter } from './provider';
import { db, type Organization, type FiscalYear, type Period, type Account, type GLEntry, type ImportLog, type BudgetLine, type ReportDoc, type AttentionPoint, type ActionPlan, type AccountMapping, type ReportTemplate } from './schema';

export class DexieProvider implements DataProvider {
  // Organizations
  async getOrganizations() { return db.organizations.toArray(); }
  async getOrganization(id: string) { return db.organizations.get(id); }
  async upsertOrganization(org: Organization) { await db.organizations.put(org); }
  async deleteOrganization(id: string) { await db.organizations.delete(id); }

  // Fiscal years
  async getFiscalYears(orgId: string) { return db.fiscalYears.where('orgId').equals(orgId).toArray(); }
  async upsertFiscalYear(fy: FiscalYear) { await db.fiscalYears.put(fy); }

  // Periods
  async getPeriods(orgId: string) { return db.periods.where('orgId').equals(orgId).sortBy('month'); }
  async upsertPeriod(p: Period) { await db.periods.put(p); }

  // Accounts
  async getAccounts(orgId: string) { return db.accounts.where('orgId').equals(orgId).toArray(); }
  async bulkUpsertAccounts(accounts: Account[]) { await db.accounts.bulkPut(accounts); }
  async deleteAccounts(orgId: string) { await db.accounts.where('orgId').equals(orgId).delete(); }

  // GL Entries
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    let col = db.gl.where('[orgId+periodId]');
    if (filter.periodId) {
      return col.equals([filter.orgId, filter.periodId]).toArray();
    }
    // All entries for org
    const all = await db.gl.where('orgId').equals(filter.orgId).toArray();
    if (filter.importId) return all.filter(e => String(e.importId) === String(filter.importId));
    return all;
  }
  async bulkInsertGL(entries: GLEntry[]) { await db.gl.bulkAdd(entries); }
  async deleteGLByImport(importId: number) { await db.gl.where('importId').equals(String(importId)).delete(); }

  // Imports
  async getImports(orgId: string) { return db.imports.where('orgId').equals(orgId).reverse().sortBy('date'); }
  async addImport(log: Omit<ImportLog, 'id'>): Promise<number> { return db.imports.add(log as ImportLog) as Promise<number>; }
  async deleteImport(id: number) { await db.imports.delete(id); }

  // Budgets
  async getBudgets(orgId: string, year: number, version: string) {
    return db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).toArray();
  }
  async getAllBudgets(orgId: string) { return db.budgets.where('orgId').equals(orgId).toArray(); }
  async bulkUpsertBudgets(lines: BudgetLine[]) { await db.budgets.bulkPut(lines); }
  async deleteBudgets(orgId: string, year: number, version: string) {
    await db.budgets.where('[orgId+year+version]').equals([orgId, year, version]).delete();
  }

  // Reports
  async getReports(orgId: string) { return db.reports.where('orgId').equals(orgId).toArray(); }
  async getReport(id: number) { return db.reports.get(id); }
  async upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number> {
    if (doc.id) { await db.reports.put(doc as ReportDoc); return doc.id; }
    return db.reports.add(doc as ReportDoc) as Promise<number>;
  }
  async deleteReport(id: number) { await db.reports.delete(id); }

  // Templates
  async getTemplates(orgId: string) { return db.templates.where('orgId').equals(orgId).toArray(); }
  async upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number> {
    if (t.id) { await db.templates.put(t as ReportTemplate); return t.id; }
    return db.templates.add(t as ReportTemplate) as Promise<number>;
  }
  async deleteTemplate(id: number) { await db.templates.delete(id); }

  // Attention points
  async getAttentionPoints(orgId: string) { return db.attentionPoints.where('orgId').equals(orgId).toArray(); }
  async upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number> {
    if (p.id) { await db.attentionPoints.put(p as AttentionPoint); return p.id; }
    return db.attentionPoints.add(p as AttentionPoint) as Promise<number>;
  }
  async deleteAttentionPoint(id: number) { await db.attentionPoints.delete(id); }

  // Action plans
  async getActionPlans(orgId: string) { return db.actionPlans.where('orgId').equals(orgId).toArray(); }
  async upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number> {
    if (p.id) { await db.actionPlans.put(p as ActionPlan); return p.id; }
    return db.actionPlans.add(p as ActionPlan) as Promise<number>;
  }
  async deleteActionPlan(id: number) { await db.actionPlans.delete(id); }

  // Mappings
  async getMappings(orgId: string) { return db.mappings.where('orgId').equals(orgId).toArray(); }
  async upsertMapping(m: AccountMapping) { await db.mappings.put(m); }

  // File storage (local: not supported, return empty)
  async uploadFile(_orgId: string, _fileName: string, _file: File | Blob): Promise<string> {
    return '';
  }
  async downloadFile(_path: string): Promise<Blob> {
    return new Blob();
  }
}
