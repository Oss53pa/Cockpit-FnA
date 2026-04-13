import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Clock, Link2, Plus, Target, Trash2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TabSwitch } from '../components/ui/TabSwitch';
import { db, ActionPlan, AttentionPoint } from '../db/schema';
import { useApp } from '../store/app';
import { fmtMoney } from '../lib/format';

type Tab = 'attention' | 'plan';

const SEV_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique' };
const PROB_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Élevée' };
const POINT_STATUS: Record<AttentionPoint['status'], string> = { open: 'Ouvert', in_progress: 'En traitement', resolved: 'Résolu', ignored: 'Ignoré', escalated: 'Escaladé' };
const PLAN_STATUS: Record<ActionPlan['status'], string> = { todo: 'À faire', doing: 'En cours', done: 'Fait', blocked: 'Bloqué', cancelled: 'Annulé' };
const PRIORITY_LABELS = { low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique' };
const CATEGORIES = ['Financier','Comptable','Fiscal','Opérationnel','Commercial','RH','Trésorerie','Budget','Risque','Conformité','Autre'];

export default function Actions() {
  const { currentOrgId } = useApp();
  const [tab, setTab] = useState<Tab>('attention');

  const points = useLiveQuery(() => db.attentionPoints.where('orgId').equals(currentOrgId).reverse().sortBy('detectedAt'), [currentOrgId]) ?? [];
  const plans = useLiveQuery(() => db.actionPlans.where('orgId').equals(currentOrgId).reverse().sortBy('createdAt'), [currentOrgId]) ?? [];

  const pCount = {
    open: points.filter((p) => p.status === 'open').length,
    in_progress: points.filter((p) => p.status === 'in_progress').length,
    resolved: points.filter((p) => p.status === 'resolved').length,
    critical: points.filter((p) => p.severity === 'critical' && p.status !== 'resolved').length,
  };
  const today = new Date().toISOString().substring(0, 10);
  const planCount = {
    todo: plans.filter((p) => p.status === 'todo').length,
    doing: plans.filter((p) => p.status === 'doing').length,
    done: plans.filter((p) => p.status === 'done').length,
    late: plans.filter((p) => p.status !== 'done' && p.status !== 'cancelled' && p.dueDate && p.dueDate < today).length,
  };

  return (
    <div>
      <PageHeader
        title="Plan d'action & Points d'attention"
        subtitle="Détecter · Analyser · Planifier · Suivre · Résoudre"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {tab === 'attention' ? (
          <>
            <StatCard icon={<AlertTriangle className="w-5 h-5 text-primary-500" />} label="Ouverts" value={pCount.open} />
            <StatCard icon={<Clock className="w-5 h-5 text-primary-500" />} label="En traitement" value={pCount.in_progress} />
            <StatCard icon={<CheckCircle2 className="w-5 h-5 text-primary-500" />} label="Résolus" value={pCount.resolved} />
            <StatCard icon={<Zap className="w-5 h-5" />} label="Critiques actifs" value={pCount.critical} />
          </>
        ) : (
          <>
            <StatCard icon={<Target className="w-5 h-5" />} label="À faire" value={planCount.todo} />
            <StatCard icon={<Clock className="w-5 h-5 text-primary-500" />} label="En cours" value={planCount.doing} />
            <StatCard icon={<CheckCircle2 className="w-5 h-5 text-primary-500" />} label="Faits" value={planCount.done} />
            <StatCard icon={<AlertTriangle className="w-5 h-5 text-primary-500" />} label="En retard" value={planCount.late} />
          </>
        )}
      </div>

      <TabSwitch value={tab} onChange={setTab} tabs={[
        { key: 'attention', label: `Points d'attention (${points.length})` },
        { key: 'plan', label: `Plan d'action (${plans.length})` },
      ]} />

      {tab === 'attention' && <PointsView points={points} plans={plans} />}
      {tab === 'plan' && <PlanView plans={plans} points={points} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// POINTS D'ATTENTION
// ═══════════════════════════════════════════════════════════════════
function PointsView({ points, plans }: { points: AttentionPoint[]; plans: ActionPlan[] }) {
  const { currentOrgId } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttentionPoint | null>(null);
  const [filter, setFilter] = useState<'all' | AttentionPoint['status']>('all');
  const [sevFilter, setSevFilter] = useState<'all' | AttentionPoint['severity']>('all');

  const filtered = points.filter((p) =>
    (filter === 'all' || p.status === filter) &&
    (sevFilter === 'all' || p.severity === sevFilter)
  );

  return (
    <Card
      title="Points d'attention"
      subtitle="Problèmes, risques, anomalies identifiés"
      action={<button className="btn-primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4" /> Nouveau point</button>}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex gap-1">
          {(['all', 'open', 'in_progress', 'resolved', 'escalated', 'ignored'] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={clsx('btn !py-1 text-xs',
                filter === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline')}>
              {s === 'all' ? 'Tous statuts' : POINT_STATUS[s as AttentionPoint['status']]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
            <button key={s} onClick={() => setSevFilter(s)}
              className={clsx('btn !py-1 text-xs',
                sevFilter === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline')}>
              {s === 'all' ? 'Toutes sévérités' : SEV_LABELS[s as AttentionPoint['severity']]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon={<AlertTriangle className="w-10 h-10" />} msg="Aucun point" onCreate={() => { setEditing(null); setOpen(true); }} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <PointCard key={p.id} point={p} linkedCount={plans.filter((pl) => pl.attentionPointId === p.id).length}
              onEdit={() => { setEditing(p); setOpen(true); }}
              onDelete={async () => { if (confirm('Supprimer ?')) await db.attentionPoints.delete(p.id!); }}
              onStatusChange={async (s) => await db.attentionPoints.update(p.id!, { status: s, resolvedAt: s === 'resolved' ? Date.now() : undefined })}
            />
          ))}
        </div>
      )}

      <PointModal
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        onSave={async (data) => {
          if (editing?.id) await db.attentionPoints.update(editing.id, data);
          else await db.attentionPoints.add({ ...data, orgId: currentOrgId, detectedAt: Date.now(), status: 'open' } as AttentionPoint);
          setOpen(false);
        }}
      />
    </Card>
  );
}

function PointCard({ point: p, linkedCount, onEdit, onDelete, onStatusChange }: { point: AttentionPoint; linkedCount: number; onEdit: () => void; onDelete: () => void; onStatusChange: (s: AttentionPoint['status']) => void }) {
  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded-lg p-4 hover:border-primary-400 dark:hover:border-primary-600 transition">
      <div className="flex items-start gap-3">
        <AlertTriangle className={clsx('w-4 h-4 mt-1 shrink-0', `text-primary-600`)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-semibold leading-tight">{p.title}</p>
            <div className="flex gap-1 shrink-0">
              <button className="btn-ghost !p-1" onClick={onEdit} title="Modifier">✎</button>
              <button className="btn-ghost !p-1 text-primary-500 hover:text-error" onClick={onDelete} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            <Badge variant={p.severity}>{SEV_LABELS[p.severity]}</Badge>
            <Badge>{p.category}</Badge>
            <Badge variant={p.probability === 'high' ? 'error' : p.probability === 'medium' ? 'warning' : 'default'}>
              Prob : {PROB_LABELS[p.probability]}
            </Badge>
          </div>

          {p.description && <p className="text-xs text-primary-600 dark:text-primary-400 mb-2 whitespace-pre-line line-clamp-3">{p.description}</p>}

          <div className="grid grid-cols-2 gap-1 text-[10px] text-primary-500 mt-2">
            {p.source && <div>📍 <strong>Source</strong> : {p.source}</div>}
            {p.owner && <div>👤 <strong>Responsable</strong> : {p.owner}</div>}
            <div>🕐 <strong>Détecté</strong> : {new Date(p.detectedAt).toLocaleDateString('fr-FR')}</div>
            {p.targetResolutionDate && <div><strong>Cible</strong> : {new Date(p.targetResolutionDate).toLocaleDateString('fr-FR')}</div>}
            {p.estimatedFinancialImpact !== undefined && p.estimatedFinancialImpact > 0 && (
              <div><strong>Impact</strong> : {fmtMoney(p.estimatedFinancialImpact)}</div>
            )}
            {linkedCount > 0 && <div className="text-info col-span-2">🔗 <strong>{linkedCount} action(s) liée(s)</strong></div>}
          </div>

          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-primary-200 dark:border-primary-800">
            <select className="input !py-1 text-xs !w-auto" value={p.status} onChange={(e) => onStatusChange(e.target.value as any)}>
              {Object.entries(POINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PLAN D'ACTION
// ═══════════════════════════════════════════════════════════════════
function PlanView({ plans, points }: { plans: ActionPlan[]; points: AttentionPoint[] }) {
  const { currentOrgId } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActionPlan | null>(null);
  const [filter, setFilter] = useState<'all' | ActionPlan['status']>('all');
  const [prioFilter, setPrioFilter] = useState<'all' | ActionPlan['priority']>('all');

  const today = new Date().toISOString().substring(0, 10);
  const filtered = plans.filter((p) =>
    (filter === 'all' || p.status === filter) &&
    (prioFilter === 'all' || p.priority === prioFilter)
  );
  const isLate = (p: ActionPlan) => p.status !== 'done' && p.status !== 'cancelled' && p.dueDate && p.dueDate < today;

  return (
    <Card
      title="Plan d'action"
      subtitle="Actions à mettre en œuvre — responsable · échéance · avancement · budget"
      action={<button className="btn-primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4" /> Nouvelle action</button>}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex gap-1">
          {(['all', 'todo', 'doing', 'done', 'blocked', 'cancelled'] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={clsx('btn !py-1 text-xs',
                filter === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline')}>
              {s === 'all' ? 'Tous statuts' : PLAN_STATUS[s as ActionPlan['status']]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
            <button key={s} onClick={() => setPrioFilter(s)}
              className={clsx('btn !py-1 text-xs',
                prioFilter === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline')}>
              {s === 'all' ? 'Toutes priorités' : PRIORITY_LABELS[s as ActionPlan['priority']]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon={<Target className="w-10 h-10" />} msg="Aucune action" onCreate={() => { setEditing(null); setOpen(true); }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <PlanCard key={p.id} plan={p} point={points.find((pt) => pt.id === p.attentionPointId)} late={!!isLate(p)}
              onEdit={() => { setEditing(p); setOpen(true); }}
              onDelete={async () => { if (confirm('Supprimer ?')) await db.actionPlans.delete(p.id!); }}
              onStatusChange={async (s) => await db.actionPlans.update(p.id!, { status: s, updatedAt: Date.now(), completedAt: s === 'done' ? Date.now() : undefined })}
              onProgressChange={async (v) => await db.actionPlans.update(p.id!, { progress: v, updatedAt: Date.now() })}
            />
          ))}
        </div>
      )}

      <PlanModal
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        points={points}
        onSave={async (data) => {
          const now = Date.now();
          if (editing?.id) await db.actionPlans.update(editing.id, { ...data, updatedAt: now });
          else await db.actionPlans.add({ ...data, orgId: currentOrgId, createdAt: now, updatedAt: now, progress: data.progress ?? 0 } as ActionPlan);
          setOpen(false);
        }}
      />
    </Card>
  );
}

function PlanCard({ plan: p, point, late, onEdit, onDelete, onStatusChange, onProgressChange }: { plan: ActionPlan; point?: AttentionPoint; late?: boolean; onEdit: () => void; onDelete: () => void; onStatusChange: (s: ActionPlan['status']) => void; onProgressChange: (v: number) => void }) {
  return (
    <div className={clsx('border rounded-lg p-4 transition',
      late ? 'border-error/50 bg-error/5' : 'border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600')}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1">
            <p className="font-semibold">{p.title}</p>
            <Badge variant={p.priority === 'critical' ? 'critical' : p.priority === 'high' ? 'error' : p.priority === 'medium' ? 'warning' : 'default'}>
              {PRIORITY_LABELS[p.priority]}
            </Badge>
            {late && <Badge variant="error">⚠ En retard</Badge>}
          </div>
          {p.description && <p className="text-xs text-primary-600 dark:text-primary-400 whitespace-pre-line">{p.description}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button className="btn-ghost !p-1.5" onClick={onEdit} title="Modifier">✎</button>
          <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error" onClick={onDelete} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Progression */}
      <div className="flex items-center gap-3 mt-3 mb-2">
        <span className="text-[11px] text-primary-500 w-20 shrink-0">Avancement</span>
        <input type="range" min={0} max={100} step={5} value={p.progress ?? 0}
          onChange={(e) => onProgressChange(Number(e.target.value))}
          className="flex-1 accent-primary-900 dark:accent-primary-100" />
        <span className="num text-xs font-bold w-12 text-right">{p.progress ?? 0} %</span>
      </div>

      {/* Infos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-primary-500 mt-3 pt-3 border-t border-primary-200 dark:border-primary-800">
        <div>👤 <strong>Responsable</strong><br/><span className="text-primary-900 dark:text-primary-100">{p.owner}</span></div>
        {p.team && <div><strong>Équipe</strong><br/><span className="text-primary-900 dark:text-primary-100">{p.team}</span></div>}
        {p.sponsor && <div><strong>Sponsor</strong><br/><span className="text-primary-900 dark:text-primary-100">{p.sponsor}</span></div>}
        {p.startDate && <div>▶ <strong>Début</strong><br/><span className="text-primary-900 dark:text-primary-100">{new Date(p.startDate).toLocaleDateString('fr-FR')}</span></div>}
        {p.dueDate && <div><strong>Échéance</strong><br/><span className={clsx(late ? 'text-error font-semibold' : 'text-primary-900 dark:text-primary-100')}>{new Date(p.dueDate).toLocaleDateString('fr-FR')}</span></div>}
        {p.reviewDate && <div><strong>Revue</strong><br/><span className="text-primary-900 dark:text-primary-100">{new Date(p.reviewDate).toLocaleDateString('fr-FR')}</span></div>}
        {p.budgetAllocated !== undefined && p.budgetAllocated > 0 && <div><strong>Budget</strong><br/><span className="text-primary-900 dark:text-primary-100 num">{fmtMoney(p.budgetAllocated)}</span></div>}
        {p.estimatedImpact && <div><strong>Impact</strong><br/><span className="text-primary-900 dark:text-primary-100">{p.estimatedImpact}</span></div>}
      </div>

      {(p.deliverables || p.successCriteria || p.resourcesNeeded || p.dependencies || p.blockers) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-primary-200 dark:border-primary-800">
          {p.deliverables && <InfoBlock label="Livrables" value={p.deliverables} />}
          {p.successCriteria && <InfoBlock label="Critères de succès" value={p.successCriteria} />}
          {p.resourcesNeeded && <InfoBlock label="Ressources" value={p.resourcesNeeded} />}
          {p.dependencies && <InfoBlock label="Dépendances" value={p.dependencies} />}
          {p.blockers && <InfoBlock label="Blocages actuels" value={p.blockers} color="text-error" />}
        </div>
      )}

      {point && (
        <div className="text-[10px] text-info mt-2 flex items-center gap-1">
          <Link2 className="w-3 h-3" /> Point d'attention lié : <strong>{point.title}</strong>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-primary-200 dark:border-primary-800">
        <span className="text-[11px] text-primary-500">Statut :</span>
        <select className="input !py-1 text-xs !w-auto" value={p.status} onChange={(e) => onStatusChange(e.target.value as any)}>
          {Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {p.updatedAt && <span className="text-[10px] text-primary-400 ml-auto">Maj : {new Date(p.updatedAt).toLocaleDateString('fr-FR')}</span>}
      </div>
    </div>
  );
}

function InfoBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-primary-100/50 dark:bg-primary-900/50 rounded p-2">
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className={clsx('whitespace-pre-line mt-0.5', color)}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL POINT D'ATTENTION — COMPLET
// ═══════════════════════════════════════════════════════════════════
function PointModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: AttentionPoint | null; onSave: (p: Partial<AttentionPoint>) => Promise<void> }) {
  const [f, setF] = useState<Partial<AttentionPoint>>(initial ?? {
    severity: 'medium', probability: 'medium', category: 'Financier', status: 'open',
  });

  useEffect(() => {
    setF(initial ?? { severity: 'medium', probability: 'medium', category: 'Financier', status: 'open' });
  }, [initial, open]);

  const save = async () => {
    if (!f.title?.trim()) return;
    await onSave(f);
  };

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Modifier le point d\'attention' : 'Nouveau point d\'attention'}
      size="lg"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={!f.title?.trim()}>Enregistrer</button>
      </>}>
      <div className="space-y-5">
        {/* SECTION 1 : Identification */}
        <Section title="Identification">
          <Txt label="Titre *" v={f.title} on={(v) => setF({ ...f, title: v })} placeholder="Résumer le problème en une phrase" />
          <Area label="Description" v={f.description} on={(v) => setF({ ...f, description: v })} placeholder="Détails, contexte, observations…" />
        </Section>

        {/* SECTION 2 : Qualification */}
        <Section title="Qualification">
          <div className="grid grid-cols-3 gap-3">
            <Sel label="Sévérité" v={f.severity} on={(v) => setF({ ...f, severity: v as any })}
              opts={[['low','Faible'], ['medium','Moyenne'], ['high','Élevée'], ['critical','Critique']]} />
            <Sel label="Probabilité" v={f.probability} on={(v) => setF({ ...f, probability: v as any })}
              opts={[['low','Faible'], ['medium','Moyenne'], ['high','Élevée']]} />
            <Sel label="Catégorie" v={f.category} on={(v) => setF({ ...f, category: v })}
              opts={CATEGORIES.map((c) => [c, c])} />
          </div>
          <Txt label="Source (ratio, compte, section…)" v={f.source} on={(v) => setF({ ...f, source: v })} placeholder="Ex : Ratio DSO, Compte 601, Section Charges d'exploitation" />
        </Section>

        {/* SECTION 3 : Responsabilités & dates */}
        <Section title="Responsabilités et dates">
          <div className="grid grid-cols-2 gap-3">
            <Txt label="Responsable" v={f.owner} on={(v) => setF({ ...f, owner: v })} placeholder="Ex : A. Diallo (DAF)" />
            <Txt label="Détecté par" v={f.detectedBy} on={(v) => setF({ ...f, detectedBy: v })} placeholder="Ex : M. Koné (Contrôleur)" />
            <DateField label="Date cible de résolution" v={f.targetResolutionDate} on={(v) => setF({ ...f, targetResolutionDate: v })} />
            <DateField label="Dernière revue" v={f.lastReviewedAt ? new Date(f.lastReviewedAt).toISOString().substring(0, 10) : undefined}
              on={(v) => setF({ ...f, lastReviewedAt: v ? new Date(v).getTime() : undefined })} />
          </div>
        </Section>

        {/* SECTION 4 : Impact & analyse */}
        <Section title="Impact et analyse">
          <div className="grid grid-cols-2 gap-3">
            <Num label="Impact financier estimé (XOF)" v={f.estimatedFinancialImpact} on={(v) => setF({ ...f, estimatedFinancialImpact: v })} />
            <Txt label="Description de l'impact" v={f.impactDescription} on={(v) => setF({ ...f, impactDescription: v })} placeholder="Ex : Perte de marge de 5%" />
          </div>
          <Area label="Cause racine" v={f.rootCause} on={(v) => setF({ ...f, rootCause: v })} placeholder="Analyse 5 Pourquoi, cause profonde…" />
          <Area label="Recommandation" v={f.recommendation} on={(v) => setF({ ...f, recommendation: v })} placeholder="Ce qu'il faudrait faire…" />
        </Section>

        {/* SECTION 5 : Suivi */}
        <Section title="Suivi et statut">
          <Sel label="Statut" v={f.status} on={(v) => setF({ ...f, status: v as any })}
            opts={[['open','Ouvert'], ['in_progress','En traitement'], ['resolved','Résolu'], ['escalated','Escaladé'], ['ignored','Ignoré']]} />
          <Area label="Journal / commentaires" v={f.journal} on={(v) => setF({ ...f, journal: v })}
            placeholder="Historique des actions, échanges, décisions. Une ligne par entrée datée."
            rows={4} />
          {f.status === 'resolved' && (
            <Area label="Note de résolution" v={f.resolvedNote} on={(v) => setF({ ...f, resolvedNote: v })} placeholder="Comment le point a été résolu" />
          )}
        </Section>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL PLAN D'ACTION — COMPLET
// ═══════════════════════════════════════════════════════════════════
function PlanModal({ open, onClose, initial, points, onSave }: { open: boolean; onClose: () => void; initial: ActionPlan | null; points: AttentionPoint[]; onSave: (p: Partial<ActionPlan>) => Promise<void> }) {
  const [f, setF] = useState<Partial<ActionPlan>>(initial ?? {
    priority: 'medium', status: 'todo', progress: 0,
  });

  useEffect(() => {
    setF(initial ?? { priority: 'medium', status: 'todo', progress: 0 });
  }, [initial, open]);

  const save = async () => {
    if (!f.title?.trim() || !f.owner?.trim()) return;
    await onSave(f);
  };

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Modifier l\'action' : 'Nouvelle action'}
      size="lg"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={!f.title?.trim() || !f.owner?.trim()}>Enregistrer</button>
      </>}>
      <div className="space-y-5">
        <Section title="Action">
          <Txt label="Titre *" v={f.title} on={(v) => setF({ ...f, title: v })} placeholder="Ex : Lancer une campagne de relance clients" />
          <Area label="Description détaillée" v={f.description} on={(v) => setF({ ...f, description: v })} placeholder="Décrivez ce qui doit être fait, les étapes, la méthode…" />
          <div>
            <label className="text-xs font-medium text-primary-500 block mb-1">Lié à un point d'attention</label>
            <select className="input" value={f.attentionPointId ?? ''} onChange={(e) => setF({ ...f, attentionPointId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">— Aucun —</option>
              {points.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </Section>

        <Section title="Responsabilités">
          <div className="grid grid-cols-3 gap-3">
            <Txt label="Responsable *" v={f.owner} on={(v) => setF({ ...f, owner: v })} placeholder="Ex : A. Diallo" />
            <Txt label="Équipe" v={f.team} on={(v) => setF({ ...f, team: v })} placeholder="Ex : Finance, Comptabilité" />
            <Txt label="Sponsor" v={f.sponsor} on={(v) => setF({ ...f, sponsor: v })} placeholder="Ex : Direction générale" />
          </div>
        </Section>

        <Section title="Planification">
          <div className="grid grid-cols-3 gap-3">
            <DateField label="Date de début" v={f.startDate} on={(v) => setF({ ...f, startDate: v })} />
            <DateField label="Date d'échéance" v={f.dueDate} on={(v) => setF({ ...f, dueDate: v })} />
            <DateField label="Date de revue" v={f.reviewDate} on={(v) => setF({ ...f, reviewDate: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Sel label="Priorité" v={f.priority} on={(v) => setF({ ...f, priority: v as any })}
              opts={[['low','Basse'], ['medium','Moyenne'], ['high','Haute'], ['critical','Critique']]} />
            <Sel label="Statut" v={f.status} on={(v) => setF({ ...f, status: v as any })}
              opts={[['todo','À faire'], ['doing','En cours'], ['done','Fait'], ['blocked','Bloqué'], ['cancelled','Annulé']]} />
            <div>
              <label className="text-xs font-medium text-primary-500 block mb-1">Avancement</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={f.progress ?? 0}
                  onChange={(e) => setF({ ...f, progress: Number(e.target.value) })}
                  className="flex-1 accent-primary-900 dark:accent-primary-100" />
                <span className="num text-xs font-bold w-10 text-right">{f.progress ?? 0} %</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Ressources">
          <div className="grid grid-cols-2 gap-3">
            <Num label="Budget alloué (XOF)" v={f.budgetAllocated} on={(v) => setF({ ...f, budgetAllocated: v })} />
            <Txt label="Impact estimé" v={f.estimatedImpact} on={(v) => setF({ ...f, estimatedImpact: v })} placeholder="Ex : +5 M XOF trésorerie" />
          </div>
          <Area label="Ressources nécessaires" v={f.resourcesNeeded} on={(v) => setF({ ...f, resourcesNeeded: v })} placeholder="Humaines, matérielles, financières, partenaires…" />
        </Section>

        <Section title="Livrables & succès">
          <Area label="Livrables attendus" v={f.deliverables} on={(v) => setF({ ...f, deliverables: v })} placeholder="Ex : Rapport final, dashboard, procédure écrite…" />
          <Area label="Critères de succès / KPIs" v={f.successCriteria} on={(v) => setF({ ...f, successCriteria: v })} placeholder="Ex : DSO réduit à 45 jours, taux recouvrement ≥ 90%" />
        </Section>

        <Section title="Risques et dépendances">
          <Area label="Dépendances (actions préalables)" v={f.dependencies} on={(v) => setF({ ...f, dependencies: v })} placeholder="Ex : Après approbation du budget" />
          <Area label="Blocages actuels" v={f.blockers} on={(v) => setF({ ...f, blockers: v })} placeholder="Ex : Attente validation DG" />
        </Section>

        <Section title="Suivi">
          <Area label="Journal d'avancement" v={f.journal} on={(v) => setF({ ...f, journal: v })}
            placeholder="Historique des actions, échanges, décisions. Une ligne par entrée datée."
            rows={4} />
        </Section>
      </div>
    </Modal>
  );
}

// ─── COMPOSANTS UTILITAIRES ─────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold border-b border-primary-200 dark:border-primary-800 pb-1">{title}</p>
      {children}
    </div>
  );
}
function Txt({ label, v, on, placeholder }: { label: string; v?: string; on: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-primary-500 block mb-1">{label}</label>
      <input className="input" value={v ?? ''} onChange={(e) => on(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Area({ label, v, on, placeholder, rows = 3 }: { label: string; v?: string; on: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className="text-xs font-medium text-primary-500 block mb-1">{label}</label>
      <textarea className="input resize-y" rows={rows} value={v ?? ''} onChange={(e) => on(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Sel({ label, v, on, opts }: { label: string; v?: string; on: (v: string) => void; opts: [string, string][] }) {
  return (
    <div>
      <label className="text-xs font-medium text-primary-500 block mb-1">{label}</label>
      <select className="input" value={v ?? ''} onChange={(e) => on(e.target.value)}>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}
function DateField({ label, v, on }: { label: string; v?: string; on: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-primary-500 block mb-1">{label}</label>
      <input type="date" className="input" value={v ?? ''} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
function Num({ label, v, on }: { label: string; v?: number; on: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-primary-500 block mb-1">{label}</label>
      <input type="number" className="input num" value={v ?? ''} onChange={(e) => on(Number(e.target.value) || 0)} />
    </div>
  );
}
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-200 dark:bg-primary-800 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
          <p className="num text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}
function Empty({ icon, msg, onCreate }: { icon: React.ReactNode; msg: string; onCreate: () => void }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto text-primary-400 mb-3">{icon}</div>
      <p className="text-sm text-primary-500">{msg}</p>
      <button className="btn-primary mt-4" onClick={onCreate}><Plus className="w-4 h-4" /> Créer</button>
    </div>
  );
}
