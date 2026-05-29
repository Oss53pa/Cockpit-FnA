import { useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Schéma typé précis pour les tables email. Le type global `Database`
// (supabaseTypes.ts) est un stub incomplet (sans Views/Functions ni
// Relationships) que supabase-js ne reconnaît pas → `.from()` typé ressort
// `never`. On fournit ici un schéma conforme à GenericSchema, restreint aux
// deux tables email, et on caste le client une seule fois (au lieu d'un
// `as any` par appel). Toutes les requêtes ci-dessous sont ainsi typées.
type EmailLogRow = {
  id: number;
  org_id: string;
  report_id: number | null;
  recipients: string[];
  subject: string;
  status: string;
  sent_at: string;
  error: string | null;
};
type EmailScheduleRow = {
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
type EmailDatabase = {
  public: {
    Tables: {
      fna_email_logs: {
        Row: EmailLogRow;
        Insert: Omit<EmailLogRow, 'id'>;
        Update: Partial<Omit<EmailLogRow, 'id'>>;
        Relationships: [];
      };
      fna_email_schedules: {
        Row: EmailScheduleRow;
        Insert: Omit<EmailScheduleRow, 'id'>;
        Update: Partial<Omit<EmailScheduleRow, 'id'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
const emailClient = supabase as unknown as SupabaseClient<EmailDatabase>;

interface SendReportParams {
  reportId: number;
  recipients: string[];
  subject: string;
  message?: string;
  format: 'pdf' | 'html';
  orgId: string;
}

interface EmailSchedule {
  id?: number;
  orgId: string;
  reportType: string;
  frequency: 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number;
  recipients: string[];
  enabled: boolean;
  lastSentAt?: string;
  nextRunAt: string;
}

interface EmailLog {
  id: number;
  orgId: string;
  reportId: number | null;
  recipients: string[];
  subject: string;
  status: string;
  sentAt: string;
  error: string | null;
}

export function useEmail() {
  const [sending, setSending] = useState(false);

  /** Envoyer un rapport par email via Edge Function */
  const sendReport = useCallback(async (params: SendReportParams) => {
    if (!isSupabaseConfigured) throw new Error('Supabase non configuré');
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-report', {
        body: params,
      });
      if (error) throw error;
      return data;
    } finally {
      setSending(false);
    }
  }, []);

  /** Récupérer l'historique des envois */
  const getEmailLogs = useCallback(async (orgId: string): Promise<EmailLog[]> => {
    if (!isSupabaseConfigured) return [];
    const { data } = await emailClient
      .from('fna_email_logs')
      .select('*')
      .eq('org_id', orgId)
      .order('sent_at', { ascending: false })
      .limit(100);
    return (data ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      reportId: r.report_id,
      recipients: r.recipients,
      subject: r.subject,
      status: r.status,
      sentAt: r.sent_at,
      error: r.error,
    }));
  }, []);

  /** Récupérer les programmations */
  const getSchedules = useCallback(async (orgId: string): Promise<EmailSchedule[]> => {
    if (!isSupabaseConfigured) return [];
    const { data } = await emailClient
      .from('fna_email_schedules')
      .select('*')
      .eq('org_id', orgId);
    return (data ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      reportType: r.report_type,
      frequency: r.frequency as 'weekly' | 'monthly' | 'quarterly',
      dayOfWeek: r.day_of_week ?? undefined,
      dayOfMonth: r.day_of_month ?? undefined,
      hour: r.hour,
      recipients: r.recipients,
      enabled: r.enabled,
      lastSentAt: r.last_sent_at ?? undefined,
      nextRunAt: r.next_run_at,
    }));
  }, []);

  /** Créer / mettre à jour une programmation */
  const upsertSchedule = useCallback(async (schedule: EmailSchedule) => {
    if (!isSupabaseConfigured) return;
    const row = {
      org_id: schedule.orgId,
      report_type: schedule.reportType,
      frequency: schedule.frequency,
      day_of_week: schedule.dayOfWeek ?? null,
      day_of_month: schedule.dayOfMonth ?? null,
      hour: schedule.hour,
      recipients: schedule.recipients,
      enabled: schedule.enabled,
      last_sent_at: schedule.lastSentAt ?? null,
      next_run_at: schedule.nextRunAt,
    };
    if (schedule.id) {
      await emailClient.from('fna_email_schedules').update(row).eq('id', schedule.id);
    } else {
      await emailClient.from('fna_email_schedules').insert(row);
    }
  }, []);

  /** Supprimer une programmation */
  const deleteSchedule = useCallback(async (id: number) => {
    if (!isSupabaseConfigured) return;
    await emailClient.from('fna_email_schedules').delete().eq('id', id);
  }, []);

  return { sendReport, sending, getEmailLogs, getSchedules, upsertSchedule, deleteSchedule };
}
