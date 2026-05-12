/**
 * SupabaseProvider — implémentation cloud PostgreSQL.
 * Utilisée quand VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont configurés.
 */
import type { DataProvider, GLFilter } from './provider';
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine,
  ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate,
  AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, AnalyticBudget,
  Activity, Channel, ChatMessage,
} from './schema';
import { supabase as supabaseTyped } from '../lib/supabase';

import { toSnake, toCamel } from './caseConvert';

// Les tables fna_* ne sont pas declarees dans le type Database (qui contient
// la version sans prefixe pour la compatibilite multi-app). On bypasse donc le
// type checking sur from() pour ces tables — retour brut RPC standard.
const supabase = supabaseTyped as any;

// ── Helpers ──────────────────────────────────────────────────────────
function check<T>(result: { data: T | null; error: any }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ── Provider ─────────────────────────────────────────────────────────
export class SupabaseProvider implements DataProvider {
  // Organizations
  /**
   * Récupère UNIQUEMENT les organisations de l'utilisateur courant via JOIN
   * fna_user_orgs → fna_organizations. Retourne aussi le `role` (admin/editor/viewer).
   *
   * Sans authentification (ex. mode démo non logué), Supabase RLS bloque
   * les SELECT et on retourne []. Le DemoProvider injecte la DEMO_ORG en
   * amont (cf. demoProvider.ts) pour ce cas.
   */
  async getOrganizations(): Promise<Organization[]> {
    // 1) Récupère l'user courant
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      // Pas de session → fallback sur SELECT direct (RLS protège déjà)
      const { data } = await supabase.from('fna_organizations').select('*');
      return (data ?? []).map((r: any) => toCamel(r)) as Organization[];
    }

    // 2) JOIN fna_user_orgs → fna_organizations pour récupérer rôle + org
    const { data, error } = await supabase
      .from('fna_user_orgs')
      .select('role, fna_organizations:org_id (*)')
      .eq('user_id', userId);

    if (error) {
      console.warn('[SupabaseProvider] fna_user_orgs JOIN failed, trying separate queries:', error.message);
      // Fallback : requêtes séparées pour conserver le rôle
      const [{ data: orgsData }, { data: rolesData }] = await Promise.all([
        supabase.from('fna_organizations').select('*'),
        supabase.from('fna_user_orgs').select('org_id, role').eq('user_id', userId),
      ]);
      const roleMap = new Map((rolesData ?? []).map((r: any) => [r.org_id, r.role]));
      return (orgsData ?? []).map((r: any) => ({
        ...(toCamel(r) as Organization),
        role: (roleMap.get(r.id) ?? undefined) as 'admin' | 'editor' | 'viewer' | undefined,
      }));
    }

    return (data ?? [])
      .filter((row: any) => row.fna_organizations)
      .map((row: any) => ({
        ...(toCamel(row.fna_organizations) as Organization),
        role: row.role as 'admin' | 'editor' | 'viewer',
      }));
  }
  async getOrganization(id: string) {
    const { data } = await supabase.from('fna_organizations').select('*').eq('id', id).single();
    return data ? toCamel(data) as Organization : undefined;
  }
  async upsertOrganization(org: Organization) {
    const row = toSnake(org);
    // fna_organizations.created_at est TIMESTAMPTZ (pas bigint) — Postgres refuse
    // un bigint en milliseconds. On convertit Date.now() en ISO string.
    if (typeof row.created_at === 'number') {
      row.created_at = new Date(row.created_at).toISOString();
    }
    // Le champ `role` provient du JOIN fna_user_orgs dans getOrganizations,
    // il n'appartient pas à fna_organizations — strip avant upsert sinon
    // PostgREST rejette "column 'role' does not exist".
    if ('role' in row) delete row.role;
    check(await supabase.from('fna_organizations').upsert(row));
  }
  async deleteOrganization(id: string) {
    check(await supabase.from('fna_organizations').delete().eq('id', id));
  }
  async deleteOrganizationCascade(id: string) {
    // Ordre : enfants d'abord pour respecter les FK (au cas où Supabase n'ait pas
    // ON DELETE CASCADE configuré sur toutes les FK fna_*).
    const tables = [
      'fna_gl_entries', 'fna_imports', 'fna_budgets', 'fna_account_mappings',
      'fna_accounts', 'fna_periods', 'fna_fiscal_years',
      'fna_attention_points', 'fna_action_plans', 'fna_reports',
      'fna_report_templates', 'fna_chat_messages', 'fna_channels',
      'fna_activities', 'fna_analytic_assignments', 'fna_analytic_budgets',
      'fna_analytic_codes', 'fna_analytic_rules', 'fna_analytic_axes',
    ];
    for (const t of tables) {
      // On ignore les erreurs (table sans la colonne org_id ou rangée déjà absente)
      await supabase.from(t).delete().eq('org_id', id);
    }
    check(await supabase.from('fna_organizations').delete().eq('id', id));
  }

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const { data } = await supabase.from('fna_fiscal_years').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    check(await supabase.from('fna_fiscal_years').upsert(toSnake(fy)));
  }
  async bulkUpsertFiscalYears(fys: FiscalYear[]) {
    if (fys.length === 0) return;
    const rows = fys.map((f) => toSnake(f));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_fiscal_years').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteFiscalYearCascade(fy: FiscalYear) {
    // 1) Supprime les GL entries dont la date tombe dans cette année
    check(await supabase.from('fna_gl_entries').delete()
      .eq('org_id', fy.orgId)
      .gte('date', `${fy.year}-01-01`)
      .lte('date', `${fy.year}-12-31`));
    // 2) Supprime les périodes de cet exercice
    check(await supabase.from('fna_periods').delete().eq('fiscal_year_id', fy.id));
    // 3) Supprime l'exercice
    check(await supabase.from('fna_fiscal_years').delete().eq('id', fy.id));
  }
  async setFiscalYearClosed(fy: FiscalYear, closed: boolean) {
    check(await supabase.from('fna_fiscal_years').update({ closed }).eq('id', fy.id));
    check(await supabase.from('fna_periods').update({ closed }).eq('fiscal_year_id', fy.id));
  }

  // Periods
  async getPeriods(orgId: string) {
    const { data } = await supabase.from('fna_periods').select('*').eq('org_id', orgId).order('month');
    return (data ?? []).map((r: any) => toCamel(r)) as Period[];
  }
  async upsertPeriod(p: Period) {
    check(await supabase.from('fna_periods').upsert(toSnake(p)));
  }
  async bulkUpsertPeriods(ps: Period[]) {
    if (ps.length === 0) return;
    const rows = ps.map((p) => toSnake(p));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_periods').upsert(rows.slice(i, i + 500)));
    }
  }

  // Accounts
  async getAccounts(orgId: string) {
    const { data } = await supabase.from('fna_accounts').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as Account[];
  }
  async getAccount(orgId: string, code: string) {
    const { data } = await supabase.from('fna_accounts').select('*')
      .eq('org_id', orgId).eq('code', code).maybeSingle();
    return data ? toCamel(data) as Account : undefined;
  }
  async upsertAccount(account: Account) {
    check(await supabase.from('fna_accounts').upsert(toSnake(account)));
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    const rows = accounts.map(a => toSnake(a));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_accounts').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteAccount(orgId: string, code: string) {
    check(await supabase.from('fna_accounts').delete().eq('org_id', orgId).eq('code', code));
  }
  async deleteAccounts(orgId: string) {
    check(await supabase.from('fna_accounts').delete().eq('org_id', orgId));
  }

  // GL Entries
  //
  // Pagination obligatoire : Supabase plafonne les SELECT à 1000 lignes par
  // défaut (PostgREST default_limit). Sans .range(), un org avec 8000+ écritures
  // ne renvoyait que les 1000 premières (triées par insertion) — typiquement
  // les comptes de classe 4 (tiers, gros volume) — laissant les classes 6/7
  // (charges/produits) invisibles → dashboards Bilan/CR/SIG à 0 alors que la
  // donnée existait bien en base.
  async getGLEntries(filter: GLFilter): Promise<GLEntry[]> {
    const buildQuery = () => {
      let q = supabase.from('fna_gl_entries').select('*').eq('org_id', filter.orgId);
      if (filter.periodId) q = q.eq('period_id', filter.periodId);
      if (filter.importId) q = q.eq('import_id', filter.importId);
      if (filter.account) q = q.eq('account', filter.account);
      if (filter.fromDate) q = q.gte('date', filter.fromDate);
      if (filter.toDate) q = q.lte('date', filter.toDate);
      return q;
    };
    const PAGE = 1000;
    const all: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
      if (error) throw new Error(`getGLEntries: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    return all.map((r: any) => toCamel(r)) as GLEntry[];
  }
  async bulkInsertGL(entries: GLEntry[]) {
    const rows = entries.map(e => toSnake(e));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_gl_entries').insert(rows.slice(i, i + 500)));
    }
  }
  async bulkUpsertGL(entries: GLEntry[]) {
    if (entries.length === 0) return;
    const rows = entries.map(e => toSnake(e));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_gl_entries').upsert(rows.slice(i, i + 500)));
    }
  }
  async updateGLEntry(id: number, changes: Partial<GLEntry>) {
    check(await supabase.from('fna_gl_entries').update(toSnake(changes)).eq('id', id));
  }
  async deleteGLByImport(importId: number) {
    check(await supabase.from('fna_gl_entries').delete().eq('import_id', importId));
  }

  // Imports
  async getImports(orgId: string) {
    const { data } = await supabase.from('fna_imports').select('*').eq('org_id', orgId).order('date', { ascending: false });
    return (data ?? []).map((r: any) => toCamel(r)) as ImportLog[];
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
    return (data ?? []).map((r: any) => toCamel(r)) as BudgetLine[];
  }
  async getAllBudgets(orgId: string) {
    const { data } = await supabase.from('fna_budgets').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as BudgetLine[];
  }
  async getBudgetsByYear(orgId: string, year: number) {
    const { data } = await supabase.from('fna_budgets').select('*')
      .eq('org_id', orgId).eq('year', year);
    return (data ?? []).map((r: any) => toCamel(r)) as BudgetLine[];
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
  async deleteAllBudgets(orgId: string) {
    check(await supabase.from('fna_budgets').delete().eq('org_id', orgId));
  }
  async deleteImportsByKind(orgId: string, kind: ImportLog['kind']) {
    check(await supabase.from('fna_imports').delete().eq('org_id', orgId).eq('kind', kind));
  }

  // Reports
  async getReports(orgId: string) {
    const { data } = await supabase.from('fna_reports').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as ReportDoc[];
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
    return (data ?? []).map((r: any) => toCamel(r)) as ReportTemplate[];
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
    return (data ?? []).map((r: any) => toCamel(r)) as AttentionPoint[];
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
    return (data ?? []).map((r: any) => toCamel(r)) as ActionPlan[];
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
    return (data ?? []).map((r: any) => toCamel(r)) as AccountMapping[];
  }
  async upsertMapping(m: AccountMapping) {
    check(await supabase.from('fna_account_mappings').upsert(toSnake(m)));
  }

  // ── Comptabilité analytique ────────────────────────────────────────
  async getAnalyticAxes(orgId: string) {
    const { data } = await supabase.from('fna_analytic_axes').select('*').eq('org_id', orgId).order('number');
    return (data ?? []).map((r: any) => toCamel(r)) as AnalyticAxis[];
  }
  async upsertAnalyticAxis(axis: AnalyticAxis) {
    check(await supabase.from('fna_analytic_axes').upsert(toSnake(axis)));
  }
  async deleteAnalyticAxis(id: string) {
    // Cascade : on charge d'abord les codes liés pour supprimer assignments + rules
    const { data: codes } = await supabase.from('fna_analytic_codes').select('id').eq('axis_id', id);
    const codeIds = (codes ?? []).map((c: any) => c.id);
    if (codeIds.length > 0) {
      check(await supabase.from('fna_analytic_assignments').delete().in('code_id', codeIds));
      check(await supabase.from('fna_analytic_rules').delete().in('analytic_code_id', codeIds));
    }
    check(await supabase.from('fna_analytic_codes').delete().eq('axis_id', id));
    check(await supabase.from('fna_analytic_axes').delete().eq('id', id));
  }

  async getAnalyticCodes(orgId: string, axisId?: string) {
    let q = supabase.from('fna_analytic_codes').select('*').eq('org_id', orgId);
    if (axisId) q = q.eq('axis_id', axisId);
    const { data } = await q;
    return (data ?? []).map((r: any) => toCamel(r)) as AnalyticCode[];
  }
  async upsertAnalyticCode(code: AnalyticCode) {
    check(await supabase.from('fna_analytic_codes').upsert(toSnake(code)));
  }
  async bulkUpsertAnalyticCodes(codes: AnalyticCode[]) {
    if (codes.length === 0) return;
    const rows = codes.map((c) => toSnake(c));
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_analytic_codes').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteAnalyticCode(id: string) {
    check(await supabase.from('fna_analytic_assignments').delete().eq('code_id', id));
    check(await supabase.from('fna_analytic_codes').delete().eq('id', id));
  }
  async detachAnalyticChildren(parentId: string) {
    check(await supabase.from('fna_analytic_codes').update({ parent_id: null }).eq('parent_id', parentId));
  }

  async getAnalyticRules(orgId: string) {
    const { data } = await supabase.from('fna_analytic_rules').select('*').eq('org_id', orgId).order('priority');
    return (data ?? []).map((r: any) => toCamel(r)) as AnalyticRule[];
  }
  async upsertAnalyticRule(rule: AnalyticRule) {
    check(await supabase.from('fna_analytic_rules').upsert(toSnake(rule)));
  }
  async deleteAnalyticRule(id: string) {
    check(await supabase.from('fna_analytic_rules').delete().eq('id', id));
  }
  async updateAnalyticRulePriority(id: string, priority: number) {
    check(await supabase.from('fna_analytic_rules').update({ priority }).eq('id', id));
  }

  async getAnalyticAssignments(orgId: string) {
    const { data } = await supabase.from('fna_analytic_assignments').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as AnalyticAssignment[];
  }
  async bulkInsertAnalyticAssignments(assignments: AnalyticAssignment[]) {
    if (assignments.length === 0) return;
    const rows = assignments.map((a) => { const s = toSnake(a); delete s.id; return s; });
    for (let i = 0; i < rows.length; i += 500) {
      check(await supabase.from('fna_analytic_assignments').insert(rows.slice(i, i + 500)));
    }
  }
  async updateAnalyticAssignment(id: number, changes: Partial<AnalyticAssignment>) {
    check(await supabase.from('fna_analytic_assignments').update(toSnake(changes)).eq('id', id));
  }
  async deleteAnalyticAssignmentsByOrgFilter(orgId: string, predicate: (a: AnalyticAssignment) => boolean) {
    // Supabase ne supporte pas les predicates JS — on charge puis filtre puis delete par ids.
    const all = await this.getAnalyticAssignments(orgId);
    const ids = all.filter(predicate).map((a) => a.id).filter((x): x is number => typeof x === 'number');
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 500) {
      check(await supabase.from('fna_analytic_assignments').delete().in('id', ids.slice(i, i + 500)));
    }
  }
  async deleteAnalyticAssignmentsByCode(codeId: string) {
    check(await supabase.from('fna_analytic_assignments').delete().eq('code_id', codeId));
  }

  async getAnalyticBudgets(orgId: string) {
    const { data } = await supabase.from('fna_analytic_budgets').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as AnalyticBudget[];
  }

  // ── Activités ──────────────────────────────────────────────────────
  async getActivities(orgId: string) {
    const { data } = await supabase.from('fna_activities').select('*')
      .eq('org_id', orgId).order('created_at', { ascending: false });
    return (data ?? []).map((r: any) => toCamel(r)) as Activity[];
  }
  async getActivity(id: number) {
    const { data } = await supabase.from('fna_activities').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as Activity : undefined;
  }
  async addActivity(act: Omit<Activity, 'id'>) {
    const row = toSnake(act); delete row.id;
    const result = check(await supabase.from('fna_activities').insert(row).select('id').single());
    return (result as any).id;
  }
  async updateActivity(id: number, changes: Partial<Activity>) {
    check(await supabase.from('fna_activities').update(toSnake(changes)).eq('id', id));
  }
  async deleteActivity(id: number) {
    check(await supabase.from('fna_activities').delete().eq('id', id));
  }

  // ── Chat ───────────────────────────────────────────────────────────
  async getChannels(orgId: string) {
    const { data } = await supabase.from('fna_channels').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as Channel[];
  }
  async getChannel(id: string) {
    const { data } = await supabase.from('fna_channels').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as Channel : undefined;
  }
  async upsertChannel(c: Channel) {
    check(await supabase.from('fna_channels').upsert(toSnake(c)));
  }
  async deleteChannel(id: string) {
    check(await supabase.from('fna_channels').delete().eq('id', id));
  }
  async findChannel(orgId: string, predicate: (c: Channel) => boolean) {
    const all = await this.getChannels(orgId);
    return all.find(predicate);
  }

  async getChatMessage(id: number) {
    const { data } = await supabase.from('fna_chat_messages').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as ChatMessage : undefined;
  }
  async getChatMessagesByChannel(channelId: string) {
    const { data } = await supabase.from('fna_chat_messages').select('*').eq('channel_id', channelId).order('created_at');
    return (data ?? []).map((r: any) => toCamel(r)) as ChatMessage[];
  }
  async getChatMessagesByOrg(orgId: string) {
    const { data } = await supabase.from('fna_chat_messages').select('*').eq('org_id', orgId);
    return (data ?? []).map((r: any) => toCamel(r)) as ChatMessage[];
  }
  async addChatMessage(msg: Omit<ChatMessage, 'id'>) {
    const row = toSnake(msg); delete row.id;
    const result = check(await supabase.from('fna_chat_messages').insert(row).select('id').single());
    return (result as any).id;
  }
  async updateChatMessage(id: number, changes: Partial<ChatMessage>) {
    check(await supabase.from('fna_chat_messages').update(toSnake(changes)).eq('id', id));
  }
  async deleteChatMessage(id: number) {
    check(await supabase.from('fna_chat_messages').delete().eq('id', id));
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
