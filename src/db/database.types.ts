/**
 * Types Supabase pour les tables fna_* du projet Cockpit FnA.
 *
 * Ces types correspondent aux colonnes réelles des tables Postgres (snake_case).
 * Ils sont utilisés pour typer le client Supabase dans supabaseProvider.ts
 * et éliminer les `as any` sur les retours de `.from('fna_*')`.
 *
 * NOTE : La commande `supabase gen types typescript --project-id vgtmljfayiysuvrcmunt`
 * génère les types directement depuis le schéma live. Ce fichier est maintenu
 * manuellement en attendant l'intégration CI. Synchroniser avec les migrations.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Row types (colonnes Postgres en snake_case) ──────────────────────

export type FnaOrganizationRow = {
  id: string;
  name: string;
  currency: string;
  sector: string;
  accounting_system: string | null;
  coa_system: string | null;
  rccm: string | null;
  ifu: string | null;
  address: string | null;
  created_at: string;
};

export type FnaFiscalYearRow = {
  id: string;
  org_id: string;
  year: number;
  start_date: string;
  end_date: string;
  closed: boolean;
};

export type FnaPeriodRow = {
  id: string;
  org_id: string;
  fiscal_year_id: string;
  year: number;
  month: number;
  label: string;
  closed: boolean;
};

export type FnaAccountRow = {
  org_id: string;
  code: string;
  label: string;
  sysco_code: string | null;
  class: string;
  type: string;
};

export type FnaGLEntryRow = {
  id: number;
  org_id: string;
  period_id: string;
  date: string;
  journal: string;
  piece: string;
  account: string;
  label: string;
  debit: number | string; // Postgres numeric(18,2) peut revenir en string
  credit: number | string;
  tiers: string | null;
  analytical_axis: string | null;
  analytical_section: string | null;
  lettrage: string | null;
  import_id: number | null;
  hash: string | null;
  previous_hash: string | null;
};

export type FnaImportRow = {
  id: number;
  org_id: string;
  date: number;
  user_name: string;
  file_name: string;
  file_hash: string | null;
  source: string;
  kind: string;
  year: number | null;
  version: string | null;
  count: number;
  rejected: number;
  status: string;
  report: string | null;
  storage_path: string | null;
};

export type FnaBudgetRow = {
  id: number;
  org_id: string;
  year: number;
  version: string;
  account: string;
  month: number;
  amount: number | string; // numeric
  analytical_axis: string | null;
  analytical_section: string | null;
};

export type FnaReportRow = {
  id: number;
  org_id: string;
  title: string;
  type: string;
  author: string;
  status: string;
  created_at: number;
  updated_at: number;
  content: string | null;
};

export type FnaReportTemplateRow = {
  id: number;
  org_id: string;
  name: string;
  description: string | null;
  config: string;
  created_at: number;
  updated_at: number;
};

export type FnaAttentionPointRow = {
  id: number;
  org_id: string;
  title: string;
  description: string | null;
  severity: string;
  probability: string;
  category: string;
  source: string | null;
  owner: string | null;
  detected_at: number;
  detected_by: string | null;
  target_resolution_date: string | null;
  estimated_financial_impact: number | null;
  impact_description: string | null;
  root_cause: string | null;
  recommendation: string | null;
  tags: string[] | null;
  status: string;
  resolved_at: number | null;
  resolved_note: string | null;
  last_reviewed_at: number | null;
  journal: string | null;
};

export type FnaActionPlanRow = {
  id: number;
  org_id: string;
  attention_point_id: number | null;
  title: string;
  description: string | null;
  owner: string;
  team: string | null;
  sponsor: string | null;
  start_date: string | null;
  due_date: string | null;
  review_date: string | null;
  priority: string;
  status: string;
  progress: number;
  budget_allocated: number | null;
  resources_needed: string | null;
  deliverables: string | null;
  success_criteria: string | null;
  estimated_impact: string | null;
  dependencies: string | null;
  blockers: string | null;
  journal: string | null;
  tags: string[] | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

export type FnaAccountMappingRow = {
  org_id: string;
  source_code: string;
  target_code: string;
};

export type FnaAnalyticAxisRow = {
  id: string;
  org_id: string;
  number: number;
  name: string;
  code_name: string;
  required: boolean;
  active: boolean;
};

export type FnaAnalyticCodeRow = {
  id: string;
  org_id: string;
  axis_id: string;
  code: string;
  short_label: string;
  long_label: string;
  parent_id: string | null;
  active: boolean;
  order: number;
  branch: string | null;
};

export type FnaAnalyticRuleRow = {
  id: string;
  org_id: string;
  name: string;
  priority: number;
  active: boolean;
  condition_type: string;
  condition_value: string;
  target_axis: number;
  analytic_code_id: string;
  created_at: number;
};

export type FnaAnalyticAssignmentRow = {
  id: number;
  org_id: string;
  gl_entry_id: number;
  axis_number: number;
  code_id: string;
  method: string;
  rule_id: string | null;
  assigned_at: number;
  branch: string | null;
};

export type FnaAnalyticBudgetRow = {
  id: number;
  org_id: string;
  code_id: string;
  period: string;
  amount: number;
};

export type FnaActivityRow = {
  id: number;
  org_id: string;
  kind: string;
  status: string;
  context: string;
  context_label: string | null;
  linked_id: string | null;
  author: string;
  author_role: string | null;
  content: string;
  metadata: Json | null;
  created_at: number;
  updated_at: number | null;
  resolved_at: number | null;
  resolved_by: string | null;
};

export type FnaChannelRow = {
  id: string;
  org_id: string;
  kind: string;
  name: string;
  description: string | null;
  members: string[] | null;
  created_by: string;
  created_at: number;
  updated_at: number | null;
  is_pinned: boolean | null;
};

export type FnaChatMessageRow = {
  id: number;
  org_id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  content: string;
  mentions: string[] | null;
  reactions: Json | null;
  reply_to: number | null;
  attachment: Json | null;
  created_at: number;
  edited_at: number | null;
  read_by: string[] | null;
};

export type FnaTiersUnmatchedRow = {
  id: number;
  org_id: string;
  import_id: number | null;
  row_index: number;
  date: string;
  account: string;
  code_tiers: string;
  label_tiers: string | null;
  debit: number;
  credit: number;
  journal: string | null;
  piece: string | null;
  label: string | null;
  reason: string;
  candidate_ids: number[] | null;
  resolved_at: number | null;
  resolved_by: string | null;
  resolved_to: number | null;
  resolution: string | null;
  created_at: number;
};

export type FnaTiersRuleRow = {
  id: number;
  org_id: string;
  account: string;
  label_contains: string | null;
  action: string;
  tiers: string | null;
  tiers_label: string | null;
  reason: string | null;
  created_at: number;
  created_by: string | null;
};

export type FnaGLAuditLogRow = {
  id: number;
  org_id: string;
  gl_entry_id: number;
  changed_at: string; // timestamptz
  changed_by: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  source_kind: string | null;
  source_id: number | null;
  audit_hash: string;
  previous_audit_hash: string;
};

export type FnaUserOrgRow = {
  id: string;
  user_id: string;
  org_id: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
};

// ── Insert row with id extracted (retour de .select('id').single()) ──

/** Type retourné par `.insert(...).select('id').single()` */
export type WithId = { id: number };
export type WithStringId = { id: string };

