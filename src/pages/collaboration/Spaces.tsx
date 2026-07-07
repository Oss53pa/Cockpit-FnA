// Espace Collaboratif — Portefeuille des espaces
// « Slack fait parler les gens ; l'Espace Collaboratif fait converger un
//   problème vers zéro. » Kanban par statut, cartes avec ancrage + convergence,
// création guidée : un espace NE PEUT PAS exister sans ancrage métier.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, Clock, CheckCircle2, Anchor, CalendarDays, X } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';
import { dataProvider } from '../../db/provider';
import { useCloudData, invalidateCloudData } from '../../hooks/useCloudData';
import { useApp } from '../../store/app';
import type { Space, SpaceAnchorType, SpaceStatus } from '../../db/schema';
import { ANCHOR_META, STATUS_META, computeConvergenceBp, isOverdue } from '../../engine/spaces';
import {
  ConvergenceBar, StatusPill, SPACES_TAG, fmtDay, fmtXof, getCurrentUser, logSpaceEvent, spaceUid,
} from './spacesShared';

const KANBAN_COLUMNS: SpaceStatus[] = ['ouvert', 'analyse', 'action', 'resolu'];

export default function Spaces() {
  const { currentOrgId } = useApp();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const me = useMemo(() => getCurrentUser(), []);

  const { data: spaces = [] } = useCloudData<Space[]>(
    async () => (currentOrgId ? dataProvider.getSpaces(currentOrgId) : []),
    [currentOrgId],
    { initial: [], tag: SPACES_TAG },
  );

  const active = spaces.filter((s) => !['archive', 'abandonne'].includes(s.status));
  const lateCount = active.filter((s) => s.dueDate && isOverdue({ status: 'todo', dueDate: s.dueDate })).length;
  const resolved90 = spaces.filter((s) => (s.resolvedAt ?? 0) > Date.now() - 90 * 86400000).length;
  const archived = spaces.filter((s) => ['archive', 'abandonne'].includes(s.status));

  return (
    <div>
      <PageHeader
        eyebrow="Espace Collaboratif"
        title="Espaces de résolution"
        subtitle="Chaque espace naît d'un problème ancré au grand livre, converge avec une méthode explicite, et meurt résolu — traçabilité opposable."
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Ouvrir un espace
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={<Target className="w-4 h-4" />} label="En cours" value={String(active.length)} />
        <StatCard icon={<Clock className="w-4 h-4" />} label="En retard" value={String(lateCount)} tone={lateCount > 0 ? 'bad' : 'ok'} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Résolus / 90 j" value={String(resolved90)} tone="ok" />
      </div>

      {spaces.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun espace de résolution"
          description="Un espace naît d'un problème identifié (écart de rapprochement, créance à recouvrer, clôture…), ancré à un objet du grand livre. Pour la gestion de projet libre, utilisez le Plan d'action."
          action={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Ouvrir le premier espace</button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {KANBAN_COLUMNS.map((status) => {
              const list = spaces.filter((s) => s.status === status);
              return (
                <div key={status} className="rounded-2xl bg-primary-100/40 dark:bg-primary-900/30 border border-primary-200/40 dark:border-primary-800/40 p-2">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: STATUS_META[status].color }}>
                      {STATUS_META[status].label}
                    </span>
                    <span className="text-[10px] tabular-nums px-1.5 rounded-full bg-primary-200/60 dark:bg-primary-800/60 text-primary-500">{list.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {list.map((s) => <SpaceCard key={s.id} space={s} onOpen={() => navigate(`/spaces/${s.id}`)} />)}
                    {list.length === 0 && <p className="text-[10px] text-primary-400 italic text-center py-4">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
          {archived.length > 0 && (
            <div className="mt-4 text-[11px] text-primary-400">
              {archived.length} espace(s) archivé(s)/abandonné(s) —{' '}
              {archived.slice(0, 5).map((s) => (
                <button key={s.id} className="underline hover:text-accent mr-2" onClick={() => navigate(`/spaces/${s.id}`)}>{s.title}</button>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && <CreateSpaceModal orgId={currentOrgId} me={me} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); navigate(`/spaces/${id}`); }} />}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone === 'bad' ? 'bg-error/15 text-error' : tone === 'ok' ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent'}`}>{icon}</div>
      <div>
        <p className="num text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-primary-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function SpaceCard({ space, onOpen }: { space: Space; onOpen: () => void }) {
  const late = space.dueDate && !['resolu', 'archive', 'abandonne'].includes(space.status) && isOverdue({ status: 'todo', dueDate: space.dueDate });
  return (
    <button onClick={onOpen} className="w-full text-left card p-3 hover:shadow-md hover:-translate-y-px transition-all">
      <p className="font-semibold text-[12px] leading-snug mb-1.5">{space.title}</p>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-800 text-primary-500 font-semibold inline-flex items-center gap-1">
          <Anchor className="w-2.5 h-2.5" /> {ANCHOR_META[space.anchorType]?.label ?? space.anchorType} · {space.anchorRef}
        </span>
        {space.initialGapXof ? <span className="num text-[9px]" style={{ color: '#C97E12' }}>{fmtXof(space.initialGapXof)}</span> : null}
      </div>
      <ConvergenceBar bp={space.convergenceBp} />
      <div className="flex items-center justify-between mt-2 text-[10px] text-primary-400">
        <span className={late ? 'text-error font-semibold' : ''}>
          <CalendarDays className="w-3 h-3 inline -mt-0.5 mr-0.5" />{fmtDay(space.dueDate)}{late ? ' · retard' : ''}
        </span>
        <span>{space.ownerName ?? space.ownerId}</span>
      </div>
    </button>
  );
}

// ── Assistant de création : l'ancrage est OBLIGATOIRE ───────────────────────
function CreateSpaceModal({ orgId, me, onClose, onCreated }: {
  orgId: string; me: { id: string; name: string };
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [impact, setImpact] = useState('');
  const [anchorType, setAnchorType] = useState<SpaceAnchorType>('account_period');
  const [anchorRef, setAnchorRef] = useState('');
  const [initialGap, setInitialGap] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!title.trim() || !problem.trim()) { toast.error('Titre et énoncé du problème obligatoires'); return; }
    if (!anchorRef.trim()) { toast.error("Ancrage obligatoire : un espace n'existe pas sans objet métier (pour un projet libre, utilisez le Plan d'action)"); return; }
    setSaving(true);
    try {
      const gap = Math.trunc(Math.abs(parseInt(initialGap.replace(/\s/g, ''), 10) || 0));
      const manualCriteria = criteriaText.split('\n').map((l) => l.trim()).filter(Boolean);
      const id = spaceUid();
      const now = Date.now();
      const space: Space = {
        id, orgId, title: title.trim(), status: 'ouvert',
        problemStatement: problem.trim(), problemImpact: impact.trim() || undefined,
        anchorType, anchorRef: anchorRef.trim(),
        initialGapXof: gap > 0 ? gap : undefined,
        ownerId: me.id, ownerName: me.name,
        dueDate: dueDate || undefined,
        convergenceBp: 0,
        createdAt: now,
      };
      await dataProvider.upsertSpace(space);
      // Critères de sortie : le critère CALCULÉ est créé d'office si un écart
      // initial est figé (au moins un critère calculé — règle du CDC).
      if (gap > 0) {
        await dataProvider.upsertSpaceCriterion({
          orgId, spaceId: id, label: 'Écart GL restant = 0', kind: 'computed',
          computeRef: 'gl.gap', satisfied: false, createdAt: now,
        });
      }
      for (const label of manualCriteria) {
        await dataProvider.upsertSpaceCriterion({ orgId, spaceId: id, label, kind: 'manual_check', satisfied: false, createdAt: now });
      }
      if (gap === 0 && manualCriteria.length === 0) {
        await dataProvider.upsertSpaceCriterion({ orgId, spaceId: id, label: 'Problème traité et validé par le responsable', kind: 'manual_check', satisfied: false, createdAt: now });
      }
      await logSpaceEvent(space, 'space_opened', me.name, { anchorType, anchorRef, initialGapXof: gap || undefined });
      await logSpaceEvent(space, 'problem_stated', me.name, { statement: problem.trim(), impact: impact.trim() || undefined });
      invalidateCloudData(SPACES_TAG);
      toast.success('Espace ouvert');
      onCreated(id);
    } catch (e) {
      toast.error(`Création impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface dark:bg-primary-950 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">Ouvrir un espace de résolution</h3>
          <button onClick={onClose} className="text-primary-400 hover:text-primary-900 dark:hover:text-primary-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <Field label="Titre de l'espace *">
            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Écart rapprochement BICICI 521100 — Mars" />
          </Field>
          <Field label="① Problème — constat chiffré *">
            <textarea className="input w-full" rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Ex. 14 120 000 XOF d'écarts non justifiés sur 521100 au 31/03" />
          </Field>
          <Field label="Impact">
            <input className="input w-full" value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Ex. bloque la clôture de mars" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ancrage métier *">
              <select className="input w-full" value={anchorType} onChange={(e) => setAnchorType(e.target.value as SpaceAnchorType)}>
                {Object.entries(ANCHOR_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Référence de l'objet *">
              <input className="input w-full num" value={anchorRef} onChange={(e) => setAnchorRef(e.target.value)} placeholder={ANCHOR_META[anchorType]?.hint.replace('Ex. ', '') ?? ''} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Écart initial (XOF) — figé à l'ouverture">
              <input className="input w-full num" inputMode="numeric" value={initialGap} onChange={(e) => setInitialGap(e.target.value)} placeholder="14120000" />
            </Field>
            <Field label="Échéance">
              <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Critères de sortie manuels (un par ligne)">
            <textarea className="input w-full" rows={2} value={criteriaText} onChange={(e) => setCriteriaText(e.target.value)} placeholder={'Suspens > 90 j justifiés ou décidés\nDossier de preuve archivé'} />
          </Field>
          <p className="text-[10px] text-primary-400 leading-relaxed">
            Si un écart initial est saisi, le critère <strong>calculé</strong> « Écart GL restant = 0 » est créé automatiquement — la convergence sera dérivée du grand livre, jamais saisie.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving} onClick={create}>{saving ? 'Ouverture…' : "Ouvrir l'espace"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-primary-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
