/**
 * Chat interne — moteur de messagerie entre collaborateurs.
 *
 * - Stockage Dexie (local-first) avec sync Supabase optionnelle
 * - Channels publics / privés / DM 1:1
 * - Mentions @user + réactions emoji
 * - Indicateurs lus/non-lus par utilisateur
 * - Threads (réponses à un message)
 *
 * API publique :
 *   getOrCreateGeneralChannel(orgId, userId) -> Channel
 *   sendMessage({orgId, channelId, content, mentions, replyTo})
 *   markChannelRead(channelId, userId)
 *   getUnreadCount(orgId, userId) -> Record<channelId, number>
 *   addReaction(messageId, emoji, userId)
 */
import { db, type Channel, type ChatMessage } from '../db/schema';

/** Récupère ou crée le channel public #général d'une société. */
export async function getOrCreateGeneralChannel(orgId: string, currentUserId: string): Promise<Channel> {
  const existing = await db.channels.where({ orgId, name: 'général' }).first();
  if (existing) return existing;

  const channel: Channel = {
    id: `chan-${orgId}-general`,
    orgId,
    kind: 'public',
    name: 'général',
    description: "Discussion générale de l'équipe",
    createdBy: currentUserId,
    createdAt: Date.now(),
    isPinned: true,
  };
  await db.channels.add(channel);
  void import('./chatSync').then(({ pushChannelToCloud }) => pushChannelToCloud(channel)).catch(() => { /* ignore */ });
  return channel;
}

