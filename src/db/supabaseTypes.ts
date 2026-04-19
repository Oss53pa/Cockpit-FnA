/** Supabase Database type definitions — generated / maintained manually.
 *  Run `supabase gen types typescript` to regenerate from live schema. */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          currency: string;
          sector: string;
          accounting_system: string;
          rccm: string | null;
          ifu: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      user_orgs: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: 'admin' | 'editor' | 'viewer';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_orgs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['user_orgs']['Insert']>;
      };
      fiscal_years: {
        Row: {
          id: string;
          org_id: string;
          year: number;
          start_date: string;
          end_date: string;
          closed: boolean;
        };
        Insert: Database['public']['Tables']['fiscal_years']['Row'];
        Update: Partial<Database['public']['Tables']['fiscal_years']['Insert']>;
      };
      periods: {
        Row: {
          id: string;
          org_id: string;
          fiscal_year_id: string;
          year: number;
          month: number;
          label: string;
          closed: boolean;
        };
        Insert: Database['public']['Tables']['periods']['Row'];
        Update: Partial<Database['public']['Tables']['periods']['Insert']>;
      };
      accounts: {
        Row: {
          org_id: string;
          code: string;
          label: string;
          sysco_code: string | null;
          class: string;
          type: string;
        };
        Insert: Database['public']['Tables']['accounts']['Row'];
        Update: Partial<Database['public']['Tables']['accounts']['Insert']>;
      };
      gl_entries: {
        Row: {
          id: number;
          org_id: string;
          period_id: string;
          date: string;
          journal: string;
          piece: string;
          account: string;
          label: string;
          debit: number;
          credit: number;
          tiers: string | null;
          analytical_axis: string | null;
          analytical_section: string | null;
          lettrage: string | null;
          import_id: number | null;
        };
        Insert: Omit<Database['public']['Tables']['gl_entries']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['gl_entries']['Insert']>;
      };
      imports: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['imports']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['imports']['Insert']>;
      };
      budgets: {
        Row: {
          id: number;
          org_id: string;
          year: number;
          version: string;
          account: string;
          month: number;
          amount: number;
          analytical_axis: string | null;
          analytical_section: string | null;
        };
        Insert: Omit<Database['public']['Tables']['budgets']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['budgets']['Insert']>;
      };
      reports: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['reports']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
      };
      attention_points: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['attention_points']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['attention_points']['Insert']>;
      };
      action_plans: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['action_plans']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['action_plans']['Insert']>;
      };
      email_logs: {
        Row: {
          id: number;
          org_id: string;
          report_id: number | null;
          recipients: string[];
          subject: string;
          status: string;
          sent_at: string;
          error: string | null;
        };
        Insert: Omit<Database['public']['Tables']['email_logs']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['email_logs']['Insert']>;
      };
      email_schedules: {
        Row: {
          id: number;
          org_id: string;
          report_type: string;
          frequency: string;
          day_of_week: number | null;
          day_of_month: number | null;
          hour: number;
          recipients: string[];
          enabled: boolean;
          last_sent_at: string | null;
          next_run_at: string;
        };
        Insert: Omit<Database['public']['Tables']['email_schedules']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['email_schedules']['Insert']>;
      };
    };
  };
}
