// Dock « Mes espaces » — §8 du CDC Espace Collaboratif.
// Présent dans TOUS les workspaces FNA : l'intervenant travaille depuis son
// écran habituel, l'espace centralise. Les gestes faits ici portent
// origin_surface = 'fna_workspace' (preuve de bidirectionnalité, badge « via
// workspace » dans le fil). Aucun changement d'écran nécessaire.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, X, CheckSquare, Scale, ArrowUpRight, Send } from 'lucide-react';
import { dataProvider } from '../../db/provider';
import { useCloudData, invalidateCloudData } from '../../hooks/useCloudData';
import { useApp } from '../../store/app';
import type { Space, SpaceAction, SpaceDecision } from '../../db/schema';
import { isOverdue, requiredRolesFor } from '../../engine/spaces';
import { SPACES_TAG, fmtDay, fmtXof, getCurrentUser, logSpaceEvent } from '../../pages/collaboration/spacesShared';

export function SpacesDock() {
  const { currentOrgId } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const me = useMemo(() => getCurrentUser(), []);

  const { data: spaces = [] } = useCloudData<Space[]>(
    async () => (currentOrgId ? dataProvider.getSpaces(currentOrgId) : []),
    [currentOrgId], { initial: [], tag: SPACES_TAG },
  );
  const { data: actions = [] } = useCloudData<SpaceAction[]>(
    async () => (currentOrgId ? dataProvider.getSpaceActionsByOrg(currentOrgId) : []),
    [currentOrgId], { initial: [], tag: SPACES_TAG },
  );
  const { data: decisions = [] } = useCloudData<SpaceDecision[]>(
    async () => (currentOrgId ? dataProvider.getSpaceDecisionsByOrg(currentOrgId) : []),
    [currentOrgId], { initial: [], tag: SPACES_TAG },
  );

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const activeSpaceIds = useMemo(
    () => new Set(spaces.filter((s) => !['archive', 'abandonne'].includes(s.status)).map((s) => s.id)),
    [spaces],
  );
  const myRole = me.role || 'Comptable';

  // Mes actions à faire (assignées à moi, non terminées, espaces actifs).
  const myActions = useMemo(
    () => actions
      .filter((a) => a.status === 'todo' && activeSpaceIds.has(a.spaceId) && (a.assignee ?? '').toLowerCase() === me.name.toLowerCase())
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [actions, activeSpaceIds, me.name],
  );

  // Validations demandées : décisions en attente dont mon rôle est requis et non
  // encore signé (l'admin peut endosser n'importe quel rôle).
  const myValidations = useMemo(
    () => decisions.filter((d) => {
      if (d.status !== 'proposed' || !activeSpaceIds.has(d.spaceId)) return false;
      const pending = d.requiredRoles.filter((r) => !(d.approvedBy ?? []).includes(r));
      return myRole === 'admin' ? pending.length > 0 : pending.some((r) => r.toLowerCase() === myRole.toLowerCase());
    }),
    [decisions, activeSpaceIds, myRole],
  );

  const total = myActions.length + myValidations.length;

  // ── Geste unique : compléter une action DEPUIS le workspace ──────────────
  const completeAction = async (a: SpaceAction) => {
    const space = spaceById.get(a.spaceId);
    if (!space) return;
    await dataProvider.upsertSpaceAction({ ...a, status: 'done', completedAt: Date.now(), completedBy: me.name });
    await logSpaceEvent(space, 'action_completed', me.name, { label: a.label }, { originSurface: 'fna_workspace' });
    invalidateCloudData(SPACES_TAG);
  };

  const approve = async (d: SpaceDecision) => {
    const space = spaceById.get(d.spaceId);
    if (!space) return;
    const pending = d.requiredRoles.filter((r) => !(d.approvedBy ?? []).includes(r));
    const roleToSign = pending.find((r) => r.toLowerCase() === myRole.toLowerCase()) ?? (myRole === 'admin' ? pending[0] : undefined);
    if (!roleToSign) return;
    const approvedBy = [...(d.approvedBy ?? []), roleToSign];
    const done = d.requiredRoles.every((r) => approvedBy.includes(r));
    await dataProvider.upsertSpaceDecision({ ...d, approvedBy, status: done ? 'approved' : 'proposed' });
    await logSpaceEvent(space, done ? 'decision_approved' : 'decision_proposed', me.name,
      { ref: d.ref, title: d.title, signedAs: roleToSign }, { originSurface: 'fna_workspace' });
    invalidateCloudData(SPACES_TAG);
  };

  // ── Réponse contextuelle : message vers le fil, SANS quitter l'écran ─────
  const sendReply = async (spaceId: string) => {
    const content = replyText.trim();
    const space = spaceById.get(spaceId);
    if (!content || !space) return;
    setReplyText(''); setReplyTo(null);
    await logSpaceEvent(space, 'message', me.name, { content }, { originSurface: 'fna_workspace' });
    invalidateCloudData(SPACES_TAG);
  };

  if (!currentOrgId || spaces.length === 0) return null;

  return (
    <>
      {/* Bouton flottant + badge — bottom-left (FloatingAI occupe bottom-right) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 left-5 z-40 w-12 h-12 rounded-full bg-accent shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        title="Mes espaces de résolution"
        aria-label="Mes espaces"
      >
        <Target className="w-5 h-5 text-white" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: 'rgb(var(--accent-2))' }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 left-5 z-40 w-[340px] max-h-[70vh] bg-surface dark:bg-primary-950 rounded-2xl shadow-2xl border border-primary-200 dark:border-primary-800 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-200 dark:border-primary-800" style={{ background: 'rgb(var(--accent))' }}>
            <span className="text-sm font-bold text-white inline-flex items-center gap-2"><Target className="w-4 h-4" /> Mes espaces</span>
            <div className="flex items-center gap-1.5">
              <button className="text-[10px] text-white/80 hover:text-white underline" onClick={() => { setOpen(false); navigate('/spaces'); }}>Portefeuille</button>
              <button className="text-white/80 hover:text-white" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Validations demandées */}
            <Section title="Validations demandées" count={myValidations.length} icon={<Scale className="w-3.5 h-3.5" />}>
              {myValidations.length === 0 ? <Empty /> : myValidations.map((d) => {
                const space = spaceById.get(d.spaceId);
                return (
                  <div key={d.id} className="rounded-lg border border-warning/40 bg-warning/5 p-2">
                    <p className="num text-[9px] font-bold text-accent">{d.ref}</p>
                    <p className="text-[11px] font-medium leading-snug">{d.title}</p>
                    <p className="text-[9px] text-primary-400 mt-0.5 truncate">{space?.title}</p>
                    {d.amountXof ? <p className="num text-[9px]" style={{ color: 'rgb(var(--accent))' }}>{fmtXof(d.amountXof)} · {d.requiredRoles.join(' puis ')}</p> : null}
                    <div className="flex gap-1 mt-1.5">
                      <DockBtn tone="primary" onClick={() => approve(d)}>Valider ici</DockBtn>
                      <DockBtn onClick={() => { setOpen(false); navigate(`/spaces/${d.spaceId}`); }}>Ouvrir <ArrowUpRight className="w-2.5 h-2.5 inline" /></DockBtn>
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* Mes actions */}
            <Section title="Mes actions" count={myActions.length} icon={<CheckSquare className="w-3.5 h-3.5" />}>
              {myActions.length === 0 ? <Empty /> : myActions.map((a) => {
                const space = spaceById.get(a.spaceId);
                const late = isOverdue(a);
                return (
                  <div key={a.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                    <button onClick={() => completeAction(a)} className="mt-0.5 w-3.5 h-3.5 rounded border-2 border-primary-300 dark:border-primary-600 hover:border-success shrink-0" title="Compléter (via workspace)" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-snug">{a.label}</p>
                      <p className={`text-[9px] ${late ? 'text-error font-semibold' : 'text-primary-400'}`}>
                        {space?.title}{a.dueDate ? ` · ${fmtDay(a.dueDate)}` : ''}{late ? ' · EN RETARD' : ''}
                      </p>
                      {replyTo === a.spaceId ? (
                        <div className="flex gap-1 mt-1">
                          <input autoFocus className="input !py-0.5 text-[10px] flex-1" placeholder="Répondre au fil…" value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') sendReply(a.spaceId); if (e.key === 'Escape') { setReplyTo(null); setReplyText(''); } }} />
                          <button className="text-accent" onClick={() => sendReply(a.spaceId)}><Send className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button className="text-[9px] text-accent hover:underline mt-0.5" onClick={() => { setReplyTo(a.spaceId); setReplyText(''); }}>Répondre d'ici</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Section>
          </div>
          <div className="px-3 py-2 border-t border-primary-200 dark:border-primary-800 text-[9px] text-primary-400 text-center">
            Vos gestes ici sont tracés dans le fil avec le badge « via workspace ».
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-primary-500 font-semibold">
        {icon} {title} <span className="tabular-nums text-primary-400">({count})</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Empty() { return <p className="text-[10px] text-primary-400 italic px-1">Rien en attente.</p>; }
function DockBtn({ onClick, tone, children }: { onClick: () => void; tone?: 'primary'; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[9px] px-2 py-0.5 rounded font-semibold ${tone === 'primary' ? 'text-white' : 'bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-300 hover:bg-primary-200'}`}
      style={tone === 'primary' ? { background: 'rgb(var(--accent))' } : undefined}>
      {children}
    </button>
  );
}
