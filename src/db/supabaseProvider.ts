/**
 * SupabaseProvider — implémentation cloud PostgreSQL.
 * Utilisée quand VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont configurés.
 */
import type { DataProvider, GLFilter } from './provider';
import type { Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine, ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate } from './schema';
import { supabase } from '../lib/supabase';

// ── Helpers ──────────────────────────────────────────────────────────
function check<T>(result: { data: T | null; error: any }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Convert camelCase Dexie row to snake_case Supabase row */
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    // remap known fields
    if (k === 'orgId') out.org_id = v;
    else if (k === 'periodId') out.period_id = v;
    else if (k === 'fiscalYearId') out.fiscal_year_id = v;
    else if (k === 'syscoCode') out.sysco_code = v;
    else if (k === 'importId') out.import_id = v;
    else if (k === 'fileHash') out.file_hash = v;
    else if (k === 'fileName') out.file_name = v;
    else if (k === 'createdAt') out.created_at = v;
    else if (k === 'updatedAt') out.updated_at = v;
    else if (k === 'completedAt') out.completed_at = v;
    else if (k === 'resolvedAt') out.resolved_at = v;
    else if (k === 'detectedAt') out.detected_at = v;
    else if (k === 'accountingSystem') out.accounting_system = v;
    else if (k === 'startDate') out.start_date = v;
    else if (k === 'endDate') out.end_date = v;
    else if (k === 'sourceCode') out.source_code = v;
    else if (k === 'targetCode') out.target_code = v;
    else if (k === 'analyticalAxis') out.analytical_axis = v;
    else if (k === 'analyticalSection') out.analytical_section = v;
    else if (k === 'storagePath') out.storage_path = v;
    else if (k === 'attentionPointId') out.attention_point_id = v;
    else if (k === 'detectedBy') out.detected_by = v;
    else if (k === 'targetResolutionDate') out.target_resolution_date = v;
    else if (k === 'estimatedFinancialImpact') out.estimated_financial_impact = v;
    else if (k === 'impactDescription') out.impact_description = v;
    else if (k === 'rootCause') out.root_cause = v;
    else if (k === 'lastReviewedAt') out.last_reviewed_at = v;
    else if (k === 'resolvedNote') out.resolved_note = v;
    else if (k === 'dueDate') out.due_date = v;
    else if (k === 'reviewDate') out.review_date = v;
    else if (k === 'budgetAllocated') out.budget_allocated = v;
    else if (k === 'resourcesNeeded') out.resources_needed = v;
    else if (k === 'successCriteria') out.success_criteria = v;
    else if (k === 'estimatedImpact') out.estimated_impact = v;
    else if (k === 'codeName') out.code_name = v;
    else if (k === 'shortLabel') out.short_label = v;
    else if (k === 'longLabel') out.long_label = v;
    else if (k === 'parentId') out.parent_id = v;
    else if (k === 'axisId') out.axis_id = v;
    else out[sk] = v;
  }
  return out;
}

/** Convert snake_case Supabase row to camelCase Dexie-compatible row */
function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    // remap user_name → user for ImportLog compat
    if (k === 'user_name') out.user = v;
    else out[ck] = v;
  }
  return out;
}

