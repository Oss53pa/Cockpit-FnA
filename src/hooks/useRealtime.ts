import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'attention_points' | 'action_plans' | 'reports';

/**
 * Souscrit aux changements Realtime Supabase sur une table.
 * Appelle `onUpdate()` à chaque INSERT/UPDATE/DELETE filtré par org_id.
 */
export function useRealtime(table: TableName, orgId: string, onUpdate: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return;

    const channel = supabase
      .channel(`${table}_${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` },
        () => onUpdate()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [table, orgId, onUpdate]);
}

/**
 * Hook de statut de connexion Supabase.
 */
export function useConnectionStatus() {
  const ref = useRef<'online' | 'syncing' | 'offline'>('online');

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const check = async () => {
      try {
        const { error } = await supabase.from('fna_organizations').select('id').limit(1);
        ref.current = error ? 'offline' : 'online';
      } catch {
        ref.current = 'offline';
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return ref.current;
}