/** Crée un channel public ou privé. */
export async function createChannel(
  orgId: string,
  name: string,
  kind: 'public' | 'private',
  createdBy: string,
  description?: string,
  members?: string[],
): Promise<Channel> {
  const id = `chan-${orgId}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
  const channel: Channel = {
    id, orgId, kind, name: name.toLowerCase(),
    description, createdBy, createdAt: Date.now(),
    members: kind === 'private' ? members : undefined,
  };
  await db.channels.add(channel);
  void import('./chatSync').then(({ pushChannelToCloud }) => pushChannelToCloud(channel)).catch(() => { /* ignore */ });
  return channel;
}

/** Crée ou retourne un DM 1:1 entre deux utilisateurs. */
export async function getOrCreateDM(orgId: string, userA: string, userB: string): Promise<Channel> {
  // ID déterministe (tri alphabétique pour que A→B et B→A donnent le même)
  const sorted = [userA, userB].sort();
  const id = `dm-${orgId}-${sorted[0]}-${sorted[1]}`;
  const existing = await db.channels.get(id);
  if (existing) return existing;

  const channel: Channel = {
    id, orgId, kind: 'dm',
    name: `dm-${sorted.join('-')}`,
    members: sorted,
    createdBy: userA,
    createdAt: Date.now(),
  };
  await db.channels.add(channel);
  void import('./chatSync').then(({ pushChannelToCloud }) => pushChannelToCloud(channel)).catch(() => { /* ignore */ });
  return channel;
}

/** Liste les channels accessibles à un utilisateur dans une société. */
export async function listChannels(orgId: string, userId: string): Promise<Channel[]> {
  const all = await db.channels.where('orgId').equals(orgId).toArray();
  return all
    .filter((c) => c.kind === 'public' || c.members?.includes(userId))
    .sort((a, b) => {
      // Pinned d'abord, puis par dernière activité (créationAt par défaut)
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
    });
}

/** Envoie un message dans un channel. */
export async function sendMessage(params: {
  orgId: string;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  mentions?: string[];
  replyTo?: number;
  attachment?: ChatMessage['attachment'];
}): Promise<number> {
  const msg: ChatMessage = {
    orgId: params.orgId,
    channelId: params.channelId,
    userId: params.userId,
    userName: params.userName,
    content: params.content,
    mentions: params.mentions,
    replyTo: params.replyTo,
    attachment: params.attachment,
    readBy: [params.userId], // l'auteur est marqué comme lu d'office
    createdAt: Date.now(),
  };
  const id = await db.chatMessages.add(msg);
  // Met à jour updatedAt du channel pour le tri
  await db.channels.update(params.channelId, { updatedAt: Date.now() });
  // Sync cloud (fire-and-forget — n'attend pas)
  void (async () => {
    try {
      const { pushMessageToCloud } = await import('./chatSync');
      await pushMessageToCloud({ ...msg, id: id as number });
    } catch { /* ignore */ }
  })();
  return id as number;
}

/** Récupère les messages d'un channel (les plus récents en premier). */
export async function getMessages(channelId: string, limit = 100): Promise<ChatMessage[]> {
  const messages = await db.chatMessages
    .where('channelId').equals(channelId)
    .reverse()
    .limit(limit)
    .toArray();
  return messages.reverse(); // ordre chronologique pour l'affichage
}

/** Marque tous les messages d'un channel comme lus pour un utilisateur. */
export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const messages = await db.chatMessages.where('channelId').equals(channelId).toArray();
  const updates = messages
    .filter((m) => !m.readBy?.includes(userId))
    .map((m) => ({
      id: m.id!,
      readBy: [...(m.readBy ?? []), userId],
    }));
  for (const u of updates) {
    await db.chatMessages.update(u.id, { readBy: u.readBy });
  }
}

/** Compte les messages non-lus par channel pour un utilisateur. */
export async function getUnreadCount(orgId: string, userId: string): Promise<Record<string, number>> {
  const messages = await db.chatMessages.where('orgId').equals(orgId).toArray();
  const counts: Record<string, number> = {};
  for (const m of messages) {
    if (m.userId === userId) continue; // l'utilisateur ne se compte pas comme non-lu pour ses propres messages
    if (m.readBy?.includes(userId)) continue;
    counts[m.channelId] = (counts[m.channelId] ?? 0) + 1;
  }
  return counts;
}

/** Total messages non-lus toutes channels confondues (pour badge sidebar). */
export async function getTotalUnread(orgId: string, userId: string): Promise<number> {
  const counts = await getUnreadCount(orgId, userId);
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

/** Ajoute / retire une réaction emoji sur un message. */
export async function toggleReaction(messageId: number, emoji: string, userId: string): Promise<void> {
  const msg = await db.chatMessages.get(messageId);
  if (!msg) return;
  const reactions = { ...(msg.reactions ?? {}) };
  const users = reactions[emoji] ?? [];
  if (users.includes(userId)) {
    reactions[emoji] = users.filter((u) => u !== userId);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji] = [...users, userId];
  }
  await db.chatMessages.update(messageId, { reactions });
  void import('./chatSync').then(({ updateMessageInCloud }) =>
    updateMessageInCloud(messageId, { reactions })).catch(() => { /* ignore */ });
}

/** Edite le contenu d'un message (uniquement par l'auteur). */
export async function editMessage(messageId: number, userId: string, newContent: string): Promise<boolean> {
  const msg = await db.chatMessages.get(messageId);
  if (!msg || msg.userId !== userId) return false;
  const editedAt = Date.now();
  await db.chatMessages.update(messageId, { content: newContent, editedAt });
  void import('./chatSync').then(({ updateMessageInCloud }) =>
    updateMessageInCloud(messageId, { content: newContent, editedAt })).catch(() => { /* ignore */ });
  return true;
}

/** Supprime un message (uniquement par l'auteur). */
export async function deleteMessage(messageId: number, userId: string): Promise<boolean> {
  const msg = await db.chatMessages.get(messageId);
  if (!msg || msg.userId !== userId) return false;
  // Sync cloud AVANT suppression locale (pour avoir encore la ligne en BDD au moment du push)
  await import('./chatSync').then(({ deleteMessageFromCloud }) =>
    deleteMessageFromCloud(messageId)).catch(() => { /* ignore */ });
  await db.chatMessages.delete(messageId);
  return true;
}

/** Extrait les mentions @user du contenu d'un message. */
export function extractMentions(content: string, knownUsers: { id: string; name: string }[]): string[] {
  const mentions: string[] = [];
  const regex = /@([a-zA-Z0-9._-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const mention = match[1].toLowerCase();
    const user = knownUsers.find(
      (u) => u.name.toLowerCase().replace(/\s+/g, '').includes(mention) || u.id === mention,
    );
    if (user && !mentions.includes(user.id)) mentions.push(user.id);
  }
  return mentions;
}
