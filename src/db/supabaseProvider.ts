/**
 * SupabaseProvider — implémentation cloud PostgreSQL.
 * Utilisée quand VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont configurés.
 */
import type { DataProvider, GLFilter } from './provider';
import type {
  Organization, FiscalYear, Period, Account, GLEntry, ImportLog, BudgetLine,
  ReportDoc, AttentionPoint, ActionPlan, AccountMapping, ReportTemplate,
  AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticAssignment, AnalyticBudget,
  Activity, Channel, ChatMessage, TiersUnmatched, TiersRule, GLAuditLogEntry,
  GLTiersEntry, TiersCategory,
  Space, SpaceCriterion, SpaceSolution, SpaceAction, SpaceEvent, SpaceDecision,
} from './schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FnaDatabase, WithId, PostgrestErrorWithCode,
  FnaOrganizationRow, FnaAnalyticCodeRow, FnaUserOrgRow,
} from './database.types';
import { supabase as supabaseTyped } from '../lib/supabase';

import { toSnake, toCamel } from './caseConvert';

// Les tables fna_* ne sont pas dans Database (qui contient la version sans préfixe).
// On re-cast vers FnaDatabase pour bénéficier du typage fna_* tout en gardant
// la sécurité (unknown intermédiaire = pas de suppression arbitraire du typage).
const supabase = supabaseTyped as unknown as SupabaseClient<FnaDatabase>;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Retourne le builder Supabase pour une table fna_* casté en `any`.
 *
 * Le client supabase est typé avec FnaDatabase, ce qui force les arguments
 * de .insert()/.upsert()/.update() à correspondre exactement aux types Row
 * définis dans database.types.ts. `toSnake()` produit un Record<string,unknown>
 * qui n'est pas structurellement assignable — d'où les erreurs "type never".
 * PostgreSQL valide les colonnes au runtime ; ce cast est donc sûr.
 *
 * On caste le builder (pas l'argument) pour que toutes les méthodes chaînées
 * (eq, order, select…) restent accessibles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAny(table: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

function check<T>(result: { data: T | null; error: PostgrestErrorWithCode | null }): T {
  if (result.error) {
    const msg = result.error.message ?? String(result.error);
    const code = result.error.code;
    // PostgreSQL error 42501 = insufficient_privilege ("permission denied for table X")
    // Signal typique d'une session expirée : le client tombe en anon, qui n'a
    // que SELECT. On enrichit le message pour aider le diagnostic utilisateur.
    if (code === '42501' || msg.toLowerCase().includes('permission denied for table')) {
      throw new Error(
        `Session expirée ou permissions insuffisantes (${msg}). ` +
        `Déconnectez-vous puis reconnectez-vous, puis réessayez l'opération.`,
      );
    }
    throw new Error(msg);
  }
  return result.data as T;
}

/**
 * Convertit les champs timestamp numériques (epoch ms) en ISO string avant
 * envoi vers Postgres. Nécessaire car nos types TS portent ces champs en
 * `number` (cohérence avec Date.now()) mais les colonnes DB sont `timestamptz`.
 * Sans cette conversion, Postgres caste silencieusement l'entier en
 * "1970+epochSeconds" → dates absurdes côté DB.
 *
 * Liste blanche : `changed_at`, `resolved_at`, `created_at`. Les autres champs
 * numériques (debit, credit, count…) restent intacts.
 */
const TIMESTAMP_FIELDS = new Set(['changed_at', 'resolved_at', 'created_at']);
function normalizeTsFields<T extends Record<string, unknown>>(row: T): T {
  for (const k of Object.keys(row)) {
    if (TIMESTAMP_FIELDS.has(k) && typeof row[k] === 'number') {
      // On mute via Object.assign pour éviter le cast as any sur l'index
      Object.assign(row, { [k]: new Date(row[k] as number).toISOString() });
    }
  }
  return row;
}

/**
 * Mapping spécifique des lignes fna_chat_messages → ChatMessage.
 * `toCamel` mappe `user_name` → `user` (collision historique avec
 * ImportLog.user). Pour le chat, le type attend `userName` : on force donc le
 * champ explicitement (cohérent avec engine/chatSync.ts). Sans cela, le nom de
 * l'expéditeur (message.userName) est undefined dans l'UI de discussion.
 */
function chatRowToCamel(r: Record<string, unknown>): ChatMessage {
  const c = toCamel(r) as Record<string, unknown>;
  c.userName = (r.user_name as string) ?? '';
  delete c.user;
  return c as unknown as ChatMessage;
}

/**
 * Pagination universelle pour les SELECT Supabase.
 *
 * Supabase/PostgREST plafonne tout SELECT à 1000 lignes par défaut
 * (`default_limit`). Sans `.range()` explicite, un org avec 8000+ écritures
 * ne renvoie que les 1000 premières — silencieusement. Ce helper rejoue la
 * requête par batches de 1000 jusqu'à ce que la réponse soit < PAGE.
 *
 * Usage :
 *   const rows = await paginatedSelect(() =>
 *     supabase.from('fna_xxx').select('*').eq('org_id', orgId)
 *   );
 *
 * @param buildQuery Fabrique une nouvelle PostgrestFilterBuilder à chaque appel
 *   (closure sur les filtres). Indispensable car chaque .range() consomme la
 *   requête côté supabase-js.
 * @param label Nom de méthode pour les messages d'erreur (debugging)
 *
 * NOTE : PostgrestFilterBuilder implémente PromiseLike (then/catch) mais pas
 * Promise complète. On type le retour de buildQuery() en `any` pour que TS
 * accepte l'appel `.range(...).then()` sans erreur de surcharge.
 */
async function paginatedSelect<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  label = 'paginatedSelect',
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (buildQuery().range(offset, offset + PAGE - 1) as any);
    if (error) throw new Error(`${label}: ${(error as { message: string }).message}`);
    if (!data || (data as T[]).length === 0) break;
    all.push(...(data as T[]));
    if ((data as T[]).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ── Provider ─────────────────────────────────────────────────────────
//
// NOTE sur les `as any` dans les mutations (.insert/.upsert/.update) :
// `toSnake()` produit un `Record<string, any>` (transformations dynamiques de clés).
// Le client Supabase typé attend des types `Insert<T>`/`Update<T>` stricts, ce qui
// est structurellement incompatible avec un Record générique. Ces casts sont sûrs :
// PostgreSQL rejette au runtime les colonnes inconnues ou les types incorrects.
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
      return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as Organization[];
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
      const roleMap = new Map((rolesData ?? []).map((r) => [
        (r as FnaUserOrgRow).org_id,
        (r as FnaUserOrgRow).role,
      ]));
      return (orgsData ?? []).map((r) => ({
        ...(toCamel(r as Record<string, unknown>) as Organization),
        role: (roleMap.get((r as FnaOrganizationRow).id) ?? undefined) as 'admin' | 'editor' | 'viewer' | undefined,
      }));
    }

    // Le JOIN retourne des objets { role, fna_organizations: FnaOrganizationRow }
    type JoinRow = { role: 'admin' | 'editor' | 'viewer'; fna_organizations: FnaOrganizationRow | null };
    return (data ?? [])
      .filter((row) => (row as JoinRow).fna_organizations)
      .map((row) => {
        const typedRow = row as JoinRow;
        return {
          ...(toCamel(typedRow.fna_organizations as Record<string, unknown>) as Organization),
          role: typedRow.role,
        };
      });
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
    check(await fromAny('fna_organizations').upsert(row));
  }
  async deleteOrganization(id: string) {
    check(await supabase.from('fna_organizations').delete().eq('id', id));
  }
  async deleteOrganizationCascade(id: string) {
    // Ordre : enfants d'abord pour respecter les FK (au cas où Supabase n'ait pas
    // ON DELETE CASCADE configuré sur toutes les FK fna_*).
    const tables: Array<keyof FnaDatabase['public']['Tables']> = [
      'fna_tiers_unmatched', 'fna_tiers_rules',
      'fna_gl_entries', 'fna_imports', 'fna_budgets', 'fna_account_mappings',
      'fna_accounts', 'fna_periods', 'fna_fiscal_years',
      'fna_attention_points', 'fna_action_plans', 'fna_reports',
      'fna_report_templates', 'fna_chat_messages', 'fna_channels',
      'fna_activities', 'fna_analytic_assignments', 'fna_analytic_budgets',
      'fna_analytic_codes', 'fna_analytic_rules', 'fna_analytic_axes',
    ];
    for (const t of tables) {
      // On ignore les erreurs (table sans la colonne org_id ou rangée déjà absente)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from(t) as any).delete().eq('org_id', id);
    }
    check(await supabase.from('fna_organizations').delete().eq('id', id));
  }

  // Fiscal years
  async getFiscalYears(orgId: string) {
    const { data } = await supabase.from('fna_fiscal_years').select('*').eq('org_id', orgId);
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as FiscalYear[];
  }
  async upsertFiscalYear(fy: FiscalYear) {
    check(await fromAny('fna_fiscal_years').upsert(toSnake(fy)));
  }
  async bulkUpsertFiscalYears(fys: FiscalYear[]) {
    if (fys.length === 0) return;
    const rows = fys.map((f) => toSnake(f));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_fiscal_years').upsert(rows.slice(i, i + 500)));
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
    check(await fromAny('fna_fiscal_years').update({ closed }).eq('id', fy.id));
    check(await fromAny('fna_periods').update({ closed }).eq('fiscal_year_id', fy.id));
  }

  // Periods
  async getPeriods(orgId: string) {
    const { data } = await supabase.from('fna_periods').select('*').eq('org_id', orgId).order('month');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as Period[];
  }
  async upsertPeriod(p: Period) {
    check(await fromAny('fna_periods').upsert(toSnake(p)));
  }
  async bulkUpsertPeriods(ps: Period[]) {
    if (ps.length === 0) return;
    const rows = ps.map((p) => toSnake(p));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_periods').upsert(rows.slice(i, i + 500)));
    }
  }

  // Accounts
  async getAccounts(orgId: string) {
    // Pagination : un plan SYSCOHADA complet + comptes auxiliaires peut dépasser 1000
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_accounts').select('*').eq('org_id', orgId),
      'getAccounts',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as Account[];
  }
  async getAccount(orgId: string, code: string) {
    const { data } = await supabase.from('fna_accounts').select('*')
      .eq('org_id', orgId).eq('code', code).maybeSingle();
    return data ? toCamel(data) as Account : undefined;
  }
  async upsertAccount(account: Account) {
    check(await fromAny('fna_accounts').upsert(toSnake(account)));
  }
  async bulkUpsertAccounts(accounts: Account[]) {
    const rows = accounts.map(a => toSnake(a));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_accounts').upsert(rows.slice(i, i + 500)));
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
    const rows = await paginatedSelect<any>(() => {
      let q = supabase.from('fna_gl_entries').select('*').eq('org_id', filter.orgId);
      if (filter.periodId) q = q.eq('period_id', filter.periodId);
      if (filter.importId) q = q.eq('import_id', filter.importId);
      if (filter.account) q = q.eq('account', filter.account);
      if (filter.fromDate) q = q.gte('date', filter.fromDate);
      if (filter.toDate) q = q.lte('date', filter.toDate);
      return q;
    }, 'getGLEntries');
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as GLEntry[];
  }
  async bulkInsertGL(entries: GLEntry[]) {
    const rows = entries.map(e => toSnake(e));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_gl_entries').insert(rows.slice(i, i + 500)));
    }
  }
  async bulkUpsertGL(entries: GLEntry[]) {
    if (entries.length === 0) return;
    const rows = entries.map(e => toSnake(e));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_gl_entries').upsert(rows.slice(i, i + 500)));
    }
  }
  async updateGLEntry(id: number, changes: Partial<GLEntry>) {
    check(await fromAny('fna_gl_entries').update(toSnake(changes)).eq('id', id));
  }
  async deleteGLByImport(importId: number) {
    check(await supabase.from('fna_gl_entries').delete().eq('import_id', importId));
  }

  // Imports
  async getImports(orgId: string) {
    const { data } = await supabase.from('fna_imports').select('*').eq('org_id', orgId).order('date', { ascending: false });
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as ImportLog[];
  }
  async addImport(log: Omit<ImportLog, 'id'>): Promise<number> {
    const row = toSnake(log);
    delete row.id;
    const result = check(await fromAny('fna_imports').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteImport(id: number) {
    check(await supabase.from('fna_imports').delete().eq('id', id));
  }

  // Tiers unmatched
  async getTiersUnmatched(orgId: string, opts?: { onlyPending?: boolean; importId?: number }) {
    const rows = await paginatedSelect<any>(() => {
      let q = supabase.from('fna_tiers_unmatched').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      if (opts?.onlyPending) q = q.is('resolved_at', null);
      if (opts?.importId !== undefined) q = q.eq('import_id', opts.importId);
      return q;
    }, 'getTiersUnmatched');
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as TiersUnmatched[];
  }
  async bulkInsertTiersUnmatched(rows: Omit<TiersUnmatched, 'id'>[]) {
    if (rows.length === 0) return;
    const snakes = rows.map((r) => normalizeTsFields(toSnake(r)));
    for (let i = 0; i < snakes.length; i += 500) {
      check(await fromAny('fna_tiers_unmatched').insert(snakes.slice(i, i + 500)));
    }
  }
  async updateTiersUnmatched(id: number, changes: Partial<TiersUnmatched>) {
    // Convertit les timestamps numériques (epoch ms) en ISO avant l'UPDATE :
    // les colonnes Postgres sont en timestamptz, un cast direct depuis bigint
    // donnerait des dates absurdes (1970+epochSeconds).
    check(await fromAny('fna_tiers_unmatched').update(normalizeTsFields(toSnake(changes))).eq('id', id));
  }
  async deleteTiersUnmatched(id: number) {
    check(await supabase.from('fna_tiers_unmatched').delete().eq('id', id));
  }
  async deleteTiersUnmatchedByImport(importId: number) {
    check(await supabase.from('fna_tiers_unmatched').delete().eq('import_id', importId));
  }

  // Tiers rules — règles de correction tiers mémorisées
  async getTiersRules(orgId: string) {
    const rows = await paginatedSelect<any>(() =>
      supabase.from('fna_tiers_rules').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    'getTiersRules');
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as TiersRule[];
  }
  async upsertTiersRule(rule: Omit<TiersRule, 'id'> & { id?: number }): Promise<number> {
    const row = normalizeTsFields(toSnake(rule));
    if (rule.id) {
      check(await fromAny('fna_tiers_rules').update(row).eq('id', rule.id));
      return rule.id;
    }
    delete row.id;
    const result = check(await fromAny('fna_tiers_rules').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteTiersRule(id: number) {
    check(await supabase.from('fna_tiers_rules').delete().eq('id', id));
  }

  // ── Grand Livre Tiers (livre auxiliaire stocké) ───────────────────
  async getGLTiers(orgId: string, opts?: { importId?: number; category?: TiersCategory; fromDate?: string; toDate?: string }) {
    const rows = await paginatedSelect<any>(() => {
      let q = supabase.from('fna_gl_tiers').select('*').eq('org_id', orgId).order('date', { ascending: true });
      if (opts?.importId !== undefined) q = q.eq('import_id', opts.importId);
      if (opts?.category) q = q.eq('category', opts.category);
      if (opts?.fromDate) q = q.gte('date', opts.fromDate);
      if (opts?.toDate) q = q.lte('date', opts.toDate);
      return q;
    }, 'getGLTiers');
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as GLTiersEntry[];
  }
  async bulkInsertGLTiers(rows: Omit<GLTiersEntry, 'id'>[]) {
    if (rows.length === 0) return;
    const snakes = rows.map((r) => normalizeTsFields(toSnake(r)));
    for (let i = 0; i < snakes.length; i += 500) {
      check(await fromAny('fna_gl_tiers').insert(snakes.slice(i, i + 500)));
    }
  }
  async deleteGLTiersByImport(importId: number) {
    check(await supabase.from('fna_gl_tiers').delete().eq('import_id', importId));
  }
  async deleteGLTiers(orgId: string) {
    check(await supabase.from('fna_gl_tiers').delete().eq('org_id', orgId));
  }

  // GL Audit log
  async getGLAuditLog(orgId: string, opts?: { glEntryId?: number; limit?: number }) {
    // Si `limit` explicite, single query (pas de pagination — l'appelant veut N rows).
    // Sinon : pagination (audit log grossit indéfiniment, peut dépasser 1000).
    if (opts?.limit !== undefined) {
      let q = supabase.from('fna_gl_audit_log').select('*').eq('org_id', orgId).order('id', { ascending: false }).limit(opts.limit);
      if (opts?.glEntryId !== undefined) q = q.eq('gl_entry_id', opts.glEntryId);
      const { data, error } = await q;
      if (error) return []; // Migration 019 pas appliquée
      return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as GLAuditLogEntry[];
    }
    try {
      const rows = await paginatedSelect<any>(() => {
        let q = supabase.from('fna_gl_audit_log').select('*').eq('org_id', orgId).order('id', { ascending: false });
        if (opts?.glEntryId !== undefined) q = q.eq('gl_entry_id', opts.glEntryId);
        return q;
      }, 'getGLAuditLog');
      return rows.map((r) => toCamel(r as Record<string, unknown>)) as GLAuditLogEntry[];
    } catch {
      // Migration 019 pas appliquée → silencieusement vide
      return [];
    }
  }
  async getLastGLAuditHash(orgId: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('fna_get_last_audit_hash', { p_org_id: orgId } as any);
      if (error) return '';
      return typeof data === 'string' ? data : '';
    } catch {
      return '';
    }
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
  ): Promise<number | null> {
    if (changes.length === 0) return 0;
    try {
      // Le payload doit être en snake_case : la RPC lit directement les clés
      // depuis le JSON (jsonb_array_elements + ->>'field').
      const payload = changes.map((c) => ({
        gl_entry_id: c.glEntryId,
        field: c.field,
        old_value: c.oldValue ?? '',
        new_value: c.newValue ?? '',
        reason: c.reason,
        source_kind: c.sourceKind ?? '',
        source_id: c.sourceId ?? '',
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('fna_append_audit_log', {
        p_org_id: orgId,
        p_changes: payload,
      } as any);
      if (error) {
        const code = (error as PostgrestErrorWithCode).code;
        const msg = error.message || '';
        if (code === '42883' || code === 'PGRST202' || msg.includes('does not exist')) {
          // Migration 020 pas appliquée → caller fait fallback
          return null;
        }
        throw new Error(`appendGLAuditLogAtomic: ${msg}`);
      }
      return typeof data === 'number' ? data : changes.length;
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.warn('[appendGLAuditLogAtomic] échec, retour null pour fallback:', (e as { message?: string })?.message ?? e);
      return null;
    }
  }
  async bulkInsertGLAuditLog(rows: Omit<GLAuditLogEntry, 'id'>[]) {
    if (rows.length === 0) return;
    const snakes = rows.map((r) => normalizeTsFields(toSnake(r)));
    try {
      for (let i = 0; i < snakes.length; i += 500) {
        check(await fromAny('fna_gl_audit_log').insert(snakes.slice(i, i + 500)));
      }
    } catch (e) {
      // Migration 019 pas appliquée → non bloquant
      // eslint-disable-next-line no-console
      console.warn('[bulkInsertGLAuditLog] échec (migration 019 ?):', e);
    }
  }

  // Import GL Tiers atomique via RPC fna_import_tiers (migration 017).
  // Si la RPC n'est pas déployée (réponse 404 ou function not found), retourne
  // null pour signaler à l'appelant qu'il doit fallback sur les 3 appels séparés.
  async importTiersAtomic(payload: {
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
  }): Promise<{ importId: number } | null> {
    try {
      // Conversion camelCase → snake_case pour les unmatched (la RPC attend
      // les clés en snake_case, comme les colonnes Postgres).
      const unmatchedSnake = payload.unmatched.map((u) => toSnake(u));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('fna_import_tiers', {
        p_org_id:    payload.orgId,
        p_user:      payload.user,
        p_file_name: payload.fileName,
        p_file_hash: payload.fileHash ?? null,
        p_source:    payload.source,
        p_count:     payload.count,
        p_rejected:  payload.rejected,
        p_status:    payload.status,
        p_report:    payload.report,
        p_enriched:  payload.enriched,
        p_unmatched: unmatchedSnake,
      } as any);
      if (error) {
        // 42883 = "function does not exist" → migration pas appliquée
        // PGRST202 = "Could not find the function" → idem côté PostgREST
        const code = (error as PostgrestErrorWithCode).code;
        if (code === '42883' || code === 'PGRST202' || (error.message || '').includes('does not exist')) {
          // eslint-disable-next-line no-console
          console.warn('[importTiersAtomic] RPC non déployée — fallback sur séquentiel.');
          return null;
        }
        throw new Error(`importTiersAtomic: ${error.message}`);
      }
      const rpcResult = data as { import_id?: unknown } | null;
      if (!rpcResult || typeof rpcResult.import_id !== 'number') {
        return null;
      }
      return { importId: rpcResult.import_id };
    } catch (e: unknown) {
      // Tout autre échec : ne pas casser l'import — fallback séquentiel
      // eslint-disable-next-line no-console
      console.warn('[importTiersAtomic] échec, fallback séquentiel:', (e as { message?: string })?.message ?? e);
      return null;
    }
  }

  // Budgets — pagination obligatoire : year × accounts × months dépasse rapidement 1000
  async getBudgets(orgId: string, year: number, version: string) {
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_budgets').select('*')
        .eq('org_id', orgId).eq('year', year).eq('version', version),
      'getBudgets',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as BudgetLine[];
  }
  async getAllBudgets(orgId: string) {
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_budgets').select('*').eq('org_id', orgId),
      'getAllBudgets',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as BudgetLine[];
  }
  async getBudgetsByYear(orgId: string, year: number) {
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_budgets').select('*').eq('org_id', orgId).eq('year', year),
      'getBudgetsByYear',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as BudgetLine[];
  }
  async bulkUpsertBudgets(lines: BudgetLine[]) {
    const rows = lines.map(l => toSnake(l));
    // onConflict obligatoire : sans cible de conflit, l'upsert se comporte
    // comme un INSERT pur (les lignes n'ont pas d'`id`) et empile des
    // doublons que loadBudget additionne → montants gonflés ×N.
    // Cf. migration 024 (index unique fna_budgets_unique_line).
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_budgets').upsert(rows.slice(i, i + 500), { onConflict: 'org_id,year,version,account,month' }));
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
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as ReportDoc[];
  }
  async getReport(id: number) {
    const { data } = await supabase.from('fna_reports').select('*').eq('id', id).single();
    return data ? toCamel(data) as ReportDoc : undefined;
  }
  async upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(doc);
    if (doc.id) {
      check(await fromAny('fna_reports').update(row).eq('id', doc.id));
      return doc.id;
    }
    delete row.id;
    const result = check(await fromAny('fna_reports').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteReport(id: number) {
    check(await supabase.from('fna_reports').delete().eq('id', id));
  }

  // Templates
  async getTemplates(orgId: string) {
    const { data } = await supabase.from('fna_report_templates').select('*').eq('org_id', orgId);
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as ReportTemplate[];
  }
  async upsertTemplate(t: Omit<ReportTemplate, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(t);
    if (t.id) {
      check(await fromAny('fna_report_templates').update(row).eq('id', t.id));
      return t.id;
    }
    delete row.id;
    const result = check(await fromAny('fna_report_templates').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteTemplate(id: number) {
    check(await supabase.from('fna_report_templates').delete().eq('id', id));
  }

  // Attention points
  async getAttentionPoints(orgId: string) {
    // Pagination : accumulation au fil du temps des points d'attention détectés
    const data = await paginatedSelect<any>(
      () => supabase.from('fna_attention_points').select('*').eq('org_id', orgId),
      'getAttentionPoints',
    );
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as AttentionPoint[];
  }
  async upsertAttentionPoint(p: Omit<AttentionPoint, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await fromAny('fna_attention_points').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await fromAny('fna_attention_points').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteAttentionPoint(id: number) {
    check(await supabase.from('fna_attention_points').delete().eq('id', id));
  }

  // Action plans
  async getActionPlans(orgId: string) {
    // Pagination : plans d'action peuvent s'accumuler
    const data = await paginatedSelect<any>(
      () => supabase.from('fna_action_plans').select('*').eq('org_id', orgId),
      'getActionPlans',
    );
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as ActionPlan[];
  }
  async upsertActionPlan(p: Omit<ActionPlan, 'id'> & { id?: number }): Promise<number> {
    const row = toSnake(p);
    if (p.id) {
      check(await fromAny('fna_action_plans').update(row).eq('id', p.id));
      return p.id;
    }
    delete row.id;
    const result = check(await fromAny('fna_action_plans').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async deleteActionPlan(id: number) {
    check(await supabase.from('fna_action_plans').delete().eq('id', id));
  }

  // Mappings
  async getMappings(orgId: string) {
    // Pagination : 1 mapping par compte du fichier source, peut être > 1000
    const data = await paginatedSelect<any>(
      () => supabase.from('fna_account_mappings').select('*').eq('org_id', orgId),
      'getMappings',
    );
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as AccountMapping[];
  }
  async upsertMapping(m: AccountMapping) {
    check(await fromAny('fna_account_mappings').upsert(toSnake(m)));
  }

  // ── Comptabilité analytique ────────────────────────────────────────
  async getAnalyticAxes(orgId: string) {
    const { data } = await supabase.from('fna_analytic_axes').select('*').eq('org_id', orgId).order('number');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as AnalyticAxis[];
  }
  async upsertAnalyticAxis(axis: AnalyticAxis) {
    check(await fromAny('fna_analytic_axes').upsert(toSnake(axis)));
  }
  async deleteAnalyticAxis(id: string) {
    // Cascade : on charge d'abord les codes liés pour supprimer assignments + rules
    const { data: codes } = await supabase.from('fna_analytic_codes').select('id').eq('axis_id', id);
    const codeIds = (codes ?? []).map((c) => (c as Pick<FnaAnalyticCodeRow, 'id'>).id);
    if (codeIds.length > 0) {
      check(await supabase.from('fna_analytic_assignments').delete().in('code_id', codeIds));
      check(await supabase.from('fna_analytic_rules').delete().in('analytic_code_id', codeIds));
    }
    check(await supabase.from('fna_analytic_codes').delete().eq('axis_id', id));
    check(await supabase.from('fna_analytic_axes').delete().eq('id', id));
  }

  async getAnalyticCodes(orgId: string, axisId?: string) {
    // Pagination : un plan analytique fin peut dépasser 1000 codes (WBS détaillé, etc.)
    const rows = await paginatedSelect<any>(() => {
      let q = supabase.from('fna_analytic_codes').select('*').eq('org_id', orgId);
      if (axisId) q = q.eq('axis_id', axisId);
      return q;
    }, 'getAnalyticCodes');
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as AnalyticCode[];
  }
  async upsertAnalyticCode(code: AnalyticCode) {
    check(await fromAny('fna_analytic_codes').upsert(toSnake(code)));
  }
  async bulkUpsertAnalyticCodes(codes: AnalyticCode[]) {
    if (codes.length === 0) return;
    const rows = codes.map((c) => toSnake(c));
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_analytic_codes').upsert(rows.slice(i, i + 500)));
    }
  }
  async deleteAnalyticCode(id: string) {
    check(await supabase.from('fna_analytic_assignments').delete().eq('code_id', id));
    check(await supabase.from('fna_analytic_codes').delete().eq('id', id));
  }
  async detachAnalyticChildren(parentId: string) {
    check(await fromAny('fna_analytic_codes').update({ parent_id: null }).eq('parent_id', parentId));
  }

  async getAnalyticRules(orgId: string) {
    const { data } = await supabase.from('fna_analytic_rules').select('*').eq('org_id', orgId).order('priority');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as AnalyticRule[];
  }
  async upsertAnalyticRule(rule: AnalyticRule) {
    check(await fromAny('fna_analytic_rules').upsert(toSnake(rule)));
  }
  async deleteAnalyticRule(id: string) {
    check(await supabase.from('fna_analytic_rules').delete().eq('id', id));
  }
  async updateAnalyticRulePriority(id: string, priority: number) {
    check(await fromAny('fna_analytic_rules').update({ priority }).eq('id', id));
  }

  async getAnalyticAssignments(orgId: string) {
    // Pagination obligatoire : 1 assignment par écriture GL → dépasse 1000 facilement
    const data = await paginatedSelect<any>(
      () => supabase.from('fna_analytic_assignments').select('*').eq('org_id', orgId),
      'getAnalyticAssignments',
    );
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as AnalyticAssignment[];
  }
  async bulkInsertAnalyticAssignments(assignments: AnalyticAssignment[]) {
    if (assignments.length === 0) return;
    const rows = assignments.map((a) => { const s = toSnake(a); delete s.id; return s; });
    for (let i = 0; i < rows.length; i += 500) {
      check(await fromAny('fna_analytic_assignments').insert(rows.slice(i, i + 500)));
    }
  }
  async updateAnalyticAssignment(id: number, changes: Partial<AnalyticAssignment>) {
    check(await fromAny('fna_analytic_assignments').update(toSnake(changes)).eq('id', id));
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
    // Pagination : code × période = potentiellement > 1000
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_analytic_budgets').select('*').eq('org_id', orgId),
      'getAnalyticBudgets',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as AnalyticBudget[];
  }

  // ── Activités ──────────────────────────────────────────────────────
  async getActivities(orgId: string) {
    // Pagination : log d'activité peut grossir indéfiniment
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_activities').select('*')
        .eq('org_id', orgId).order('created_at', { ascending: false }),
      'getActivities',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as Activity[];
  }
  async getActivity(id: number) {
    const { data } = await supabase.from('fna_activities').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as Activity : undefined;
  }
  async addActivity(act: Omit<Activity, 'id'>) {
    const row = toSnake(act); delete row.id;
    const result = check(await fromAny('fna_activities').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async updateActivity(id: number, changes: Partial<Activity>) {
    check(await fromAny('fna_activities').update(toSnake(changes)).eq('id', id));
  }
  async deleteActivity(id: number) {
    check(await supabase.from('fna_activities').delete().eq('id', id));
  }

  // ── Chat ───────────────────────────────────────────────────────────
  async getChannels(orgId: string) {
    const { data } = await supabase.from('fna_channels').select('*').eq('org_id', orgId);
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as Channel[];
  }
  async getChannel(id: string) {
    const { data } = await supabase.from('fna_channels').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as Channel : undefined;
  }
  async upsertChannel(c: Channel) {
    check(await fromAny('fna_channels').upsert(toSnake(c)));
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
    return data ? chatRowToCamel(data as Record<string, unknown>) : undefined;
  }
  async getChatMessagesByChannel(channelId: string) {
    // Pagination : un canal actif dépasse 1000 messages
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_chat_messages').select('*').eq('channel_id', channelId).order('created_at'),
      'getChatMessagesByChannel',
    );
    return rows.map((r) => chatRowToCamel(r as Record<string, unknown>));
  }
  async getChatMessagesByOrg(orgId: string) {
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_chat_messages').select('*').eq('org_id', orgId),
      'getChatMessagesByOrg',
    );
    return rows.map((r) => chatRowToCamel(r as Record<string, unknown>));
  }
  async addChatMessage(msg: Omit<ChatMessage, 'id'>) {
    const row = toSnake(msg); delete row.id;
    const result = check(await fromAny('fna_chat_messages').insert(row).select('id').single());
    return (result as unknown as WithId).id;
  }
  async updateChatMessage(id: number, changes: Partial<ChatMessage>) {
    check(await fromAny('fna_chat_messages').update(toSnake(changes)).eq('id', id));
  }
  async deleteChatMessage(id: number) {
    check(await supabase.from('fna_chat_messages').delete().eq('id', id));
  }

  // ── Espace Collaboratif ──────────────────────────────────────────
  async getSpaces(orgId: string) {
    const { data } = await supabase.from('fna_spaces').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as Space[];
  }
  async getSpace(id: string) {
    const { data } = await supabase.from('fna_spaces').select('*').eq('id', id).maybeSingle();
    return data ? toCamel(data) as Space : undefined;
  }
  async upsertSpace(s: Space) {
    check(await fromAny('fna_spaces').upsert(toSnake(s)));
  }
  async getSpaceCriteria(spaceId: string) {
    const { data } = await supabase.from('fna_space_criteria').select('*').eq('space_id', spaceId).order('id');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceCriterion[];
  }
  async upsertSpaceCriterion(c: SpaceCriterion) {
    const row = toSnake(c); if (c.id === undefined) delete row.id;
    check(await fromAny('fna_space_criteria').upsert(row));
  }
  async getSpaceSolutions(spaceId: string) {
    const { data } = await supabase.from('fna_space_solutions').select('*').eq('space_id', spaceId).order('id');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceSolution[];
  }
  async upsertSpaceSolution(s: SpaceSolution) {
    const row = toSnake(s); if (s.id === undefined) delete row.id;
    check(await fromAny('fna_space_solutions').upsert(row));
  }
  async getSpaceActions(spaceId: string) {
    const { data } = await supabase.from('fna_space_actions').select('*').eq('space_id', spaceId).order('due_date', { ascending: true, nullsFirst: false });
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceAction[];
  }
  async getSpaceActionsByOrg(orgId: string) {
    const { data } = await supabase.from('fna_space_actions').select('*').eq('org_id', orgId);
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceAction[];
  }
  async upsertSpaceAction(a: SpaceAction) {
    const row = toSnake(a); if (a.id === undefined) delete row.id;
    check(await fromAny('fna_space_actions').upsert(row));
  }
  async getSpaceEvents(spaceId: string) {
    const rows = await paginatedSelect<any>(
      () => supabase.from('fna_space_events').select('*').eq('space_id', spaceId).order('created_at'),
      'getSpaceEvents',
    );
    return rows.map((r) => toCamel(r as Record<string, unknown>)) as SpaceEvent[];
  }
  async addSpaceEvent(e: Omit<SpaceEvent, 'id'>) {
    // Append-only : INSERT uniquement — la table refuse UPDATE/DELETE (trigger).
    const row = toSnake(e); delete row.id;
    check(await fromAny('fna_space_events').insert(row));
  }
  async getSpaceDecisions(spaceId: string) {
    const { data } = await supabase.from('fna_space_decisions').select('*').eq('space_id', spaceId).order('id');
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceDecision[];
  }
  async getSpaceDecisionsByOrg(orgId: string) {
    const { data } = await supabase.from('fna_space_decisions').select('*').eq('org_id', orgId);
    return (data ?? []).map((r) => toCamel(r as Record<string, unknown>)) as SpaceDecision[];
  }
  async upsertSpaceDecision(d: SpaceDecision) {
    const row = toSnake(d); if (d.id === undefined) delete row.id;
    check(await fromAny('fna_space_decisions').upsert(row));
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