// ── PostgrestError.code (non exposé dans le type public de supabase-js) ──

/** Sous-type minimal de PostgrestError pour accéder au code d'erreur Postgres. */
export type PostgrestErrorWithCode = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

// ── FnaDatabase — type complet pour SupabaseClient<FnaDatabase> ──────

/**
 * Définition complète des tables fna_* pour typer le client Supabase.
 *
 * Usage :
 *   import type { FnaDatabase } from './database.types';
 *   const fnaClient = supabaseTyped as unknown as SupabaseClient<FnaDatabase>;
 *   // Ensuite : fnaClient.from('fna_gl_entries').select('*') est typé
 */
export interface FnaDatabase {
  public: {
    Tables: {
      fna_organizations: {
        Row: FnaOrganizationRow;
        Insert: Omit<FnaOrganizationRow, 'created_at'> & { created_at?: string };
        Update: Partial<FnaOrganizationRow>;
      };
      fna_fiscal_years: {
        Row: FnaFiscalYearRow;
        Insert: FnaFiscalYearRow;
        Update: Partial<FnaFiscalYearRow>;
      };
      fna_periods: {
        Row: FnaPeriodRow;
        Insert: FnaPeriodRow;
        Update: Partial<FnaPeriodRow>;
      };
      fna_accounts: {
        Row: FnaAccountRow;
        Insert: FnaAccountRow;
        Update: Partial<FnaAccountRow>;
      };
      fna_gl_entries: {
        Row: FnaGLEntryRow;
        Insert: Omit<FnaGLEntryRow, 'id'>;
        Update: Partial<Omit<FnaGLEntryRow, 'id'>>;
      };
      fna_imports: {
        Row: FnaImportRow;
        Insert: Omit<FnaImportRow, 'id'>;
        Update: Partial<Omit<FnaImportRow, 'id'>>;
      };
      fna_budgets: {
        Row: FnaBudgetRow;
        Insert: Omit<FnaBudgetRow, 'id'>;
        Update: Partial<Omit<FnaBudgetRow, 'id'>>;
      };
      fna_reports: {
        Row: FnaReportRow;
        Insert: Omit<FnaReportRow, 'id'>;
        Update: Partial<Omit<FnaReportRow, 'id'>>;
      };
      fna_report_templates: {
        Row: FnaReportTemplateRow;
        Insert: Omit<FnaReportTemplateRow, 'id'>;
        Update: Partial<Omit<FnaReportTemplateRow, 'id'>>;
      };
      fna_attention_points: {
        Row: FnaAttentionPointRow;
        Insert: Omit<FnaAttentionPointRow, 'id'>;
        Update: Partial<Omit<FnaAttentionPointRow, 'id'>>;
      };
      fna_action_plans: {
        Row: FnaActionPlanRow;
        Insert: Omit<FnaActionPlanRow, 'id'>;
        Update: Partial<Omit<FnaActionPlanRow, 'id'>>;
      };
      fna_account_mappings: {
        Row: FnaAccountMappingRow;
        Insert: FnaAccountMappingRow;
        Update: Partial<FnaAccountMappingRow>;
      };
      fna_analytic_axes: {
        Row: FnaAnalyticAxisRow;
        Insert: FnaAnalyticAxisRow;
        Update: Partial<FnaAnalyticAxisRow>;
      };
      fna_analytic_codes: {
        Row: FnaAnalyticCodeRow;
        Insert: FnaAnalyticCodeRow;
        Update: Partial<FnaAnalyticCodeRow>;
      };
      fna_analytic_rules: {
        Row: FnaAnalyticRuleRow;
        Insert: FnaAnalyticRuleRow;
        Update: Partial<FnaAnalyticRuleRow>;
      };
      fna_analytic_assignments: {
        Row: FnaAnalyticAssignmentRow;
        Insert: Omit<FnaAnalyticAssignmentRow, 'id'>;
        Update: Partial<Omit<FnaAnalyticAssignmentRow, 'id'>>;
      };
      fna_analytic_budgets: {
        Row: FnaAnalyticBudgetRow;
        Insert: Omit<FnaAnalyticBudgetRow, 'id'>;
        Update: Partial<Omit<FnaAnalyticBudgetRow, 'id'>>;
      };
      fna_activities: {
        Row: FnaActivityRow;
        Insert: Omit<FnaActivityRow, 'id'>;
        Update: Partial<Omit<FnaActivityRow, 'id'>>;
      };
      fna_channels: {
        Row: FnaChannelRow;
        Insert: FnaChannelRow;
        Update: Partial<FnaChannelRow>;
      };
      fna_chat_messages: {
        Row: FnaChatMessageRow;
        Insert: Omit<FnaChatMessageRow, 'id'>;
        Update: Partial<Omit<FnaChatMessageRow, 'id'>>;
      };
      fna_tiers_unmatched: {
        Row: FnaTiersUnmatchedRow;
        Insert: Omit<FnaTiersUnmatchedRow, 'id'>;
        Update: Partial<Omit<FnaTiersUnmatchedRow, 'id'>>;
      };
      fna_tiers_rules: {
        Row: FnaTiersRuleRow;
        Insert: Omit<FnaTiersRuleRow, 'id'>;
        Update: Partial<Omit<FnaTiersRuleRow, 'id'>>;
      };
      fna_gl_audit_log: {
        Row: FnaGLAuditLogRow;
        Insert: Omit<FnaGLAuditLogRow, 'id'>;
        Update: Partial<Omit<FnaGLAuditLogRow, 'id'>>;
      };
      fna_user_orgs: {
        Row: FnaUserOrgRow;
        Insert: Omit<FnaUserOrgRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<FnaUserOrgRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
