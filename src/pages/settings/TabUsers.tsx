import { useState, useEffect } from 'react';
import { safeLocalStorage } from '../../lib/safeStorage';
import clsx from 'clsx';
import { Building2, CheckCircle2, Cloud, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { EmailPreviewModal } from '../../components/ui/EmailPreviewModal';
import { buildInvitationEmail } from '../../lib/emailTemplates';
import { toast } from '../../components/ui/Toast';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { useCloudData } from '../../hooks/useCloudData';

// ─── TYPES & CONSTANTS ──────────────────────────────────────────────
type AppRole = 'admin' | 'daf' | 'controller' | 'accountant' | 'dg' | 'auditor' | 'viewer' | 'custom';

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrateur',
  daf: 'Directeur Financier (DAF)',
  controller: 'Contrôleur de gestion',
  accountant: 'Comptable',
  dg: 'Direction Générale',
  auditor: 'Auditeur',
  viewer: 'Lecture seule',
  custom: 'Personnalisé',
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: 'Accès total — gestion utilisateurs, paramètres, données.',
  daf: 'Pilotage financier complet : rapports, budget, ratios, clôture.',
  controller: 'Contrôle de gestion : budgets, écarts, analytique, prévisions.',
  accountant: 'Saisie GL, rapprochements, lettrage, justifications de clôture.',
  dg: 'Vue exécutive : KPIs, board pack, comité, MD&A. Pas de modification.',
  auditor: 'Audit trail, contrôles SYSCOHADA, anomalies. Lecture étendue + commentaires.',
  viewer: 'Lecture seule sur les dashboards et rapports publiés.',
  custom: 'Permissions personnalisées par module.',
};

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  orgIds: string[];
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
  customPermissions?: Record<string, boolean>;
}

const USERS_KEY = 'cockpit-users';

export function loadUsers(): AppUser[] {
  try { return JSON.parse(safeLocalStorage.getItem(USERS_KEY) ?? '[]'); } catch { return []; }
}

export function saveUsers(users: AppUser[]) {
  safeLocalStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function loadUsersFromCloud(currentOrgId: string | undefined): Promise<AppUser[]> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
    if (!isSupabaseConfigured) return [];
    let query = (supabase as any).from('fna_org_members').select('*');
    if (currentOrgId) query = query.eq('org_id', currentOrgId);
    const { data, error } = await query;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[users] Pull fna_org_members error:', error.message);
      return [];
    }
    const map = new Map<string, AppUser>();
    for (const r of data ?? []) {
      const email = (r.email as string).toLowerCase();
      const existing = map.get(email);
      const orgIds = existing ? Array.from(new Set([...existing.orgIds, r.org_id])) : [r.org_id];
      map.set(email, {
        id: existing?.id ?? `user-${r.id ?? r.email}`,
        name: r.name ?? email.split('@')[0],
        email: r.email,
        role: (r.role ?? 'viewer') as AppRole,
        orgIds,
        active: r.active !== false,
        createdAt: Number(r.invited_at ?? Date.now()),
        lastLoginAt: r.last_login_at ? Number(r.last_login_at) : undefined,
      });
    }
    return Array.from(map.values());
  } catch (e) {
    console.warn('[users] loadUsersFromCloud failed:', e);
    return [];
  }
}

async function pushUserToCloud(user: AppUser): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
    if (!isSupabaseConfigured || user.orgIds.length === 0) return;
    const rows = user.orgIds.map((orgId) => ({
      org_id: orgId,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      invited_at: user.createdAt,
      last_login_at: user.lastLoginAt ?? null,
    }));
    await (supabase as any).from('fna_org_members').upsert(rows, { onConflict: 'org_id,email' });
  } catch (e) {
    console.warn('[users] pushUserToCloud failed (non-bloquant):', e);
  }
}

async function deleteUserFromCloud(email: string): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
    if (!isSupabaseConfigured) return;
    await (supabase as any).from('fna_org_members').delete().eq('email', email);
  } catch (e) {
    console.warn('[users] deleteUserFromCloud failed (non-bloquant):', e);
  }
}

