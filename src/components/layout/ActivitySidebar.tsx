/**
 * ActivitySidebar — sidebar droite pour le suivi temps réel :
 *  - 📝 Annotations
 *  - 💬 Commentaires
 *  - ✏️ Corrections
 *  - ✅ Validations
 *
 * Tirée de la table Dexie `activities`. Multi-tenant via orgId. Filtres par
 * type, statut et contexte. Toggle ouvert/fermé persisté dans localStorage.
 */
import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import {
  MessageSquare, Edit2, CheckCircle2, AlertCircle, X, ChevronRight, Send, Filter, Trash2, History,
} from 'lucide-react';
import clsx from 'clsx';
import { db, type Activity, type ActivityKind, type ActivityStatus } from '../../db/schema';
import { useApp } from '../../store/app';
import { toast } from '../ui/Toast';

const SIDEBAR_OPEN_KEY = 'activity-sidebar-open';
const SIDEBAR_FILTER_KEY = 'activity-sidebar-filter';

type Filter = 'all' | ActivityKind;

const KIND_LABELS: Record<ActivityKind, string> = {
  annotation: 'Annotations',
  comment: 'Commentaires',
  correction: 'Corrections',
  validation: 'Validations',
};

const KIND_ICONS: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  annotation: Edit2,
  comment: MessageSquare,
  correction: AlertCircle,
  validation: CheckCircle2,
};

const KIND_COLORS: Record<ActivityKind, string> = {
  annotation: 'text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40',
  comment: 'text-primary-700 bg-primary-200 dark:text-primary-200 dark:bg-primary-800',
  correction: 'text-warning bg-warning/10',
  validation: 'text-success bg-success/10',
};

export function ActivitySidebarToggle() {
  const orgId = useApp((s) => s.currentOrgId);
  const open = typeof window !== 'undefined' && localStorage.getItem(SIDEBAR_OPEN_KEY) === '1';
  const [, setTick] = useState(0);

  const activities = useLiveQuery(
    () => orgId ? db.activities.where('orgId').equals(orgId).filter((a) => a.status === 'open').toArray() : Promise.resolve([]),
    [orgId], [],
  ) ?? [];

  const toggle = () => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, open ? '0' : '1');
    window.dispatchEvent(new Event('activity-sidebar-toggle'));
    setTick((t) => t + 1);
  };

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener('activity-sidebar-toggle', onChange);
    return () => window.removeEventListener('activity-sidebar-toggle', onChange);
  }, []);

  if (open) return null; // hidden when sidebar is open

  return (
    <button
      onClick={toggle}
      className="fixed right-3 top-1/2 -translate-y-1/2 z-30 w-10 h-12 rounded-l-xl bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 shadow-lg hover:right-2 transition-all flex flex-col items-center justify-center gap-0.5"
      title={`Suivi (${activities.length} ouvert${activities.length > 1 ? 's' : ''})`}
      aria-label="Ouvrir le suivi des activités"
    >
      <History className="w-4 h-4" />
      {activities.length > 0 && (
        <span className="text-[9px] num font-bold bg-accent text-white rounded-full px-1.5 py-0.5">{activities.length}</span>
      )}
    </button>
  );
}

