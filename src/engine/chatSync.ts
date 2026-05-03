/**
 * Chat Sync — Synchronisation Dexie ↔ Supabase pour le chat (channels + messages).
 *
 * Architecture :
 * - Local-first : Dexie reste la source of truth pour la latence
 * - Push : à chaque write Dexie, fire-and-forget vers Supabase
 * - Pull : au login, récupère les derniers channels/messages depuis Supabase
 * - Realtime : Supabase channels subscription pour push live entre devices
 *
 * Si Supabase n'est pas configuré, l'app reste 100% locale (no-op).
 */
import { db, type Channel, type ChatMessage } from '../db/schema';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Bypass typing — fna_* tables not in the generated Database types
const fromAny = (table: string) => (supabase as any).from(table);

// ─── Mappers (Dexie ↔ Supabase) ─────────────────────────────────────

function channelToRow(c: Channel): any {
  return {
    id: c.id,
    org_id: c.orgId,
    kind: c.kind,
    name: c.name,
    description: c.description ?? null,
    members: c.members ?? null,
    created_by: c.createdBy,
    created_at: c.createdAt,
    updated_at: c.updatedAt ?? null,
    is_pinned: c.isPinned ?? false,
  };
}
function rowToChannel(r: any): Channel {
  return {
    id: r.id,
    orgId: r.org_id,
    kind: r.kind,
    name: r.name,
    description: r.description ?? undefined,
    members: r.members ?? undefined,
    createdBy: r.created_by,
    createdAt: Number(r.created_at),
    updatedAt: r.updated_at ? Number(r.updated_at) : undefined,
    isPinned: r.is_pinned ?? undefined,
  };
}
function messageToRow(m: ChatMessage): any {
  return {
    org_id: m.orgId,
    channel_id: m.channelId,
    user_id: m.userId,
    user_name: m.userName,
    content: m.content,
    mentions: m.mentions ?? null,
    reactions: m.reactions ?? null,
    reply_to: m.replyTo ?? null,
    attachment: m.attachment ?? null,
    created_at: m.createdAt,
    edited_at: m.editedAt ?? null,
    read_by: m.readBy ?? null,
    // local id pour idempotence — mis dans metadata si la colonne existe
    ...(m.id ? { _local_id: m.id } : {}),
  };
}
function rowToMessage(r: any): ChatMessage {
  return {
    id: Number(r.id),
    orgId: r.org_id,
    channelId: r.channel_id,
    userId: r.user_id,
    userName: r.user_name,
    content: r.content,
    mentions: r.mentions ?? undefined,
    reactions: r.reactions ?? undefined,
    replyTo: r.reply_to ? Number(r.reply_to) : undefined,
    attachment: r.attachment ?? undefined,
    createdAt: Number(r.created_at),
    editedAt: r.edited_at ? Number(r.edited_at) : undefined,
    readBy: r.read_by ?? undefined,
  };
}

// ─── PUSH (Dexie → Supabase) ──────────────────────────────────────────

/** Pousse un channel vers Supabase (upsert). Fire-and-forget. */
export async function pushChannelToCloud(channel: Channel): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await fromAny('fna_channels').upsert(channelToRow(channel), { onConflict: 'id' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[chatSync] pushChannel failed (non-bloquant):', e);
  }
}

/** Pousse un message vers Supabase. Renvoie l'id remote (différent du local). */
export async function pushMessageToCloud(msg: ChatMessage): Promise<number | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await fromAny('fna_chat_messages')
      .insert(messageToRow(msg))
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ? Number(data.id) : null;
  } catch (e) {
    console.warn('[chatSync] pushMessage failed (non-bloquant):', e);
    return null;
  }
}

/** Update partiel d'un message (réactions, edit, readBy). */
export async function updateMessageInCloud(localId: number, updates: Partial<ChatMessage>): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const row: any = {};
    if (updates.content !== undefined) row.content = updates.content;
    if (updates.editedAt !== undefined) row.edited_at = updates.editedAt;
    if (updates.reactions !== undefined) row.reactions = updates.reactions;
    if (updates.readBy !== undefined) row.read_by = updates.readBy;
    if (Object.keys(row).length === 0) return;
    // On utilise content + created_at + user_id comme clé fonctionnelle
    // (l'id Supabase diffère de l'id local Dexie)
    const local = await db.chatMessages.get(localId);
    if (!local) return;
    await fromAny('fna_chat_messages')
      .update(row)
      .eq('channel_id', local.channelId)
      .eq('created_at', local.createdAt)
      .eq('user_id', local.userId);
  } catch (e) {
    console.warn('[chatSync] updateMessage failed (non-bloquant):', e);
  }
}