// ── Provider ─────────────────────────────────────────────────────────
export class SupabaseProvider implements DataProvider {
  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const { data } = await supabase.from('organizations').select('*');
    return (data ?? []).map(r => toCamel(r)) as Organization[];
  }
  async getOrganization(id: string) {
    const { data } = await supabase.from('organizations').select('*').eq('id', id).single();
    return data ? toCamel(data) as Organization : undefined;
  }
  async upsertOrganization(org: Organization) {
    check(await supabase.from('organizations').upsert(toSnake(org)));
  }
  async deleteOrganization(id: string) {
    check(await supabase.from('organizations').delete().eq('id', id));
  }

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const { data } = await supabase.from('fiscal_years').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    check(await supabase.from('fiscal_years').upsert(toSnake(fy)));
  }

  // Periods
  async getPeriods(orgId: string) {
    const { data } = await supabase.from('periods').select('*').eq('org_id', orgId).order('month');
    return (data ?? []).map(r => toCamel(r)) as Period[];
  }
  async upsertPeriod(p: Period) {
    check(await supabase.from('periods').upsert(toSnake(p)));
  }

  // Accounts
  async getAccounts(orgId: string) {
    const { data } = await supabase.from('accounts').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as Account[];
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    const rows = accounts.map(a => toSnake(a));
    // Batch in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('accounts').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteAccounts(orgId: string) {
    check(await supabase.from('accounts').delete().eq('org_id', orgId));
  }

  // GL Entries
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    let q = supabase.from('gl_entries').select('*').eq('org_id', filter.orgId);
    if (filter.periodId) q = q.eq('period_id', filter.periodId);
    if (filter.importId) q = q.eq('import_id', filter.importId);
    if (filter.account) q = q.eq('account', filter.account);
    if (filter.fromDate) q = q.gte('date', filter.fromDate);
    if (filter.toDate) q = q.lte('date', filter.toDate);
    const { data } = await q;
    return (data ?? []).map(r => toCamel(r)) as GLEntry[];
  }
  async bulkInsertGL(entries: GLEntry[]) {
    const rows = entries.map(e => toSnake(e));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('gl_entries').insert(rows.slice(i, i + 500)));
    }
  }
  async deleteGLByImport(importId: number) {
    check(await supabase.from('gl_entries').delete().eq('import_id', importId));
  }

  // Imports
  async getImports(orgId: string) {
    const { data } = await supabase.from('imports').select('*').eq('org_id', orgId).order('date', { ascending: false });
    return (data ?? []).map(r => toCamel(r)) as ImportLog[];
  }
  async addImport(log: Omit<ImportLog, 'id'>): Promise<number> {
    const row = toSnake(log);
    delete row.id;
    const result = check(await supabase.from('imports').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteImport(id: number) {
    check(await supabase.from('imports').delete().eq('id', id));
  }

  // Budgets
  async getBudgets(orgId: string, year: number, version: string) {
    const { data } = await supabase.from('budgets').select('*')
      .eq('org_id', orgId).eq('year', year).eq('version', version);
    return (data ?? []).map(r => toCamel(r)) as BudgetLine[];
  }
  async getAllBudgets(orgId: string) {
    const { data } = await supabase.from('budgets').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as BudgetLine[];
  }
  async bulkUpsertBudgets(lines: BudgetLine[]) {
    const rows = lines.map(l => toSnake(l));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('budgets').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteBudgets(orgId: string, year: number, version: string) {
    check(await supabase.from('budgets').delete().eq('org_id', orgId).eq('year', year).eq('version', version));
  }

  // Reports
  async getReports(orgId: string) {
    const { data } = await supabase.from('reports').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ReportDoc[];
  }
  async getReport(id: number) {
    const { data } = await supabase.from('reports').select('*').eq('id', id).single();
    return data ? toCamel(data) as ReportDoc : undefined;
  }
  async upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(doc);
    if (doc.id) {
      check(await supabase.from('reports').update(row).eq('id', doc.id));
      return doc.id;
    }
    delete row.id;
    const result = check(await supabase.from('reports').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteReport(id: number) {
    check(await supabase.from('reports').delete().eq('id', id));
  }

  // Templates
  async getTemplates(orgId: string) {
    const { data } = await supabase.from('report_templates').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ReportTemplate[];
  }
  async upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(t);
    if (t.id) {
      check(await supabase.from('report_templates').update(row).eq('id', t.id));
      return t.id;
    }
    delete row.id;
    const result = check(await supabase.from('report_templates').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteTemplate(id: number) {
    check(await supabase.from('report_templates').delete().eq('id', id));
  }

  // Attention points
  async getAttentionPoints(orgId: string) {
    const { data } = await supabase.from('attention_points').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as AttentionPoint[];
  }
  async upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await supabase.from('attention_points').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await supabase.from('attention_points').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteAttentionPoint(id: number) {
    check(await supabase.from('attention_points').delete().eq('id', id));
  }

  // Action plans
  async getActionPlans(orgId: string) {
    const { data } = await supabase.from('action_plans').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ActionPlan[];
  }
  async upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await supabase.from('action_plans').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await supabase.from('action_plans').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteActionPlan(id: number) {
    check(await supabase.from('action_plans').delete().eq('id', id));
  }

  // Mappings
  async getMappings(orgId: string) {
    const { data } = await supabase.from('account_mappings').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as AccountMapping[];
  }
  async upsertMapping(m: AccountMapping) {
    check(await supabase.from('account_mappings').upsert(toSnake(m)));
  }

  // File storage
  async uploadFile(orgId: string, fileName: string, file: File | Blob): Promise<string> {
    const path = `${orgId}/${Date.now()}_${fileName}`;
    const { error } = await supabase.storage.from('imports').upload(path, file);
    if (error) throw new Error(error.message);
    return path;
  }
  async downloadFile(path: string): Promise<Blob> {
    const { data, error } = await supabase.storage.from('imports').download(path);
    if (error) throw new Error(error.message);
    return data;
  }
}
