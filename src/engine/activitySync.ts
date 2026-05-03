/**
 * Activity Sync — Synchronisation Dexie ↔ Supabase pour les activités
 * (annotations / comments / corrections / validations).
 *
 * Même pattern que chatSync : local-first, fire-and-forget, realtime live.
 */
import { db, type Activity, type ActivityKind, type ActivityStatus } from '../db/schema';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const fromAny = (table: string) => (supabase as any).from(table);

function activityToRow(a: Activity): any {
  return {
    org_id: a.orgId,
    kind: a.kind,
    status: a.status,
    context: a.context,
    linked_id: a.linkedId ?? null,
    author_id: a.author,
    author_name: a.author,
    author_role: a.authorRole ?? null,
    content: a.content,
    metadata: a.metadata
      ? { ...a.metadata, contextLabel: a.contextLabel }
      : (a.contextLabel ? { contextLabel: a.contextLabel } : null),
    created_at: a.createdAt,
    updated_at: a.updatedAt ?? null,
    resolved_at: a.resolvedAt ?? null,
    resolved_by: a.resolvedBy ?? null,
  };
}

function rowToActivity(r: any): Activity {
  const metadata = r.metadata ?? {};
  const contextLabel = metadata.contextLabel;
  const cleanMeta = { ...metadata };
  delete cleanMeta.contextLabel;
  return {
    id: Number(r.id),
    orgId: r.org_id,
    kind: r.kind as ActivityKind,
    status: r.status as ActivityStatus,
    context: r.context ?? '',
    contextLabel,
    linkedId: r.linked_id ?? undefined,
    author: r.author_name ?? r.author_id,
    authorRole: r.author_role ?? undefined,
    content: r.content,
    metadata: Object.keys(cleanMeta).length > 0 ? cleanMeta : undefined,
    createdAt: Number(r.created_at),
    updatedAt: r.updated_at ? Number(r.updated_at) : undefined,
    resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined,
    resolvedBy: r.resolved_by ?? undefined,
  };
}

// ─── PUSH ──────────────────────────────────────────────────────────────

export async function pushActivityToCloud(activity: Activity): Promise<number | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await fromAny('fna_activities')
      .insert(activityToRow(activity))
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ? Number(data.id) : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[activitySync] pushActivity failed (non-bloquant):', e);
    return null;
  }
}

export async function updateActivityInCloud(localId: number, updates: Partial<Activity>): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const local = await db.activities.get(localId);
    if (!local) return;
    const row: any = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.content !== undefined) row.content = updates.content;
    if (updates.resolvedAt !== undefined) row.resolved_at = updates.resolvedAt;
    if (updates.resolvedBy !== undefined) row.resolved_by = updates.resolvedBy;
    if (updates.updatedAt !== undefined) row.updated_at = updates.updatedAt;
    if (Object.keys(row).length === 0) return;
    await fromAny('fna_activities')
      .update(row)
      .eq('org_id', local.orgId)
      .eq('created_at', local.createdAt)
      .eq('author_id', local.author);
  } catch (e) {
    console.warn('[activitySync] updateActivity failed (non-bloquant):', e);
  }
}

// ─── PULL ──────────────────────────────────────────────────────────────

export async function pullActivitiesFromCloud(orgId: string, sinceTs?: number): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    let query = fromAny('fna_activities')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (sinceTs) query = query.gte('created_at', sinceTs);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return 0;
    let added = 0;
    for (const r of data) {
      const a = rowToActivity(r);
      // Idempotence par (orgId+createdAt+author+context)
      const exists = await db.activities
        .where('[orgId+createdAt]')
        .equals([a.orgId, a.createdAt])
        .filter((x) => x.author === a.author && x.context === a.context)
        .first();
      if (!exists) {
        const { id: _remoteId, ...rest } = a;
        await db.activities.add(rest);
        added++;
      }
    }
    return added;
  } catch (e) {
    console.warn('[activitySync] pullActivities failed:', e);
    return 0;
  }
}

// ─── REALTIME ──────────────────────────────────────────────────────────

let realtimeActivityChannel: any = null;

export function subscribeActivityRealtime(orgId: string): () => void {
  if (!isSupabaseConfigured) return () => {};
  if (realtimeActivityChannel) {
    try { (supabase as any).removeChannel(realtimeActivityChannel); } catch { /* ignore */ }
  }
  realtimeActivityChannel = (supabase as any)
    .channel(`fna_activities_${orgId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'fna_activities', filter: `org_id=eq.${orgId}` },
      async (payload: any) => {
        try {
          if (payload.eventType === 'INSERT') {
            const a = rowToActivity(payload.new);
            const exists = await db.activities
              .where('[orgId+createdAt]')
              .equals([a.orgId, a.createdAt])
              .filter((x) => x.author === a.author && x.context === a.context)
              .first();
            if (!exists) {
              const { id: _r, ...rest } = a;
              await db.activities.add(rest);
            }
          } else if (payload.eventType === 'UPDATE') {
            const a = rowToActivity(payload.new);
            const local = await db.activities
              .where('[orgId+createdAt]')
              .equals([a.orgId, a.createdAt])
              .filter((x) => x.author === a.author && x.context === a.context)
              .first();
            if (local?.id) {
              await db.activities.update(local.id, {
                status: a.status,
                content: a.content,
                resolvedAt: a.resolvedAt,
                resolvedBy: a.resolvedBy,
                updatedAt: a.updatedAt,
              });
            }
          }
        } catch (e) {
          console.warn('[activitySync] realtime handler error:', e);
        }
      },
    )
    .subscribe();

  return () => {
    if (realtimeActivityChannel) {
      try { (supabase as any).removeChannel(realtimeActivityChannel); } catch { /* ignore */ }
      realtimeActivityChannel = null;
    }
  };
}

// ─── SYNC INITIAL ──────────────────────────────────────────────────────

export async function initialActivitySync(orgId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  // Limite à 90 jours pour les activities (utiles plus longtemps que les messages)
  const sinceTs = Date.now() - 90 * 86_400_000;
  return await pullActivitiesFromCloud(orgId, sinceTs);
}
