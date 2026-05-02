/**
 * SupabaseProvider — implémentation cloud PostgreSQL.
 * Utilisée quand VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont configurés.
 */
import type { DataProvider, GLFilter } from './provider';
import type { Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine, ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate } from './schema';
import { supabase } from '../lib/supabase';

import { toSnake, toCamel } from './caseConvert';

// ── Helpers ──────────────────────────────────────────────────────────
function check<T>(result: { data: T | null; error: any }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ── Provider ─────────────────────────────────────────────────────────
export class SupabaseProvider implements DataProvider {
  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const { data } = await supabase.from('fna_organizations').select('*');
    return (data ?? []).map(r => toCamel(r)) as Organization[];
  }
  async getOrganization(id: string) {
    const { data } = await supabase.from('fna_organizations').select('*').eq('id', id).single();
    return data ? toCamel(data) as Organization : undefined;
  }
  async upsertOrganization(org: Organization) {
    check(await supabase.from('fna_organizations').upsert(toSnake(org)));
  }
  async deleteOrganization(id: string) {
    check(await supabase.from('fna_organizations').delete().eq('id', id));
  }

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const { data } = await supabase.from('fna_fiscal_years').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    check(await supabase.from('fna_fiscal_years').upsert(toSnake(fy)));
  }

  // Periods
  async getPeriods(orgId: string) {
    const { data } = await supabase.from('fna_periods').select('*').eq('org_id', orgId).order('month');
    return (data ?? []).map(r => toCamel(r)) as Period[];
  }
  async upsertPeriod(p: Period) {
    check(await supabase.from('fna_periods').upsert(toSnake(p)));
  }

  // Accounts
  async getAccounts(orgId: string) {
    const { data } = await supabase.from('fna_accounts').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as Account[];
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    const rows = accounts.map(a => toSnake(a));
    // Batch in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_accounts').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteAccounts(orgId: string) {
    check(await supabase.from('fna_accounts').delete().eq('org_id', orgId));
  }

  // GL Entries
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    let q = supabase.from('fna_gl_entries').select('*').eq('org_id', filter.orgId);
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
      check(await supabase.from('fna_gl_entries').insert(rows.slice(i, i + 500)));
    }
  }
  async deleteGLByImport(importId: number) {
    check(await supabase.from('fna_gl_entries').delete().eq('import_id', importId));
  }

  // Imports
  async getImports(orgId: string) {
    const { data } = await supabase.from('fna_imports').select('*').eq('org_id', orgId).order('date', { ascending: false });
    return (data ?? []).map(r => toCamel(r)) as ImportLog[];
  }
  async addImport(log: Omit<ImportLog, 'id'>): Promise<number> {
    const row = toSnake(log);
    delete row.id;
    const result = check(await supabase.from('fna_imports').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteImport(id: number) {
    check(await supabase.from('fna_imports').delete().eq('id', id));
  }

  // Budgets
  async getBudgets(orgId: string, year: number, version: string) {
    const { data } = await supabase.from('fna_budgets').select('*')
      .eq('org_id', orgId).eq('year', year).eq('version', version);
    return (data ?? []).map(r => toCamel(r)) as BudgetLine[];
  }
  async getAllBudgets(orgId: string) {
    const { data } = await supabase.from('fna_budgets').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as BudgetLine[];
  }
  async bulkUpsertBudgets(lines: BudgetLine[]) {
    const rows = lines.map(l => toSnake(l));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_budgets').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteBudgets(orgId: string, year: number, version: string) {
    check(await supabase.from('fna_budgets').delete().eq('org_id', orgId).eq('year', year).eq('version', version));
  }

  // Reports
  async getReports(orgId: string) {
    const { data } = await supabase.from('fna_reports').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ReportDoc[];
  }
  async getReport(id: number) {
    const { data } = await supabase.from('fna_reports').select('*').eq('id', id).single();
    return data ? toCamel(data) as ReportDoc : undefined;
  }
  async upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(doc);
    if (doc.id) {
      check(await supabase.from('fna_reports').update(row).eq('id', doc.id));
      return doc.id;
    }
    delete row.id;
    const result = check(await supabase.from('fna_reports').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteReport(id: number) {
    check(await supabase.from('fna_reports').delete().eq('id', id));
  }

  // Templates
  async getTemplates(orgId: string) {
    const { data } = await supabase.from('fna_report_templates').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ReportTemplate[];
  }
  async upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(t);
    if (t.id) {
      check(await supabase.from('fna_report_templates').update(row).eq('id', t.id));
      return t.id;
    }
    delete row.id;
    const result = check(await supabase.from('fna_report_templates').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteTemplate(id: number) {
    check(await supabase.from('fna_report_templates').delete().eq('id', id));
  }

  // Attention points
  async getAttentionPoints(orgId: string) {
    const { data } = await supabase.from('fna_attention_points').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as AttentionPoint[];
  }
  async upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await supabase.from('fna_attention_points').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await supabase.from('fna_attention_points').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteAttentionPoint(id: number) {
    check(await supabase.from('fna_attention_points').delete().eq('id', id));
  }

  // Action plans
  async getActionPlans(orgId: string) {
    const { data } = await supabase.from('fna_action_plans').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as ActionPlan[];
  }
  async upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await supabase.from('fna_action_plans').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await supabase.from('fna_action_plans').insert(row).select('id').single());
    return (result as any).id;
  }
  async deleteActionPlan(id: number) {
    check(await supabase.from('fna_action_plans').delete().eq('id', id));
  }

  // Mappings
  async getMappings(orgId: string) {
    const { data } = await supabase.from('fna_account_mappings').select('*').eq('org_id', orgId);
    return (data ?? []).map(r => toCamel(r)) as AccountMapping[];
  }
  async upsertMapping(m: AccountMapping) {
    check(await supabase.from('fna_account_mappings').upsert(toSnake(m)));
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
