import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Helper: les tables fna_* ne sont pas typees dans Database — bypass via cast
const fromAny = (table: string) => (supabase as any).from(table);

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
    const { data } = await fromAny('fna_email_logs')
      .select('*')
      .eq('org_id', orgId)
      .order('sent_at', { ascending: false })
      .limit(100);
    return (data ?? []).map((r: any) => ({
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
    const { data } = await fromAny('fna_email_schedules')
      .select('*')
      .eq('org_id', orgId);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      orgId: r.org_id,
      reportType: r.report_type,
      frequency: r.frequency as 'weekly' | 'monthly' | 'quarterly',
      dayOfWeek: r.day_of_week,
      dayOfMonth: r.day_of_month,
      hour: r.hour,
      recipients: r.recipients,
      enabled: r.enabled,
      lastSentAt: r.last_sent_at,
      nextRunAt: r.next_run_at,
    }));
  }, []);

  /** Créer / mettre à jour une programmation */
  const upsertSchedule = useCallback(async (schedule: EmailSchedule) => {
    if (!isSupabaseConfigured) return;
    const row: any = {
      org_id: schedule.orgId,
      report_type: schedule.reportType,
      frequency: schedule.frequency,
      day_of_week: schedule.dayOfWeek ?? null,
      day_of_month: schedule.dayOfMonth ?? null,
      hour: schedule.hour,
      recipients: schedule.recipients,
      enabled: schedule.enabled,
      next_run_at: schedule.nextRunAt,
    };
    if (schedule.id) {
      await fromAny('fna_email_schedules').update(row).eq('id', schedule.id);
    } else {
      await fromAny('fna_email_schedules').insert(row);
    }
  }, []);

  /** Supprimer une programmation */
  const deleteSchedule = useCallback(async (id: number) => {
    if (!isSupabaseConfigured) return;
    await fromAny('fna_email_schedules').delete().eq('id', id);
  }, []);

  return { sendReport, sending, getEmailLogs, getSchedules, upsertSchedule, deleteSchedule };
}