export function ActivitySidebar() {
  const orgId = useApp((s) => s.currentOrgId);
  const location = useLocation();
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && localStorage.getItem(SIDEBAR_OPEN_KEY) === '1');
  const [filter, setFilter] = useState<Filter>(() => (localStorage.getItem(SIDEBAR_FILTER_KEY) as Filter) || 'all');
  const [showResolved, setShowResolved] = useState(false);
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [newKind, setNewKind] = useState<ActivityKind>('comment');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    const onChange = () => setOpen(localStorage.getItem(SIDEBAR_OPEN_KEY) === '1');
    window.addEventListener('activity-sidebar-toggle', onChange);
    return () => window.removeEventListener('activity-sidebar-toggle', onChange);
  }, []);

  const close = () => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, '0');
    setOpen(false);
    window.dispatchEvent(new Event('activity-sidebar-toggle'));
  };

  const all = useLiveQuery(
    () => orgId ? db.activities.where('orgId').equals(orgId).reverse().sortBy('createdAt') : Promise.resolve([]),
    [orgId], [],
  ) ?? [];

  const filtered = useMemo(() => {
    return all.filter((a: Activity) => {
      if (!showResolved && a.status !== 'open') return false;
      if (filter !== 'all' && a.kind !== filter) return false;
      if (scope === 'current' && a.context !== location.pathname) return false;
      return true;
    });
  }, [all, filter, showResolved, scope, location.pathname]);

  const counts = useMemo(() => {
    const open = all.filter((a: Activity) => a.status === 'open');
    return {
      total: open.length,
      annotation: open.filter((a: Activity) => a.kind === 'annotation').length,
      comment: open.filter((a: Activity) => a.kind === 'comment').length,
      correction: open.filter((a: Activity) => a.kind === 'correction').length,
      validation: open.filter((a: Activity) => a.kind === 'validation').length,
    };
  }, [all]);

  const setFilterPersist = (f: Filter) => {
    setFilter(f);
    localStorage.setItem(SIDEBAR_FILTER_KEY, f);
  };

  const addActivity = async () => {
    if (!orgId) { toast.error('Société manquante'); return; }
    if (!newContent.trim()) { toast.warning('Contenu vide'); return; }
    try {
      // Récupère l'auteur depuis sessionStorage Supabase Auth (fallback local)
      const authorName = (() => {
        try {
          const raw = sessionStorage.getItem('cockpit-current-user');
          if (raw) return JSON.parse(raw)?.name ?? 'Utilisateur local';
        } catch { /* ignore */ }
        return 'Utilisateur local';
      })();
      const activity = {
        orgId,
        kind: newKind,
        status: (newKind === 'validation' ? 'resolved' : 'open') as 'open' | 'resolved' | 'archived',
        context: location.pathname,
        contextLabel: document.title || location.pathname,
        author: authorName,
        content: newContent.trim(),
        createdAt: Date.now(),
        ...(newKind === 'validation' ? { resolvedAt: Date.now(), resolvedBy: authorName } : {}),
      };
      const localId = await db.activities.add(activity);
      setNewContent('');
      toast.success(`${KIND_LABELS[newKind].slice(0, -1)} ajoutée`);
      // Sync cloud (fire-and-forget)
      void import('../../engine/activitySync').then(({ pushActivityToCloud }) =>
        pushActivityToCloud({ ...activity, id: localId as number })).catch(() => { /* ignore */ });
    } catch (e: any) {
      toast.error('Erreur', e?.message ?? 'Ajout impossible.');
    }
  };

  const resolveActivity = async (a: Activity) => {
    if (!a.id) return;
    const authorName = (() => {
      try {
        const raw = sessionStorage.getItem('cockpit-current-user');
        if (raw) return JSON.parse(raw)?.name ?? 'Utilisateur local';
      } catch { /* ignore */ }
      return 'Utilisateur local';
    })();
    const updates = { status: 'resolved' as const, resolvedAt: Date.now(), resolvedBy: authorName };
    await db.activities.update(a.id, updates);
    void import('../../engine/activitySync').then(({ updateActivityInCloud }) =>
      updateActivityInCloud(a.id!, updates)).catch(() => { /* ignore */ });
    toast.success('Résolu');
  };

  const archiveActivity = async (a: Activity) => {
    if (!a.id) return;
    await db.activities.update(a.id, { status: 'archived' });
    void import('../../engine/activitySync').then(({ updateActivityInCloud }) =>
      updateActivityInCloud(a.id!, { status: 'archived' })).catch(() => { /* ignore */ });
  };

  const deleteActivity = async (a: Activity) => {
    if (!a.id || !confirm('Supprimer définitivement cet élément ?')) return;
    await db.activities.delete(a.id);
    toast.success('Supprimé');
  };

  if (!open) return null;

  return (
    <aside className="fixed top-0 right-0 bottom-0 z-40 w-[380px] max-w-[100vw] bg-surface dark:bg-primary-900 border-l border-primary-200 dark:border-primary-800 shadow-2xl flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary-200 dark:border-primary-800">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold">Suivi & Validation</p>
          <p className="text-sm font-bold mt-0.5">{counts.total} en cours</p>
        </div>
        <button onClick={close} className="btn-ghost !p-1.5" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs filtre */}
      <div className="grid grid-cols-5 gap-0.5 p-2 border-b border-primary-200 dark:border-primary-800">
        {(['all', 'annotation', 'comment', 'correction', 'validation'] as Filter[]).map((f) => {
          const count = f === 'all' ? counts.total : counts[f as ActivityKind];
          const Icon = f === 'all' ? Filter : KIND_ICONS[f as ActivityKind];
          return (
            <button
              key={f}
              onClick={() => setFilterPersist(f)}
              className={clsx(
                'flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px] font-semibold transition-all',
                filter === f ? 'bg-primary-200 dark:bg-primary-800 text-primary-900 dark:text-primary-50' : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800/50',
              )}
              title={f === 'all' ? 'Tout' : KIND_LABELS[f as ActivityKind]}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toggles : scope + show resolved */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-primary-200 dark:border-primary-800 text-[11px]">
        <button onClick={() => setScope(scope === 'all' ? 'current' : 'all')} className={clsx('px-2 py-0.5 rounded-full font-semibold', scope === 'current' ? 'bg-accent/10 text-accent' : 'text-primary-500 hover:text-primary-900')}>
          {scope === 'current' ? '📍 Cette page' : '🌐 Tout l\'app'}
        </button>
        <button onClick={() => setShowResolved(!showResolved)} className={clsx('px-2 py-0.5 rounded-full font-semibold', showResolved ? 'bg-success/10 text-success' : 'text-primary-500 hover:text-primary-900')}>
          {showResolved ? '✓ Avec résolus' : '○ Ouverts uniquement'}
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-primary-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Aucune activité</p>
            <p className="text-[10px] mt-1 opacity-80">Ajoutez un commentaire ci-dessous pour commencer.</p>
          </div>
        ) : (
          filtered.map((a: Activity) => {
            const Icon = KIND_ICONS[a.kind];
            return (
              <div key={a.id} className={clsx('p-3 rounded-xl border', a.status === 'open' ? 'border-primary-200 dark:border-primary-700' : 'border-primary-100 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/30 opacity-70')}>
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center shrink-0', KIND_COLORS[a.kind])}>
                    <Icon className="w-3 h-3" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">{KIND_LABELS[a.kind].slice(0, -1)}</p>
                    <p className="text-[10px] text-primary-400 truncate" title={a.context}>{a.contextLabel ?? a.context}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {a.status === 'open' && (
                      <button onClick={() => resolveActivity(a)} className="btn-ghost !p-1 text-primary-400 hover:text-success" title="Marquer résolu">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {a.status === 'resolved' && (
                      <button onClick={() => archiveActivity(a)} className="btn-ghost !p-1 text-primary-400 hover:text-primary-600" title="Archiver">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteActivity(a)} className="btn-ghost !p-1 text-primary-400 hover:text-error" title="Supprimer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed mb-2 whitespace-pre-wrap">{a.content}</p>
                <div className="flex items-center justify-between text-[10px] text-primary-400 pt-1.5 border-t border-primary-100/60 dark:border-primary-800/40">
                  <span>{a.author}</span>
                  <span className="num">{new Date(a.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                {a.resolvedAt && (
                  <p className="text-[10px] text-success mt-1">✓ Résolu {new Date(a.resolvedAt).toLocaleDateString('fr-FR')}{a.resolvedBy ? ` par ${a.resolvedBy}` : ''}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add new */}
      <div className="border-t border-primary-200 dark:border-primary-800 p-3 space-y-2">
        <div className="flex items-center gap-1">
          {(['annotation', 'comment', 'correction', 'validation'] as ActivityKind[]).map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <button
                key={k}
                onClick={() => setNewKind(k)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold transition-all',
                  newKind === k ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800',
                )}
                title={KIND_LABELS[k]}
              >
                <Icon className="w-3 h-3" />
                <span className="capitalize">{k}</span>
              </button>
            );
          })}
        </div>
        <textarea
          className="input min-h-[60px] text-xs resize-none"
          placeholder={`Ajouter ${newKind === 'annotation' ? 'une annotation' : newKind === 'comment' ? 'un commentaire' : newKind === 'correction' ? 'une correction' : 'une validation'} sur cette page…`}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addActivity(); }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-primary-400">📍 {location.pathname}</p>
          <button className="btn-primary !py-1.5 !text-xs" onClick={addActivity} disabled={!newContent.trim()}>
            <Send className="w-3 h-3" /> Publier
          </button>
        </div>
      </div>
    </aside>
  );
}