/** Supprime un message du cloud. */
export async function deleteMessageFromCloud(localId: number): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const local = await db.chatMessages.get(localId);
    if (!local) return;
    await fromAny('fna_chat_messages')
      .delete()
      .eq('channel_id', local.channelId)
      .eq('created_at', local.createdAt)
      .eq('user_id', local.userId);
  } catch (e) {
    console.warn('[chatSync] deleteMessage failed (non-bloquant):', e);
  }
}

// ─── PULL (Supabase → Dexie) ─────────────────────────────────────────

/** Récupère tous les channels Supabase d'une société et merge dans Dexie. */
export async function pullChannelsFromCloud(orgId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const { data, error } = await fromAny('fna_channels')
      .select('*')
      .eq('org_id', orgId);
    if (error) throw error;
    if (!data?.length) return 0;
    // Merge : remplace si nouveau, sinon garde le plus récent (updated_at)
    for (const r of data) {
      const channel = rowToChannel(r);
      const local = await db.channels.get(channel.id);
      if (!local || (channel.updatedAt ?? 0) >= (local.updatedAt ?? 0)) {
        await db.channels.put(channel);
      }
    }
    return data.length;
  } catch (e) {
    console.warn('[chatSync] pullChannels failed:', e);
    return 0;
  }
}

/** Récupère les messages récents d'une société et merge dans Dexie. */
export async function pullMessagesFromCloud(orgId: string, sinceTs?: number): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    let query = fromAny('fna_chat_messages')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (sinceTs) query = query.gte('created_at', sinceTs);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return 0;
    // Merge : insère si la combo (channelId+createdAt+userId) n'existe pas en local
    let added = 0;
    for (const r of data) {
      const m = rowToMessage(r);
      const exists = await db.chatMessages
        .where('[channelId+createdAt]')
        .equals([m.channelId, m.createdAt])
        .first();
      if (!exists) {
        // Insère sans préserver l'id remote (Dexie auto-incrémente)
        const { id: _remoteId, ...rest } = m;
        await db.chatMessages.add(rest);
        added++;
      }
    }
    return added;
  } catch (e) {
    console.warn('[chatSync] pullMessages failed:', e);
    return 0;
  }
}

/** Sync complet au login d'un user (pull seulement, plus rapide). */
export async function initialChatSync(orgId: string): Promise<{ channels: number; messages: number }> {
  if (!isSupabaseConfigured) return { channels: 0, messages: 0 };
  // Limite à 30 jours pour éviter de tirer un gros historique
  const sinceTs = Date.now() - 30 * 86_400_000;
  const [channels, messages] = await Promise.all([
    pullChannelsFromCloud(orgId),
    pullMessagesFromCloud(orgId, sinceTs),
  ]);
  return { channels, messages };
}

// ─── REALTIME (Supabase Realtime → Dexie) ────────────────────────────

let realtimeChannel: any = null;

/** S'abonne aux changements live (INSERT/UPDATE/DELETE) sur les messages. */
export function subscribeChatRealtime(orgId: string): () => void {
  if (!isSupabaseConfigured) return () => {};
  if (realtimeChannel) {
    try { (supabase as any).removeChannel(realtimeChannel); } catch { /* ignore */ }
  }
  realtimeChannel = (supabase as any)
    .channel(`fna_chat_${orgId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'fna_chat_messages', filter: `org_id=eq.${orgId}` },
      async (payload: any) => {
        try {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const m = rowToMessage(payload.new);
            const exists = await db.chatMessages
              .where('[channelId+createdAt]')
              .equals([m.channelId, m.createdAt])
              .first();
            if (!exists) {
              const { id: _r, ...rest } = m;
              await db.chatMessages.add(rest);
            } else if (payload.eventType === 'UPDATE') {
              await db.chatMessages.update(exists.id!, {
                content: m.content,
                editedAt: m.editedAt,
                reactions: m.reactions,
                readBy: m.readBy,
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old;
            const local = await db.chatMessages
              .where('[channelId+createdAt]')
              .equals([old.channel_id, Number(old.created_at)])
              .first();
            if (local?.id) await db.chatMessages.delete(local.id);
          }
        } catch (e) {
          console.warn('[chatSync] realtime handler error:', e);
        }
      },
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'fna_channels', filter: `org_id=eq.${orgId}` },
      async (payload: any) => {
        try {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const c = rowToChannel(payload.new);
            await db.channels.put(c);
          } else if (payload.eventType === 'DELETE') {
            await db.channels.delete(payload.old.id);
          }
        } catch (e) {
          console.warn('[chatSync] channel realtime error:', e);
        }
      },
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      try { (supabase as any).removeChannel(realtimeChannel); } catch { /* ignore */ }
      realtimeChannel = null;
    }
  };
}
