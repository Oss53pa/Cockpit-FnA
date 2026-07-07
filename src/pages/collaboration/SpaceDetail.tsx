// Espace Collaboratif — écran Espace (3 colonnes : Méthode · Fil unifié · Résolution)
// La méthode fait converger : ① Problème ② Solutions ③ Échéances ④ Clôture.
// Fil append-only typé ; convergence recalculée depuis le GL (jamais saisie) ;
// décisions gouvernées par la matrice de seuils ; clôture verrouillée par les critères.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Anchor, Send, RefreshCcw, Lock, Unlock, CalendarDays, Plus, Scale,
} from 'lucide-react';
import { dataProvider } from '../../db/provider';
import { useCloudData, invalidateCloudData } from '../../hooks/useCloudData';
import { useApp } from '../../store/app';
import { toast } from '../../components/ui/Toast';
import { TabSwitch } from '../../components/ui/TabSwitch';
import type { Space, SpaceAction, SpaceCriterion, SpaceDecision, SpaceEvent, SpaceSolution, SpaceStatus } from '../../db/schema';
import {
  ANCHOR_META, DECISION_TYPES, EVENT_META, STATUS_META,
  approvalRuleLabel, canResolve, canTransition, computeConvergenceBp, convergenceFormula,
  isFrozen, isOverdue, nextDecisionRef, nextStatuses, requiredRolesFor,
} from '../../engine/spaces';
import {
  ConvergenceBar, StatusPill, SPACES_TAG, ViaBadge, fmtDay, fmtTs, fmtXof, getCurrentUser, logSpaceEvent,
} from './spacesShared';