function mergeUsers(local: AppUser[], cloud: AppUser[]): AppUser[] {
  const byEmail = new Map<string, AppUser>();
  for (const u of local) byEmail.set(u.email.toLowerCase(), u);
  for (const u of cloud) {
    const key = u.email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      byEmail.set(key, { ...u, id: existing.id });
    } else {
      byEmail.set(key, u);
    }
  }
  return Array.from(byEmail.values());
}

// ─── TAB USERS ──────────────────────────────────────────────────────
export function TabUsers() {
  const [users, setUsers] = useState<AppUser[]>(() => loadUsers());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [invitePreview, setInvitePreview] = useState<{ user: AppUser; orgs: { id: string; name: string }[] } | null>(null);
  const { data: orgs = [] } = useCloudData(() => dataProvider.getOrganizations(), [], { initial: [], tag: 'organizations' });
  const { currentOrgId } = useApp();

  useEffect(() => {
    let alive = true;
    (async () => {
      const cloud = await loadUsersFromCloud(undefined);
      if (!alive) return;
      const local = loadUsers();
      const merged = mergeUsers(local, cloud);
      saveUsers(merged);
      setUsers(merged);
    })();
    return () => { alive = false; };
  }, [currentOrgId]);

  const handleSave = (user: AppUser, sendInvite: boolean) => {
    const existing = users.findIndex((u) => u.id === user.id);
    const isNew = existing < 0;
    const next = isNew
      ? [...users, user]
      : users.map((u, i) => (i === existing ? user : u));
    setUsers(next);
    saveUsers(next);
    void pushUserToCloud(user);
    setModalOpen(false);
    setEditing(null);

    if (isNew && sendInvite) {
      toast.info('Invitation en cours…', `Envoi du lien à ${user.email}`);
      void (async () => {
        try {
          const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
          if (!isSupabaseConfigured) {
            toast.warning('Supabase non configuré', 'L\'utilisateur a été créé localement, mais aucun email n\'a été envoyé. Le preview reste disponible.');
            setInvitePreview({ user, orgs: orgs.filter((o) => user.orgIds.includes(o.id)) });
            return;
          }
          const orgsLabel = orgs.filter((o) => user.orgIds.includes(o.id))
            .map((o) => o.name).join(', ') || 'Toutes les sociétés autorisées';
          const { buildInvitationEmail: buildEmail } = await import('../../lib/emailTemplates');
          const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cockpit-fna.app';
          const content = buildEmail({
            recipientName: user.name,
            recipientEmail: user.email,
            roleLabel: ROLE_LABELS[user.role],
            orgsLabel,
            appUrl,
          });
          const { data, error } = await (supabase as any).functions.invoke('cockpit-invite-user', {
            body: {
              email: user.email,
              name: user.name,
              role: user.role,
              orgIds: user.orgIds,
              appUrl,
              subject: content.subject,
              html: content.htmlBody,
            },
          });
          if (error) throw new Error(error?.context?.error ?? error?.message ?? 'Erreur réseau');
          if (data?.success === false) {
            const parts: string[] = [data.error ?? 'Echec'];
            if (data.hint) parts.push(data.hint);
            if (data.supabaseError) {
              const se = data.supabaseError;
              parts.push(`Supabase : ${se.message ?? '?'}${se.code ? ` (code=${se.code})` : ''}${se.status ? ` [HTTP ${se.status}]` : ''}`);
            }
            if (data.details && typeof data.details === 'string') parts.push(data.details);
            // eslint-disable-next-line no-console
            console.error('[invite-user] Echec :', data);
            throw new Error(parts.join(' — '));
          }
          const successMsg = data?.linkType === 'recovery'
            ? `${user.name} existe deja sur Supabase. Lien de recuperation envoye pour redefinir son mot de passe.`
            : `${user.name} recevra un lien pour definir son mot de passe.`;
          toast.success('Invitation envoyée', successMsg);
        } catch (e: any) {
          toast.error('Invitation impossible', e?.message ?? 'Erreur inconnue');
          setInvitePreview({ user, orgs: orgs.filter((o) => user.orgIds.includes(o.id)) });
        }
      })();
      void import('../../engine/auditLog').then(({ audit }) => audit.userInvited(currentOrgId ?? 'global', user.email, user.role));
    } else {
      toast.success(isNew ? 'Utilisateur ajouté' : 'Utilisateur modifié', user.name);
      if (!isNew) {
        void import('../../engine/auditLog').then(({ audit }) => audit.userUpdated(currentOrgId ?? 'global', user.email, ['role/active/orgs']));
      }
    }
  };

  const resendInvite = async (u: AppUser) => {
    const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
    if (!isSupabaseConfigured) {
      toast.warning('Supabase non configuré');
      return;
    }
    toast.info('Renvoi en cours…', `→ ${u.email}`);
    try {
      const orgsLabel = orgs.filter((o) => u.orgIds.includes(o.id)).map((o) => o.name).join(', ') || 'Toutes les sociétés autorisées';
      const { buildInvitationEmail: buildEmail } = await import('../../lib/emailTemplates');
      const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cockpit-fna.app';
      const content = buildEmail({
        recipientName: u.name, recipientEmail: u.email, roleLabel: ROLE_LABELS[u.role],
        orgsLabel, appUrl,
      });
      const { data, error } = await (supabase as any).functions.invoke('cockpit-invite-user', {
        body: {
          email: u.email, name: u.name, role: u.role, orgIds: u.orgIds,
          appUrl, subject: content.subject, html: content.htmlBody,
          forceRecovery: true,
        },
      });
      if (error) throw new Error(error?.context?.error ?? error?.message ?? 'Erreur reseau Edge Function');
      if (data?.success === false) {
        const parts: string[] = [data.error ?? 'Echec'];
        if (data.hint) parts.push(data.hint);
        if (data.supabaseError) {
          const se = data.supabaseError;
          parts.push(`Supabase: ${se.message ?? '?'}${se.code ? ` (${se.code})` : ''}${se.status ? ` [${se.status}]` : ''}`);
        }
        if (data.resendStatus) parts.push(`Resend HTTP ${data.resendStatus}`);
        if (data.details && typeof data.details === 'string') parts.push(data.details);
        // eslint-disable-next-line no-console
        console.error('[resendInvite] Echec:', data);
        if (data.magicLink) {
          const ok = window.confirm(
            `Echec d'envoi automatique de l'email :\n\n${parts.join(' — ')}\n\nVoulez-vous copier le lien d'invitation dans le presse-papier pour l'envoyer manuellement a ${u.email} ?`,
          );
          if (ok) {
            try {
              await navigator.clipboard.writeText(data.magicLink);
              toast.success('Lien copié', 'Collez-le dans un message pour l\'utilisateur.');
            } catch {
              window.prompt('Copiez ce lien et envoyez-le à l\'utilisateur :', data.magicLink);
            }
            return;
          }
        }
        throw new Error(parts.join(' — '));
      }
      const msg = data?.linkType === 'recovery'
        ? `${u.name} recevra un nouveau lien (redefinition de mot de passe).`
        : `${u.name} recevra le lien d'activation.`;
      toast.success('Invitation renvoyée', msg);
    } catch (e: any) {
      toast.error('Échec du renvoi', e?.message ?? 'Erreur inconnue');
    }
  };

  const handleDelete = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (!confirm('Supprimer cet utilisateur ? Cette action est irréversible.')) return;
    const next = users.filter((u) => u.id !== id);
    setUsers(next);
    saveUsers(next);
    if (target) void deleteUserFromCloud(target.email);
    toast.success('Utilisateur supprimé');
    if (target) void import('../../engine/auditLog').then(({ audit }) => audit.userDeleted(currentOrgId ?? 'global', target.email));
  };

  const handleToggleActive = (id: string) => {
    const next = users.map((u) => u.id === id ? { ...u, active: !u.active } : u);
    setUsers(next);
    saveUsers(next);
    const target = next.find((u) => u.id === id);
    if (target) void pushUserToCloud(target);
  };

  const counts = {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admin: users.filter((u) => u.role === 'admin').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Utilisateurs</p>
          <p className="num text-2xl font-bold mt-1">{counts.total}</p>
        </Card>
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Actifs</p>
          <p className="num text-2xl font-bold mt-1 text-success">{counts.active}</p>
        </Card>
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Administrateurs</p>
          <p className="num text-2xl font-bold mt-1 text-accent">{counts.admin}</p>
        </Card>
      </div>

      <Card
        title="Utilisateurs"
        subtitle="Gestion des comptes — accès, rôles, permissions"
        action={
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4" /> Nouvel utilisateur
          </button>
        }
      >
        {users.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-primary-400 mb-3" />
            <p className="text-sm text-primary-500 mb-2">Aucun utilisateur configuré</p>
            <p className="text-xs text-primary-400 max-w-md mx-auto mb-4">
              Ajoutez votre premier utilisateur pour gérer les accès. En mode local, les comptes sont stockés dans le navigateur. En production avec Supabase, les comptes sont créés via Supabase Auth.
            </p>
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="w-4 h-4" /> Ajouter un utilisateur
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-primary-500 border-b-2 border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-3">Nom · Email</th>
                  <th className="text-left py-2 px-3 w-44">Rôle</th>
                  <th className="text-center py-2 px-3 w-24">Sociétés</th>
                  <th className="text-center py-2 px-3 w-24">Statut</th>
                  <th className="text-right py-2 px-3 w-32">Dernière connexion</th>
                  <th className="py-2 px-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                    <td className="py-2 px-3">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-[11px] text-primary-500">{u.email}</p>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={u.role === 'admin' ? 'critical' : u.role === 'daf' || u.role === 'dg' ? 'high' : 'low'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-xs num text-primary-500">{u.orgIds.length} / {orgs.length}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button onClick={() => handleToggleActive(u.id)} className={clsx('text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold', u.active ? 'bg-success/10 text-success' : 'bg-primary-200/60 text-primary-600')}>
                        {u.active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right text-xs text-primary-500 num">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button className="btn-ghost !p-1 text-primary-500 hover:text-accent" onClick={() => resendInvite(u)} title="Renvoyer l'invitation (lien définition mot de passe)">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn-ghost !p-1 text-primary-500 hover:text-accent" onClick={() => { setEditing(u); setModalOpen(true); }} title="Modifier">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn-ghost !p-1 text-primary-500 hover:text-error" onClick={() => handleDelete(u.id)} title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Rôles disponibles" subtitle="Description des 8 rôles standards">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
            <div key={role} className="p-3 rounded-xl border border-primary-200 dark:border-primary-700">
              <div className="flex items-center justify-between mb-1.5">
                <Badge variant={role === 'admin' ? 'critical' : role === 'daf' || role === 'dg' ? 'high' : 'low'}>{ROLE_LABELS[role]}</Badge>
                <span className="text-[10px] num text-primary-400">{users.filter((u) => u.role === role).length} user(s)</span>
              </div>
              <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card padded>
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1">Mode hybride local / Supabase Auth</p>
            <p className="text-xs text-primary-500 leading-relaxed">
              En mode local (sans Supabase), les utilisateurs sont stockés dans le navigateur (localStorage). En production avec Supabase configuré (variables <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">VITE_SUPABASE_URL</code> et <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>), les comptes sont gérés via Supabase Auth (email/mot de passe, magic link, OAuth Google) et les rôles via la table <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">fna_user_orgs</code>. Les permissions par rôle sont appliquées via Row-Level Security (RLS) Postgres.
            </p>
          </div>
        </div>
      </Card>

      <UserModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
        orgs={orgs}
      />
      <InvitePreviewModal
        open={!!invitePreview}
        onClose={() => setInvitePreview(null)}
        user={invitePreview?.user ?? null}
        orgs={invitePreview?.orgs ?? []}
      />
    </div>
  );
}

// ─── USER MODAL ─────────────────────────────────────────────────────
export function UserModal({ open, onClose, onSave, initial, orgs }: {
  open: boolean;
  onClose: () => void;
  onSave: (u: AppUser, sendInvite: boolean) => void;
  initial: AppUser | null;
  orgs: { id: string; name: string }[];
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('viewer');
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [sendInvite, setSendInvite] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEmail(initial.email);
      setRole(initial.role);
      setOrgIds(initial.orgIds);
      setActive(initial.active);
      setSendInvite(false);
    } else {
      setName('');
      setEmail('');
      setRole('viewer');
      setOrgIds([]);
      setActive(true);
      setSendInvite(true);
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!email.trim() || !email.includes('@')) {
      toast.warning('Email invalide', 'Saisissez une adresse email valide.');
      return;
    }
    if (!name.trim()) {
      toast.warning('Nom requis', 'Saisissez un nom complet.');
      return;
    }
    const user: AppUser = {
      id: initial?.id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      orgIds,
      active,
      createdAt: initial?.createdAt ?? Date.now(),
      lastLoginAt: initial?.lastLoginAt,
    };
    onSave(user, sendInvite);
  };

  const toggleOrg = (id: string) => {
    setOrgIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? `Modifier — ${initial.name}` : 'Nouvel utilisateur'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleSubmit}>
            <CheckCircle2 className="w-4 h-4" /> {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Nom complet</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" autoFocus />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@societe.com" />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1.5">Rôle</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={clsx(
                  'text-left p-2 rounded-lg border-2 transition-all',
                  role === r ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400',
                )}
                title={ROLE_DESCRIPTIONS[r]}
              >
                <p className="font-semibold text-xs">{ROLE_LABELS[r]}</p>
                <p className="text-[10px] text-primary-500 mt-0.5 leading-tight line-clamp-2">{ROLE_DESCRIPTIONS[r]}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-2">
            Sociétés accessibles ({orgIds.length} / {orgs.length})
          </label>
          {orgs.length === 0 ? (
            <p className="text-xs text-primary-400 italic">Aucune société. Créez-en une dans l'onglet Sociétés.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 border border-primary-200 dark:border-primary-700 rounded-lg">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2 border-b border-primary-200/60 dark:border-primary-800/40">
                <input
                  type="checkbox"
                  checked={orgIds.length === orgs.length}
                  onChange={(e) => setOrgIds(e.target.checked ? orgs.map((o) => o.id) : [])}
                />
                <span className="text-primary-700 dark:text-primary-300 font-semibold">Toutes les sociétés</span>
              </label>
              {orgs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={orgIds.includes(o.id)} onChange={() => toggleOrg(o.id)} />
                  <Building2 className="w-3.5 h-3.5 text-primary-400" />
                  {o.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="font-semibold">Compte actif</span>
            <span className="text-xs text-primary-500">— peut se connecter et accéder aux données</span>
          </label>
          {!initial && (
            <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-xl bg-accent/5 border border-accent/20">
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">📧 Envoyer une invitation par email</span>
                <p className="text-xs text-primary-500 mt-0.5">L'utilisateur recevra un email HTML avec le lien de l'application, son rôle, ses sociétés et un bouton de connexion.</p>
              </div>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── INVITE PREVIEW MODAL ───────────────────────────────────────────
export function InvitePreviewModal({ open, onClose, user, orgs }: {
  open: boolean;
  onClose: () => void;
  user: AppUser | null;
  orgs: { id: string; name: string }[];
}) {
  if (!user) return null;
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://cockpit-fna.app/login';
  const orgsLabel = orgs.length > 0 ? orgs.map((o) => o.name).join(', ') : 'Toutes les sociétés autorisées';

  const content = buildInvitationEmail({
    recipientName: user.name,
    recipientEmail: user.email,
    roleLabel: ROLE_LABELS[user.role],
    orgsLabel,
    appUrl,
  });

  return (
    <EmailPreviewModal
      open={open}
      onClose={onClose}
      recipient={{ name: user.name, email: user.email }}
      content={content}
      options={{
        mode: 'invitation',
        supabasePayload: { name: user.name, role: user.role, orgIds: user.orgIds },
      }}
    />
  );
}
