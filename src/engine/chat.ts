/**
 * Chat interne — moteur de messagerie entre collaborateurs.
 *
 * Source de données : Supabase via dataProvider (obligatoire).
 *
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
import type { Channel, ChatMessage } from '../db/schema';
import { dataProvider } from '../db/provider';

/** Récupère ou crée le channel public #général d'une société. */
export async function getOrCreateGeneralChannel(orgId: string, currentUserId: string): Promise<Channel> {
  const existing = await dataProvider.findChannel(orgId, (c) => c.name === 'général');
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
  await dataProvider.upsertChannel(channel);
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
  await dataProvider.upsertChannel(channel);
  return channel;
}

/** Crée ou retourne un DM 1:1 entre deux utilisateurs. */
export async function getOrCreateDM(orgId: string, userA: string, userB: string): Promise<Channel> {
  const sorted = [userA, userB].sort();
  const id = `dm-${orgId}-${sorted[0]}-${sorted[1]}`;
  const existing = await dataProvider.getChannel(id);
  if (existing) return existing;

  const channel: Channel = {
    id, orgId, kind: 'dm',
    name: `dm-${sorted.join('-')}`,
    members: sorted,
    createdBy: userA,
    createdAt: Date.now(),
  };
  await dataProvider.upsertChannel(channel);
  return channel;
}

/** Liste les channels accessibles à un utilisateur dans une société. */
export async function listChannels(orgId: string, userId: string): Promise<Channel[]> {
  const all = await dataProvider.getChannels(orgId);
  return all
    .filter((c) => c.kind === 'public' || c.members?.includes(userId))
    .sort((a, b) => {
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
  const msg: Omit<ChatMessage, 'id'> = {
    orgId: params.orgId,
    channelId: params.channelId,
    userId: params.userId,
    userName: params.userName,
    content: params.content,
    mentions: params.mentions,
    replyTo: params.replyTo,
    attachment: params.attachment,
    readBy: [params.userId],
    createdAt: Date.now(),
  };
  const id = await dataProvider.addChatMessage(msg);
  // Met à jour updatedAt du channel pour le tri
  const channel = await dataProvider.getChannel(params.channelId);
  if (channel) await dataProvider.upsertChannel({ ...channel, updatedAt: Date.now() });
  return id;
}

/** Récupère les messages d'un channel (ordre chronologique, dernier limit). */
export async function getMessages(channelId: string, limit = 100): Promise<ChatMessage[]> {
  const all = await dataProvider.getChatMessagesByChannel(channelId);
  // Garder les `limit` derniers, ordre chronologique
  return all.slice(Math.max(0, all.length - limit));
}

/** Marque tous les messages d'un channel comme lus pour un utilisateur. */
export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const messages = await dataProvider.getChatMessagesByChannel(channelId);
  const updates = messages
    .filter((m) => !m.readBy?.includes(userId))
    .map((m) => ({
      id: m.id!,
      readBy: [...(m.readBy ?? []), userId],
    }));
  for (const u of updates) {
    await dataProvider.updateChatMessage(u.id, { readBy: u.readBy });
  }
}

/** Compte les messages non-lus par channel pour un utilisateur. */
export async function getUnreadCount(orgId: string, userId: string): Promise<Record<string, number>> {
  const messages = await dataProvider.getChatMessagesByOrg(orgId);
  const counts: Record<string, number> = {};
  for (const m of messages) {
    if (m.userId === userId) continue;
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
  const msg = await dataProvider.getChatMessage(messageId);
  if (!msg) return;
  const reactions = { ...(msg.reactions ?? {}) };
  const users = reactions[emoji] ?? [];
  if (users.includes(userId)) {
    reactions[emoji] = users.filter((u) => u !== userId);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji] = [...users, userId];
  }
  await dataProvider.updateChatMessage(messageId, { reactions });
}

/** Edite le contenu d'un message (uniquement par l'auteur). */
export async function editMessage(messageId: number, userId: string, newContent: string): Promise<boolean> {
  const msg = await dataProvider.getChatMessage(messageId);
  if (!msg || msg.userId !== userId) return false;
  const editedAt = Date.now();
  await dataProvider.updateChatMessage(messageId, { content: newContent, editedAt });
  return true;
}

/** Supprime un message (uniquement par l'auteur). */
export async function deleteMessage(messageId: number, userId: string): Promise<boolean> {
  const msg = await dataProvider.getChatMessage(messageId);
  if (!msg || msg.userId !== userId) return false;
  await dataProvider.deleteChatMessage(messageId);
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
