/**
 * Chat interne — discussion entre collaborateurs.
 *
 * Layout 3 colonnes :
 *  - GAUCHE : sidebar channels + DM (avec unread badges)
 *  - CENTRE : header channel + thread messages + composer
 *  - DROITE : optionnel — détails channel + membres
 *
 * Features :
 *  - Channels publics + DM 1:1 + privés (membres restreints)
 *  - Mentions @user (autocomplete)
 *  - Réactions emoji rapides
 *  - Indicateurs lus/non-lus
 *  - Cmd+Enter pour envoyer
 *  - Threads (réponses)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Send, Hash, Lock, MessageCircle, Users, Plus, X, Search,
  Smile, Reply, Pin, Settings as SettingsIcon, AtSign, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../db/schema';
import { useApp } from '../store/app';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import {
  getOrCreateGeneralChannel, listChannels, sendMessage, markChannelRead,
  getUnreadCount, toggleReaction, deleteMessage, extractMentions, getOrCreateDM, createChannel,
} from '../engine/chat';

// User loaded from localStorage (compatible with Settings users system)
type AppUser = { id: string; name: string; email: string; role: string };
function loadUsers(): AppUser[] {
  try { return JSON.parse(localStorage.getItem('cockpit-users') ?? '[]'); } catch { return []; }
}
function getCurrentUser(): AppUser {
  try {
    const raw = sessionStorage.getItem('cockpit-current-user');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Fallback : 1er user de la liste ou identité par défaut
  const users = loadUsers();
  return users[0] ?? { id: 'self', name: 'Vous', email: 'me@cockpit.app', role: 'admin' };
}

const QUICK_EMOJIS = ['👍', '❤️', '🚀', '👏', '🔥', '✅', '👀', '🎉'];

export default function Chat() {
  const { currentOrgId } = useApp();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; content: string; userName: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const me = useMemo(() => getCurrentUser(), []);
  const orgUsers = useMemo(() => loadUsers(), []);

  // ── Charge les channels en live (Dexie reactive) ──
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  useEffect(() => {
    // Force l'ouverture de la DB pour déclencher les migrations avant les queries
    db.open().then(() => setDbReady(true)).catch((e) => {
      console.error('[Chat] DB open error:', e);
      setDbError(e?.message ?? 'Erreur base de données');
    });
  }, []);

  const channels = useLiveQuery(
    async () => {
      if (!currentOrgId || !dbReady) return [];
      // Auto-init : crée le channel #général au premier accès
      await getOrCreateGeneralChannel(currentOrgId, me.id);
      return await listChannels(currentOrgId, me.id);
    },
    [currentOrgId, me.id, dbReady],
    [],
  ) ?? [];

  // ── Sélectionne le 1er channel par défaut ──
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  // ── Messages du channel actif (live) ──
  const messages = useLiveQuery(
    async () => {
      if (!activeChannelId || !dbReady) return [];
      const msgs = await db.chatMessages
        .where('channelId').equals(activeChannelId)
        .toArray();
      return msgs.sort((a, b) => a.createdAt - b.createdAt);
    },
    [activeChannelId, dbReady],
    [],
  ) ?? [];

  // ── Compteurs unread (live) ──
  const unreadCounts = useLiveQuery(
    async () => {
      if (!currentOrgId) return {};
      try { return await getUnreadCount(currentOrgId, me.id); }
      catch { return {}; }
    },
    [currentOrgId, me.id, messages.length],
    {},
  ) ?? {};

  // ── Marque le channel comme lu quand on l'ouvre ou quand de nouveaux messages arrivent ──
  useEffect(() => {
    if (activeChannelId && messages.length > 0) {
      const t = setTimeout(() => markChannelRead(activeChannelId, me.id), 600);
      return () => clearTimeout(t);
    }
  }, [activeChannelId, messages.length, me.id]);

  // ── Auto-scroll vers le dernier message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  const handleSend = async () => {
    if (!composerValue.trim() || !activeChannelId || !currentOrgId) return;
    const mentions = extractMentions(composerValue, orgUsers.map((u) => ({ id: u.id, name: u.name })));
    await sendMessage({
      orgId: currentOrgId,
      channelId: activeChannelId,
      userId: me.id,
      userName: me.name,
      content: composerValue.trim(),
      mentions: mentions.length > 0 ? mentions : undefined,
      replyTo: replyTo?.id,
    });
    setComposerValue('');
    setReplyTo(null);
    composerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredChannels = channels.filter((c) =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const publicChans = filteredChannels.filter((c) => c.kind === 'public');
  const privateChans = filteredChannels.filter((c) => c.kind === 'private');
  const dms = filteredChannels.filter((c) => c.kind === 'dm');

  if (!currentOrgId) {
    return (
      <div>
        <PageHeader title="Chat interne" subtitle="Sélectionnez une société pour démarrer" />
      </div>
    );
  }

  if (dbError) {
    return (
      <div>
        <PageHeader title="Chat interne" subtitle="Erreur d'initialisation" />
        <EmptyState
          icon={MessageCircle}
          title="Base de données inaccessible"
          description={`${dbError}. Essayez de rafraîchir la page (F5). Si le problème persiste, videz le cache du navigateur.`}
          action={<button className="btn-primary" onClick={() => window.location.reload()}>Rafraîchir</button>}
        />
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div>
        <PageHeader title="Chat interne" subtitle="Initialisation…" />
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary-200 border-t-accent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader
        eyebrow="Collaboration"
        title="Chat interne"
        subtitle="Discutez en temps réel avec votre équipe — channels, DM, mentions et threads"
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_240px] gap-3 min-h-0">
        {/* ── COLONNE GAUCHE : Channels + DM ── */}
        <Card padded={false} className="flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-primary-200/60 dark:border-primary-800/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher channel…"
                className="input !pl-8 !py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Channels publics */}
            <ChannelSection
              title="Channels"
              icon={Hash}
              channels={publicChans}
              activeId={activeChannelId}
              unreadCounts={unreadCounts}
              onSelect={setActiveChannelId}
              onAdd={() => setShowNewChannel(true)}
            />

            {/* Channels privés */}
            {privateChans.length > 0 && (
              <ChannelSection
                title="Privés"
                icon={Lock}
                channels={privateChans}
                activeId={activeChannelId}
                unreadCounts={unreadCounts}
                onSelect={setActiveChannelId}
              />
            )}

            {/* DMs */}
            <DMSection
              orgUsers={orgUsers.filter((u) => u.id !== me.id)}
              dms={dms}
              activeId={activeChannelId}
              unreadCounts={unreadCounts}
              onOpen={async (otherId) => {
                if (!currentOrgId) return;
                const dm = await getOrCreateDM(currentOrgId, me.id, otherId);
                setActiveChannelId(dm.id);
              }}
            />
          </div>

          {/* Footer : utilisateur courant */}
          <div className="px-3 py-2.5 border-t border-primary-200/60 dark:border-primary-800/60 flex items-center gap-2">
            <Avatar name={me.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{me.name}</p>
              <p className="text-[10px] text-primary-500 truncate">{me.role}</p>
            </div>
            <span className="dot dot-success dot-pulse" title="En ligne" />
          </div>
        </Card>

        {/* ── COLONNE CENTRE : Messages ── */}
        <Card padded={false} className="flex flex-col overflow-hidden">
          {activeChannel ? (
            <>
              {/* Header channel */}
              <div className="px-5 py-3 border-b border-primary-200/60 dark:border-primary-800/60 flex items-center gap-3">
                <ChannelIcon kind={activeChannel.kind} className="w-4 h-4 text-primary-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 truncate">
                    {activeChannel.kind === 'dm' ? dmTitle(activeChannel, me.id, orgUsers) : activeChannel.name}
                  </p>
                  {activeChannel.description && (
                    <p className="text-[11px] text-primary-500 truncate">{activeChannel.description}</p>
                  )}
                </div>
                {activeChannel.kind !== 'dm' && (
                  <button className="btn-icon w-7 h-7" title="Paramètres du channel">
                    <SettingsIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Messages thread */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
                {messages.length === 0 ? (
                  <EmptyState
                    icon={MessageCircle}
                    title="Aucun message"
                    description={`Soyez le premier à écrire dans ${activeChannel.kind === 'dm' ? 'cette conversation' : `#${activeChannel.name}`}.`}
                  />
                ) : (
                  messages.map((m, i) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      previousMessage={i > 0 ? messages[i - 1] : null}
                      isOwn={m.userId === me.id}
                      currentUserId={me.id}
                      onReact={async (emoji) => { if (m.id) { await toggleReaction(m.id, emoji, me.id); } }}
                      onReply={() => setReplyTo({ id: m.id!, content: m.content, userName: m.userName })}
                      onDelete={async () => {
                        if (!m.id) return;
                        if (!confirm('Supprimer ce message ?')) return;
                        const ok = await deleteMessage(m.id, me.id);
                        if (ok) toast.success('Message supprimé');
                      }}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-primary-200/60 dark:border-primary-800/60 px-4 pt-3 pb-3 bg-primary-50/30 dark:bg-primary-950/30">
                {replyTo && (
                  <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-accent/5 border-l-2 border-accent text-xs">
                    <Reply className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-accent uppercase tracking-wider">Répondre à {replyTo.userName}</p>
                      <p className="text-primary-600 dark:text-primary-300 truncate">{replyTo.content}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-primary-400 hover:text-primary-700 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={composerRef}
                    value={composerValue}
                    onChange={(e) => setComposerValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Écrire dans ${activeChannel.kind === 'dm' ? dmTitle(activeChannel, me.id, orgUsers) : `#${activeChannel.name}`}…`}
                    rows={1}
                    className="input flex-1 !py-2 text-sm resize-none min-h-[40px] max-h-[160px]"
                    style={{ height: Math.min(160, Math.max(40, composerValue.split('\n').length * 22 + 18)) }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!composerValue.trim()}
                    className="btn-clay !px-4 !py-2 shrink-0"
                    title="Envoyer (Cmd+Enter)"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-primary-400">
                  <span><kbd className="kbd">⌘</kbd> + <kbd className="kbd">↵</kbd> pour envoyer</span>
                  <span>·</span>
                  <span><kbd className="kbd">@</kbd> pour mentionner</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageCircle}
                title="Sélectionnez un channel"
                description="Choisissez un channel ou démarrez une conversation directe."
              />
            </div>
          )}
        </Card>

        {/* ── COLONNE DROITE : Détails / Membres ── */}
        <Card padded={false} className="hidden lg:flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-primary-200/60 dark:border-primary-800/60">
            <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500">Membres</p>
            <p className="text-xs text-primary-700 dark:text-primary-300 mt-0.5">{orgUsers.length} collaborateur{orgUsers.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {orgUsers.map((u) => (
              <div key={u.id} className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                u.id === me.id && 'bg-accent/5',
              )}>
                <Avatar name={u.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{u.name}</p>
                  <p className="text-[10px] text-primary-500 truncate">{u.role}</p>
                </div>
                {u.id !== me.id && (
                  <button
                    onClick={async () => {
                      if (!currentOrgId) return;
                      const dm = await getOrCreateDM(currentOrgId, me.id, u.id);
                      setActiveChannelId(dm.id);
                    }}
                    className="btn-icon !w-7 !h-7"
                    title="Démarrer une conversation"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Modal nouveau channel */}
      {showNewChannel && (
        <NewChannelModal
          onClose={() => setShowNewChannel(false)}
          orgId={currentOrgId}
          createdBy={me.id}
          orgUsers={orgUsers}
          onCreated={(id) => {
            setActiveChannelId(id);
            setShowNewChannel(false);
          }}
        />
      )}
    </div>
  );
}

// ── Composants enfants ────────────────────────────────────────────

function ChannelSection({ title, icon: Icon, channels, activeId, unreadCounts, onSelect, onAdd }: any) {
  return (
    <div className="px-2 pt-3 pb-1">
      <div className="flex items-center justify-between px-2 mb-1">
        <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary-500">{title}</p>
        {onAdd && (
          <button onClick={onAdd} className="btn-icon !w-5 !h-5 !text-primary-400 hover:!text-accent" title={`Nouveau ${title.toLowerCase()}`}>
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {channels.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-primary-400 italic">Aucun</p>
        ) : channels.map((c: any) => {
          const unread = unreadCounts[c.id] ?? 0;
          const active = activeId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs',
                'transition-colors duration-100',
                active
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">{c.name}</span>
              {unread > 0 && (
                <span className="text-[10px] px-1.5 rounded-md bg-accent text-white font-bold tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DMSection({ orgUsers, dms, activeId, unreadCounts, onOpen }: any) {
  return (
    <div className="px-2 pt-3 pb-1">
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary-500 px-2 mb-1">Messages directs</p>
      <div className="space-y-0.5">
        {orgUsers.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-primary-400 italic">Aucun collaborateur</p>
        ) : orgUsers.map((u: AppUser) => {
          // Trouve le DM existant pour cet user
          const dm = dms.find((d: any) => d.members?.includes(u.id));
          const unread = dm ? (unreadCounts[dm.id] ?? 0) : 0;
          const active = dm && activeId === dm.id;
          return (
            <button
              key={u.id}
              onClick={() => onOpen(u.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs',
                'transition-colors duration-100',
                active
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800',
              )}
            >
              <Avatar name={u.name} size={20} />
              <span className="flex-1 text-left truncate">{u.name}</span>
              {unread > 0 && (
                <span className="text-[10px] px-1.5 rounded-md bg-accent text-white font-bold tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageRow({ message, previousMessage, isOwn, currentUserId, onReact, onReply, onDelete }: any) {
  const [showActions, setShowActions] = useState(false);
  // Groupe les messages consécutifs du même user dans un délai de 5min
  const isSameAuthor = previousMessage
    && previousMessage.userId === message.userId
    && (message.createdAt - previousMessage.createdAt) < 5 * 60 * 1000;

  return (
    <div
      className={clsx(
        'group relative flex items-start gap-2.5 px-2 py-1 -mx-2 rounded-lg',
        'hover:bg-primary-100/40 dark:hover:bg-primary-800/40 transition-colors',
        isSameAuthor ? 'mt-0' : 'mt-3',
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isSameAuthor ? (
        <Avatar name={message.userName} size={32} />
      ) : (
        <div className="w-8 shrink-0 text-[9px] text-primary-300 text-right pt-1 opacity-0 group-hover:opacity-100">
          {new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {!isSameAuthor && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-primary-900 dark:text-primary-50">{message.userName}</span>
            <span className="text-[10px] text-primary-400">
              {new Date(message.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
            </span>
          </div>
        )}
        <p className="text-sm text-primary-800 dark:text-primary-200 leading-relaxed whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </p>
        {message.editedAt && (
          <span className="text-[10px] text-primary-400 italic">(modifié)</span>
        )}
        {/* Réactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {Object.entries(message.reactions).map(([emoji, users]: any) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]',
                  'border transition-colors',
                  users.includes(currentUserId)
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-primary-100/60 dark:bg-primary-800/60 border-primary-200 dark:border-primary-700 hover:border-primary-400',
                )}
              >
                <span>{emoji}</span>
                <span className="num font-semibold">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Actions hover */}
      {showActions && (
        <div className="absolute right-2 -top-3 flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-surface dark:bg-primary-800 shadow-md border border-primary-200 dark:border-primary-700">
          {QUICK_EMOJIS.slice(0, 4).map((e) => (
            <button
              key={e}
              onClick={() => onReact(e)}
              className="text-base hover:scale-125 transition-transform px-1"
              title={`Réagir avec ${e}`}
            >
              {e}
            </button>
          ))}
          <button onClick={onReply} className="btn-icon !w-6 !h-6" title="Répondre">
            <Reply className="w-3 h-3" />
          </button>
          {isOwn && (
            <button onClick={onDelete} className="btn-icon !w-6 !h-6 !text-error" title="Supprimer">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Rend le contenu d'un message — détecte les @mentions et URLs */
function renderContent(content: string) {
  const parts: any[] = [];
  const regex = /(@[a-zA-Z0-9._-]+)|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push(content.substring(last, match.index));
    if (match[1]) {
      parts.push(
        <span key={key++} className="inline-flex items-center px-1 rounded bg-accent/10 text-accent font-semibold text-[12.5px]">
          {match[1]}
        </span>,
      );
    } else if (match[2]) {
      parts.push(
        <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer"
          className="text-accent underline hover:opacity-80">
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push(content.substring(last));
  return parts.length > 0 ? parts : content;
}

function ChannelIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === 'private') return <Lock className={className} />;
  if (kind === 'dm') return <MessageCircle className={className} />;
  return <Hash className={className} />;
}

function dmTitle(channel: any, currentUserId: string, users: AppUser[]): string {
  const otherId = (channel.members ?? []).find((u: string) => u !== currentUserId);
  const other = users.find((u) => u.id === otherId);
  return other?.name ?? 'Conversation';
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  // Couleur déterministe basée sur le hash du nom
  const palette = ['#7FA88E', '#C97A5A', '#5E8772', '#D4A574', '#8B7355', '#5A8FA1', '#7FA88E'];
  const hash = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const bg = palette[hash % palette.length];
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  );
}

function NewChannelModal({ onClose, orgId, createdBy, orgUsers, onCreated }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'public' | 'private'>('public');
  const [members, setMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.warning('Nom requis', 'Saisissez un nom de channel.');
      return;
    }
    setCreating(true);
    try {
      const c = await createChannel(orgId, name, kind, createdBy, description, kind === 'private' ? [createdBy, ...members] : undefined);
      toast.success('Channel créé', `#${c.name}`);
      onCreated(c.id);
    } catch (e: any) {
      toast.error('Erreur', e?.message ?? 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-primary-950/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md card-elevated p-6 animate-scale-in">
        <h3 className="text-base font-semibold mb-1">Nouveau channel</h3>
        <p className="text-xs text-primary-500 mb-4">Créez un espace de discussion thématique pour votre équipe.</p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1">Nom</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="ex: clôture-mensuelle" autoFocus />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1">Description (facultatif)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="À quoi sert ce channel ?" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setKind('public')} className={clsx('p-3 rounded-lg border-2 text-left', kind === 'public' ? 'border-accent bg-accent/5' : 'border-primary-200')}>
                <Hash className="w-4 h-4 mb-1 text-primary-500" />
                <p className="text-xs font-semibold">Public</p>
                <p className="text-[10px] text-primary-500">Tous les membres</p>
              </button>
              <button onClick={() => setKind('private')} className={clsx('p-3 rounded-lg border-2 text-left', kind === 'private' ? 'border-accent bg-accent/5' : 'border-primary-200')}>
                <Lock className="w-4 h-4 mb-1 text-primary-500" />
                <p className="text-xs font-semibold">Privé</p>
                <p className="text-[10px] text-primary-500">Membres invités uniquement</p>
              </button>
            </div>
          </div>
          {kind === 'private' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-primary-500 block mb-1.5">
                Membres ({members.length} sélectionné{members.length > 1 ? 's' : ''})
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 p-2 border border-primary-200 rounded-lg">
                {orgUsers.filter((u: AppUser) => u.id !== createdBy).map((u: AppUser) => (
                  <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={members.includes(u.id)} onChange={(e) => {
                      setMembers(e.target.checked ? [...members, u.id] : members.filter((m) => m !== u.id));
                    }} />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-clay" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