export default function SpaceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { currentOrgId, currentYear } = useApp();
  const me = useMemo(() => getCurrentUser(), []);
  const [tab, setTab] = useState<'criteres' | 'actions' | 'decisions'>('criteres');
  const [composer, setComposer] = useState('');

  const { data: space = null } = useCloudData<Space | null>(
    async () => (id ? (await dataProvider.getSpace(id)) ?? null : null),
    [id], { initial: null, tag: SPACES_TAG },
  );
  const { data: criteria = [] } = useCloudData<SpaceCriterion[]>(
    async () => (id ? dataProvider.getSpaceCriteria(id) : []), [id], { initial: [], tag: SPACES_TAG },
  );
  const { data: solutions = [] } = useCloudData<SpaceSolution[]>(
    async () => (id ? dataProvider.getSpaceSolutions(id) : []), [id], { initial: [], tag: SPACES_TAG },
  );
  const { data: actions = [] } = useCloudData<SpaceAction[]>(
    async () => (id ? dataProvider.getSpaceActions(id) : []), [id], { initial: [], tag: SPACES_TAG },
  );
  const { data: events = [] } = useCloudData<SpaceEvent[]>(
    async () => (id ? dataProvider.getSpaceEvents(id) : []), [id], { initial: [], tag: SPACES_TAG },
  );
  const { data: decisions = [] } = useCloudData<SpaceDecision[]>(
    async () => (id ? dataProvider.getSpaceDecisions(id) : []), [id], { initial: [], tag: SPACES_TAG },
  );

  if (!space) {
    return (
      <div className="py-20 text-center text-primary-500">
        Espace introuvable. <Link to="/spaces" className="text-accent underline">Retour au portefeuille</Link>
      </div>
    );
  }

  const frozen = isFrozen(space.status);
  const resolvable = canResolve(criteria);
  const okCount = criteria.filter((c) => c.satisfied).length;

  // ── Convergence : recalcule (critères + GL si ancrage compte×période) ─────
  const recompute = async (nextCriteria?: SpaceCriterion[]) => {
    const crits = nextCriteria ?? criteria;
    let currentGap: number | undefined;
    if (space.anchorType === 'account_period' && (space.initialGapXof ?? 0) > 0) {
      try {
        const { computeBalance } = await import('../../engine/balance');
        const account = space.anchorRef.split('·')[0].trim();
        const bal = await computeBalance({ orgId: space.orgId, year: currentYear, includeOpening: true });
        const row = bal.find((r) => r.account === account);
        currentGap = row ? Math.trunc(Math.abs(row.soldeD - row.soldeC)) : space.initialGapXof;
      } catch { currentGap = undefined; }
    }
    const bp = computeConvergenceBp(space, crits, currentGap);
    // Le critère calculé « gl.gap » suit l'écart réel.
    const glCrit = crits.find((c) => c.kind === 'computed' && c.computeRef === 'gl.gap');
    if (glCrit && currentGap !== undefined) {
      const nowSatisfied = currentGap === 0;
      if (nowSatisfied !== glCrit.satisfied) {
        await dataProvider.upsertSpaceCriterion({ ...glCrit, satisfied: nowSatisfied, satisfiedBy: 'système (GL)', satisfiedAt: nowSatisfied ? Date.now() : undefined });
        await logSpaceEvent(space, nowSatisfied ? 'criterion_satisfied' : 'criterion_reopened', 'système', { label: glCrit.label, gapXof: currentGap }, { actorKind: 'system' });
      }
    }
    if (bp !== space.convergenceBp) {
      await dataProvider.upsertSpace({ ...space, convergenceBp: bp });
    }
    invalidateCloudData(SPACES_TAG);
    return { bp, currentGap };
  };

  // ── Actions du fil / méthode ───────────────────────────────────────────────
  const sendMessage = async () => {
    const content = composer.trim();
    if (!content) return;
    setComposer('');
    await logSpaceEvent(space, 'message', me.name, { content });
  };

  const changeStatus = async (to: SpaceStatus) => {
    if (!canTransition(space.status, to)) return;
    if (to === 'resolu' && !resolvable) { toast.error(`Clôture verrouillée : ${okCount}/${criteria.length} critères satisfaits`); return; }
    let abandonReason: string | undefined;
    if (to === 'abandonne') {
      abandonReason = prompt('Motif d\'abandon (obligatoire, tracé) :')?.trim() || undefined;
      if (!abandonReason) return;
    }
    const patch: Space = {
      ...space, status: to, abandonReason: abandonReason ?? space.abandonReason,
      resolvedAt: to === 'resolu' ? Date.now() : space.resolvedAt,
      archivedAt: to === 'archive' ? Date.now() : space.archivedAt,
    };
    await dataProvider.upsertSpace(patch);
    await logSpaceEvent(space, to === 'resolu' ? 'space_resolved' : to === 'archive' ? 'space_archived' : 'status_changed', me.name, { from: space.status, to, reason: abandonReason });
    if (to === 'archive') {
      // Rapport de clôture (synthèse structurée — les chiffres viennent des données, pas d'un LLM).
      const kept = solutions.find((s) => s.status === 'kept');
      await logSpaceEvent(space, 'proph3t_summary', 'Proph3t', {
        content: `Espace résolu et archivé. Problème : ${space.problemStatement}. Solution retenue : ${kept?.title ?? '—'}. ${solutions.filter((s) => s.status === 'discarded').length} solution(s) écartée(s) avec motif. ${actions.filter((a) => a.status === 'done').length}/${actions.length} actions complétées. ${decisions.filter((d) => d.status === 'approved').length} décision(s) approuvée(s). Convergence finale : ${Math.trunc(space.convergenceBp / 100)} %.`,
      }, { actorKind: 'proph3t' });
    }
    invalidateCloudData(SPACES_TAG);
  };

  const proposeSolution = async () => {
    const title = prompt('Solution proposée (titre) :')?.trim();
    if (!title) return;
    await dataProvider.upsertSpaceSolution({ orgId: space.orgId, spaceId: space.id, title, proposedBy: me.name, status: 'proposed', createdAt: Date.now() });
    await logSpaceEvent(space, 'solution_proposed', me.name, { title });
  };

  const decideSolution = async (s: SpaceSolution, keep: boolean) => {
    let reason: string | undefined;
    if (!keep) {
      reason = prompt('Motif d\'écartement (obligatoire, tracé) :')?.trim() || undefined;
      if (!reason) { toast.error('Une solution ne peut être écartée sans motif tracé'); return; }
    }
    await dataProvider.upsertSpaceSolution({ ...s, status: keep ? 'kept' : 'discarded', statusReason: reason, decidedBy: me.name });
    await logSpaceEvent(space, keep ? 'solution_kept' : 'solution_discarded', me.name, { title: s.title, reason });
  };

  const addAction = async () => {
    const label = prompt('Nouvelle action (libellé) :')?.trim();
    if (!label) return;
    await dataProvider.upsertSpaceAction({ orgId: space.orgId, spaceId: space.id, label, assignee: me.name, status: 'todo', createdAt: Date.now() });
    await logSpaceEvent(space, 'action_created', me.name, { label });
  };

  const toggleAction = async (a: SpaceAction) => {
    if (frozen) return;
    const done = a.status !== 'done';
    await dataProvider.upsertSpaceAction({ ...a, status: done ? 'done' : 'todo', completedAt: done ? Date.now() : undefined, completedBy: done ? me.name : undefined });
    if (done) await logSpaceEvent(space, 'action_completed', me.name, { label: a.label });
    await recompute();
  };

  const toggleCriterion = async (c: SpaceCriterion) => {
    if (frozen) return;
    if (c.kind === 'computed') { toast.info('Critère calculé — utilisez « Recalculer depuis le GL »'); return; }
    const satisfied = !c.satisfied;
    const next = criteria.map((x) => (x.id === c.id ? { ...x, satisfied } : x));
    await dataProvider.upsertSpaceCriterion({ ...c, satisfied, satisfiedBy: satisfied ? me.name : undefined, satisfiedAt: satisfied ? Date.now() : undefined });
    await logSpaceEvent(space, satisfied ? 'criterion_satisfied' : 'criterion_reopened', me.name, { label: c.label });
    await recompute(next);
  };

  const sortedActions = [...actions].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const kept = solutions.find((s) => s.status === 'kept');

  return (
    <div>
      {/* ── En-tête ── */}
      <div className="mb-4">
        <button onClick={() => navigate('/spaces')} className="text-[11px] text-primary-400 hover:text-accent inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> Portefeuille des espaces
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold">{space.title}</h1>
              <StatusPill status={space.status} />
              {frozen && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-200 dark:bg-primary-800 text-primary-500 uppercase tracking-wider">lecture seule</span>}
            </div>
            <p className="text-[11px] text-primary-500 mt-1 inline-flex items-center gap-1">
              <Anchor className="w-3 h-3" /> Ouvert depuis : {ANCHOR_META[space.anchorType]?.label} · <span className="num">{space.anchorRef}</span>
              {space.dueDate && <span className="ml-2 inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Échéance {fmtDay(space.dueDate)}</span>}
            </p>
          </div>
          <div className="w-56">
            <ConvergenceBar bp={space.convergenceBp} showBadge formula={convergenceFormula(space)} />
            {space.initialGapXof ? <p className="num text-[9px] text-primary-400 mt-1 text-right">écart initial figé : {fmtXof(space.initialGapXof)}</p> : null}
          </div>
        </div>
        {!frozen && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {nextStatuses(space.status).map((to) => {
              const locked = to === 'resolu' && !resolvable;
              return (
                <button key={to} onClick={() => changeStatus(to)}
                  className={`btn-outline !py-1 text-[10px] ${locked ? 'opacity-50' : ''} ${to === 'resolu' && resolvable ? '!border-success !text-success' : ''}`}
                  title={locked ? `${okCount}/${criteria.length} critères satisfaits` : ''}>
                  {locked ? <Lock className="w-3 h-3" /> : to === 'resolu' ? <Unlock className="w-3 h-3" /> : null}
                  → {STATUS_META[to].label}{to === 'resolu' ? ` (${okCount}/${criteria.length})` : ''}
                </button>
              );
            })}
            <button className="btn-outline !py-1 text-[10px]" onClick={() => recompute().then((r) => toast.success(`Convergence recalculée : ${Math.trunc(r.bp / 100)} %${r.currentGap !== undefined ? ` · écart GL ${fmtXof(r.currentGap)}` : ''}`))}>
              <RefreshCcw className="w-3 h-3" /> Recalculer depuis le GL
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr_320px] gap-4 items-start">
        {/* ── Colonne MÉTHODE ── */}
        <div className="space-y-3">
          <MethodCard step="①" title="Problème">
            <p className="text-[12px] leading-relaxed">{space.problemStatement}</p>
            {space.problemImpact && <p className="text-[10px] text-primary-400 mt-1">Impact : {space.problemImpact}</p>}
          </MethodCard>
          <MethodCard step="②" title={`Solutions (${solutions.length})`} action={!frozen ? <MiniBtn onClick={proposeSolution}>+ Proposer</MiniBtn> : undefined}>
            {solutions.length === 0 && <p className="text-[10px] text-primary-400 italic">Aucune solution proposée.</p>}
            <div className="space-y-1.5">
              {solutions.map((s) => (
                <div key={s.id} className={`rounded-lg p-2 border ${s.status === 'kept' ? 'border-success/50 bg-success/5' : s.status === 'discarded' ? 'border-primary-200 dark:border-primary-800 opacity-60' : 'border-primary-200 dark:border-primary-800'}`}>
                  <p className="text-[11px] font-medium">{s.status === 'kept' ? '✅ ' : s.status === 'discarded' ? '🚫 ' : '💡 '}{s.title}</p>
                  {s.statusReason && <p className="text-[9px] text-primary-400 mt-0.5">Motif : {s.statusReason}</p>}
                  {s.status === 'proposed' && !frozen && (
                    <div className="flex gap-1 mt-1">
                      <MiniBtn onClick={() => decideSolution(s, true)}>Retenir</MiniBtn>
                      <MiniBtn onClick={() => decideSolution(s, false)}>Écarter</MiniBtn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </MethodCard>
          <MethodCard step="③" title="Échéances">
            {sortedActions.length === 0 && <p className="text-[10px] text-primary-400 italic">Aucune action datée.</p>}
            <div className="space-y-1">
              {sortedActions.filter((a) => a.dueDate).slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`num w-12 shrink-0 ${isOverdue(a) ? 'text-error font-bold' : 'text-primary-400'}`}>{fmtDay(a.dueDate)}</span>
                  <span className={a.status === 'done' ? 'line-through text-primary-400' : ''}>{a.label}</span>
                </div>
              ))}
            </div>
          </MethodCard>
          <MethodCard step="④" title="Résolution & clôture">
            <p className="text-[11px] mb-1.5"><strong className="num">{okCount}/{criteria.length}</strong> critères satisfaits</p>
            <button
              disabled={frozen || space.status === 'resolu' ? space.status !== 'resolu' : !(resolvable && space.status === 'action')}
              onClick={() => changeStatus(space.status === 'resolu' ? 'archive' : 'resolu')}
              className={`w-full btn text-[11px] ${space.status === 'resolu' ? 'btn-primary' : resolvable && space.status === 'action' ? '!bg-success !text-white' : 'btn-outline opacity-50'}`}>
              {space.status === 'resolu' ? '📦 Archiver (rapport de clôture)' : resolvable ? '🏁 Clôturer l\'espace' : `🔒 Clôture verrouillée (${okCount}/${criteria.length})`}
            </button>
            {space.status === 'archive' && <p className="text-[9px] text-primary-400 mt-1.5">Archivé le {space.archivedAt ? fmtTs(space.archivedAt) : '—'} · rapport dans le fil · rétention 10 ans (OHADA)</p>}
          </MethodCard>
        </div>

        {/* ── Colonne FIL UNIFIÉ ── */}
        <div className="card p-0 overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
          <div className="px-4 py-2.5 border-b border-primary-200 dark:border-primary-800 text-[11px] text-primary-500">
            Fil unifié · append-only — {events.length} événement(s)
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5" style={{ maxHeight: 520 }}>
            {events.map((e) => <EventRow key={`${e.id}-${e.createdAt}`} event={e} />)}
            {events.length === 0 && <p className="text-[11px] text-primary-400 italic text-center py-8">Le fil est vide.</p>}
          </div>
          {!frozen && (
            <div className="p-3 border-t border-primary-200 dark:border-primary-800 flex gap-2">
              <input
                className="input flex-1 text-sm" placeholder="Message… (le fil est append-only : tout est tracé)"
                value={composer} onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button className="btn-primary !px-3" onClick={sendMessage}><Send className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* ── Colonne RÉSOLUTION ── */}
        <div className="card p-3">
          <TabSwitch
            tabs={[{ key: 'criteres', label: `Critères ${okCount}/${criteria.length}` }, { key: 'actions', label: `Actions (${actions.length})` }, { key: 'decisions', label: `Décisions (${decisions.length})` }]}
            value={tab} onChange={(k) => setTab(k as typeof tab)}
          />
          <div className="mt-3">
            {tab === 'criteres' && (
              <div className="space-y-1.5">
                {criteria.map((c) => (
                  <button key={c.id} onClick={() => toggleCriterion(c)} disabled={frozen}
                    className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                    <span className={`mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 border-2 ${c.satisfied ? 'bg-success border-success' : 'border-primary-300 dark:border-primary-600'}`} />
                    <span className="min-w-0">
                      <span className={`text-[11px] block ${c.satisfied ? 'text-primary-400' : ''}`}>{c.label}</span>
                      <span className="text-[9px] text-primary-400">
                        {c.kind === 'computed' ? '⚙ calculé (GL) — jamais coché à la main' : c.satisfied ? `validé par ${c.satisfiedBy}` : 'contrôle manuel'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {tab === 'actions' && (
              <div className="space-y-1.5">
                {sortedActions.map((a) => (
                  <button key={a.id} onClick={() => toggleAction(a)} disabled={frozen}
                    className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                    <span className={`mt-0.5 w-3.5 h-3.5 rounded shrink-0 border-2 ${a.status === 'done' ? 'bg-success border-success' : 'border-primary-300 dark:border-primary-600'}`} />
                    <span className="min-w-0">
                      <span className={`text-[11px] block ${a.status === 'done' ? 'line-through text-primary-400' : ''}`}>{a.label}{a.isCriticalPath ? ' ⚡' : ''}</span>
                      <span className={`text-[9px] ${isOverdue(a) ? 'text-error font-semibold' : 'text-primary-400'}`}>
                        {a.assignee ?? '—'}{a.dueDate ? ` · ${fmtDay(a.dueDate)}` : ''}{isOverdue(a) ? ' · EN RETARD' : ''}
                      </span>
                    </span>
                  </button>
                ))}
                {!frozen && <button className="btn-outline !py-1 text-[10px] w-full" onClick={addAction}><Plus className="w-3 h-3" /> Ajouter une action</button>}
              </div>
            )}
            {tab === 'decisions' && (
              <DecisionsPanel space={space} decisions={decisions} frozen={frozen} me={me} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sous-composants ─────────────────────────────────────────────────────────
function MethodCard({ step, title, action, children }: { step: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary-500">{step} {title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="text-[9px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-300 hover:bg-accent/20 hover:text-accent font-semibold" onClick={onClick}>{children}</button>;
}

function EventRow({ event }: { event: SpaceEvent }) {
  const meta = EVENT_META[event.eventType] ?? { label: event.eventType, icon: '•', tone: 'neutral' as const };
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const detail =
    event.eventType === 'message' ? String(p.content ?? '') :
    event.eventType === 'proph3t_summary' || event.eventType === 'proph3t_alert' ? String(p.content ?? '') :
    p.title ? String(p.title) + (p.reason ? ` — motif : ${p.reason}` : '') :
    p.label ? String(p.label) + (p.gapXof !== undefined ? ` · écart GL ${fmtXof(Number(p.gapXof))}` : '') :
    p.statement ? String(p.statement) :
    p.to ? `${String(p.from)} → ${String(p.to)}${p.reason ? ` — ${p.reason}` : ''}` :
    p.anchorRef ? `Ancré à ${String(p.anchorRef)}${p.initialGapXof ? ` · écart initial ${fmtXof(Number(p.initialGapXof))}` : ''}` : '';
  const isAi = event.actorKind === 'proph3t';
  return (
    <div className={`flex items-start gap-2.5 ${isAi ? 'rounded-lg bg-accent/5 border border-accent/20 p-2' : ''}`}>
      <span className="text-sm shrink-0 mt-0.5">{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold">{event.actor}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-800 text-primary-500 font-semibold">{meta.label}</span>
          <ViaBadge surface={event.originSurface} />
          <span className="text-[9px] text-primary-400">{fmtTs(event.createdAt)}</span>
        </div>
        {detail && <p className="text-[12px] leading-relaxed mt-0.5 break-words">{detail}</p>}
      </div>
    </div>
  );
}

// ── Décisions : matrice de seuils + approbation par rôle ────────────────────
function DecisionsPanel({ space, decisions, frozen, me }: {
  space: Space; decisions: SpaceDecision[]; frozen: boolean; me: { name: string; role: string };
}) {
  const [showForm, setShowForm] = useState(false);
  const [dType, setDType] = useState('regularisation');
  const [dTitle, setDTitle] = useState('');
  const [dAmount, setDAmount] = useState('');

  const amount = Math.trunc(Math.abs(parseInt(dAmount.replace(/\s/g, ''), 10) || 0));
  const rule = approvalRuleLabel(dType, amount);

  const propose = async () => {
    if (!dTitle.trim()) { toast.error('Titre requis'); return; }
    const all = await dataProvider.getSpaceDecisionsByOrg(space.orgId);
    const ref = nextDecisionRef(new Date().getFullYear(), all.map((d) => d.ref));
    const requiredRoles = requiredRolesFor(dType, amount);
    await dataProvider.upsertSpaceDecision({
      orgId: space.orgId, spaceId: space.id, ref, decisionType: dType, title: dTitle.trim(),
      amountXof: amount || undefined, status: 'proposed', requiredRoles, approvedBy: [], createdAt: Date.now(),
    });
    await logSpaceEvent(space, 'decision_proposed', me.name, { title: dTitle.trim(), ref, amountXof: amount || undefined, requiredRoles });
    setShowForm(false); setDTitle(''); setDAmount('');
    invalidateCloudData(SPACES_TAG);
  };

  const approve = async (d: SpaceDecision) => {
    const myRole = me.role || 'Comptable';
    const pending = d.requiredRoles.filter((r) => !(d.approvedBy ?? []).includes(r));
    // Un admin peut endosser n'importe quel rôle ; sinon le rôle doit correspondre.
    const roleToSign = pending.find((r) => r.toLowerCase() === myRole.toLowerCase()) ?? (myRole === 'admin' ? pending[0] : undefined);
    if (!roleToSign) { toast.error(`Validation ${pending.join(' puis ')} requise — votre rôle (${myRole}) ne correspond pas`); return; }
    const approvedBy = [...(d.approvedBy ?? []), roleToSign];
    const done = d.requiredRoles.every((r) => approvedBy.includes(r));
    await dataProvider.upsertSpaceDecision({ ...d, approvedBy, status: done ? 'approved' : 'proposed' });
    await logSpaceEvent(space, done ? 'decision_approved' : 'decision_proposed', me.name, { ref: d.ref, title: d.title, signedAs: roleToSign, remaining: d.requiredRoles.filter((r) => !approvedBy.includes(r)) });
    invalidateCloudData(SPACES_TAG);
  };

  const reject = async (d: SpaceDecision) => {
    const reason = prompt('Motif de rejet (obligatoire, tracé) :')?.trim();
    if (!reason) return;
    await dataProvider.upsertSpaceDecision({ ...d, status: 'rejected', rejectedBy: me.name, rejectReason: reason });
    await logSpaceEvent(space, 'decision_rejected', me.name, { ref: d.ref, title: d.title, reason });
    invalidateCloudData(SPACES_TAG);
  };

  return (
    <div className="space-y-2">
      {decisions.map((d) => (
        <div key={d.id} className="rounded-lg border border-primary-200 dark:border-primary-800 p-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="num text-[9px] font-bold text-accent">{d.ref}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${d.status === 'approved' ? 'bg-success/15 text-success' : d.status === 'rejected' ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning'}`}>
              {d.status === 'approved' ? 'Approuvée' : d.status === 'rejected' ? 'Rejetée' : 'En attente'}
            </span>
          </div>
          <p className="text-[11px] font-medium mt-1">{d.title}</p>
          <p className="text-[9px] text-primary-400 mt-0.5">
            {d.amountXof ? <span className="num" style={{ color: 'rgb(var(--accent))' }}>{fmtXof(d.amountXof)} · </span> : null}
            <Scale className="w-2.5 h-2.5 inline -mt-0.5" /> {d.requiredRoles.map((r) => `${r}${(d.approvedBy ?? []).includes(r) ? ' ✓' : ''}`).join(' puis ')}
          </p>
          {d.rejectReason && <p className="text-[9px] text-error mt-0.5">Motif : {d.rejectReason}</p>}
          {d.status === 'proposed' && !frozen && (
            <div className="flex gap-1 mt-1.5">
              <MiniBtn onClick={() => approve(d)}>Valider</MiniBtn>
              <MiniBtn onClick={() => reject(d)}>Rejeter</MiniBtn>
            </div>
          )}
        </div>
      ))}
      {decisions.length === 0 && <p className="text-[10px] text-primary-400 italic">Aucune décision. Toute décision est gouvernée par la matrice de seuils FCFA.</p>}
      {!frozen && !showForm && <button className="btn-outline !py-1 text-[10px] w-full" onClick={() => setShowForm(true)}><Plus className="w-3 h-3" /> Proposer une décision</button>}
      {showForm && (
        <div className="rounded-lg border border-accent/40 p-2 space-y-2">
          <select className="input w-full text-[11px]" value={dType} onChange={(e) => setDType(e.target.value)}>
            {DECISION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="input w-full text-[11px]" placeholder="Titre de la décision" value={dTitle} onChange={(e) => setDTitle(e.target.value)} />
          <input className="input w-full text-[11px] num" inputMode="numeric" placeholder="Montant XOF (optionnel)" value={dAmount} onChange={(e) => setDAmount(e.target.value)} />
          <p className="text-[9px] text-primary-500 bg-primary-50 dark:bg-primary-900/40 rounded p-1.5">⚖ Règle appliquée : {rule}</p>
          <div className="flex gap-1.5">
            <button className="btn-primary !py-1 text-[10px] flex-1" onClick={propose}>Proposer</button>
            <button className="btn-outline !py-1 text-[10px]" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
