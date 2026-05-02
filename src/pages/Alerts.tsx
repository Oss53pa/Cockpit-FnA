import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings2, LayoutGrid, Rows3, LayoutDashboard } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useBalance, useRatios } from '../hooks/useFinancials';
import { useApp } from '../store/app';

type ViewMode = 'list' | 'cards' | 'table' | 'kanban';
const VIEW_KEY = 'alerts-view-mode';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Alert = { id: string; sev: Severity; title: string; msg: string; category: string };

// Multi-tenant : seuils + acks scopés par société. Sans orgId, fallback global
// (mode démo). Empêche le mélange entre sociétés.
const THRESHOLDS_KEY = 'alert-thresholds';
const ACK_KEY = 'alert-ack';
const keyOrg = (base: string, orgId: string) => orgId ? `${base}:${orgId}` : base;

type Thresholds = {
  liquiditeGenerale: number;
  endettement: number;
  autonomie: number;
  dsoMax: number;
  tresoMin: number;
};
const defaults: Thresholds = { liquiditeGenerale: 1.5, endettement: 1.0, autonomie: 0.5, dsoMax: 60, tresoMin: 0 };

function loadAck(orgId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(keyOrg(ACK_KEY, orgId)) ?? '[]')); } catch { return new Set(); }
}
function saveAck(s: Set<string>, orgId: string) { localStorage.setItem(keyOrg(ACK_KEY, orgId), JSON.stringify([...s])); }
function loadThresholds(orgId: string): Thresholds {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(keyOrg(THRESHOLDS_KEY, orgId)) ?? '{}') }; } catch { return defaults; }
}

export default function Alerts() {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const balance = useBalance();
  const ratios = useRatios();
  const [ack, setAck] = useState<Set<string>>(() => loadAck(currentOrgId));
  const [openSettings, setOpenSettings] = useState(false);
  const [th, setTh] = useState<Thresholds>(() => loadThresholds(currentOrgId));

  // Recharger ack + thresholds quand on change de société (multi-tenant)
  useEffect(() => {
    setAck(loadAck(currentOrgId));
    setTh(loadThresholds(currentOrgId));
  }, [currentOrgId]);
  const [view, setView] = useState<ViewMode>(() => {
    const v = localStorage.getItem(VIEW_KEY);
    return (v === 'cards' || v === 'table' || v === 'kanban' || v === 'list') ? v : 'cards';
  });
  const setViewMode = (v: ViewMode) => { setView(v); localStorage.setItem(VIEW_KEY, v); };

  useEffect(() => saveAck(ack, currentOrgId), [ack, currentOrgId]);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    balance.forEach((r) => {
      if (r.account.startsWith('6') && r.soldeC > 1000) {
        out.push({ id: `abn-c-${r.account}`, sev: 'high', title: `Solde anormal — compte ${r.account}`,
          msg: `Compte de charge en solde créditeur de ${new Intl.NumberFormat('fr-FR').format(r.soldeC)} XOF`, category: 'Comptable' });
      }
      if (r.account.startsWith('7') && r.soldeD > 1000) {
        out.push({ id: `abn-p-${r.account}`, sev: 'medium', title: `Solde anormal — compte ${r.account}`,
          msg: `Compte de produit en solde débiteur de ${new Intl.NumberFormat('fr-FR').format(r.soldeD)} XOF`, category: 'Comptable' });
      }
    });
    ratios.forEach((r) => {
      if (r.status === 'alert') {
        out.push({ id: `rat-${r.code}`, sev: r.family === 'Liquidité' ? 'critical' : 'high',
          title: `Ratio sous le seuil — ${r.label}`,
          msg: `${r.label} à ${r.value.toFixed(2)} ${r.unit} (cible ${r.target} ${r.unit})`, category: r.family });
      } else if (r.status === 'warn') {
        out.push({ id: `rat-${r.code}`, sev: 'medium',
          title: `Ratio en zone de vigilance — ${r.label}`,
          msg: `${r.label} à ${r.value.toFixed(2)} ${r.unit}, cible ${r.target}`, category: r.family });
      }
    });
    return out.filter((a) => !ack.has(a.id));
  }, [balance, ratios, ack]);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  alerts.forEach((a) => counts[a.sev]++);

  const handleAck = (id: string) => setAck(new Set([...ack, id]));
  const resetAck = () => { setAck(new Set()); };

  const saveThresholds = () => {
    localStorage.setItem(keyOrg(THRESHOLDS_KEY, currentOrgId), JSON.stringify(th));
    setOpenSettings(false);
  };

  return (
    <div>
      <PageHeader
        title="Alertes & notifications"
        subtitle={`${alerts.length} alerte(s) active(s) · ${ack.size} traitée(s)`}
        action={<div className="flex items-center gap-2">
          <ViewSwitcher view={view} onChange={setViewMode} />
          {ack.size > 0 && <button className="btn-outline" onClick={resetAck}>Réinitialiser traitées</button>}
          <button className="btn-outline" onClick={() => setOpenSettings(true)}>
            <Settings2 className="w-4 h-4" /> Configurer les seuils
          </button>
        </div>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
          <Card key={sev}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 text-primary-600`} />
              <div>
                <p className="text-xs text-primary-500 capitalize">{sev}</p>
                <p className="num text-2xl font-bold">{counts[sev]}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {alerts.length === 0 ? (
        <Card title="Alertes actives">
          <div className="py-12 text-center text-primary-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-primary-500" />
            <p className="text-success font-medium">Aucune alerte active</p>
            <p className="text-xs mt-1">Les contrôles n'ont détecté aucune anomalie non traitée</p>
          </div>
        </Card>
      ) : view === 'list' ? (
        <Card title={`Alertes actives (${alerts.length})`}>
          <ul className="divide-y divide-primary-200 dark:divide-primary-800 -my-2">
            {alerts.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 text-primary-600`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{a.title}</p>
                    <Badge variant={a.sev}>{a.sev}</Badge>
                    <Badge>{a.category}</Badge>
                  </div>
                  <p className="text-xs text-primary-500 mt-0.5">{a.msg}</p>
                </div>
                <button className="btn-outline !py-1 text-xs" onClick={() => handleAck(a.id)}>
                  <CheckCircle2 className="w-3 h-3" /> Traiter
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : view === 'cards' ? (
        <CardsView alerts={alerts} onAck={handleAck} />
      ) : view === 'table' ? (
        <TableView alerts={alerts} onAck={handleAck} />
      ) : (
        <KanbanView alerts={alerts} onAck={handleAck} />
      )}

      <Modal
        open={openSettings}
        onClose={() => setOpenSettings(false)}
        title="Seuils d'alerte"
        subtitle="Définir les seuils au-delà / en-deçà desquels une alerte est levée"
        footer={<>
          <button className="btn-outline" onClick={() => setTh(defaults)}>Valeurs par défaut</button>
          <button className="btn-outline" onClick={() => setOpenSettings(false)}>Annuler</button>
          <button className="btn-primary" onClick={saveThresholds}>Enregistrer</button>
        </>}
      >
        <div className="space-y-4">
          <Num label="Liquidité générale (minimum)" value={th.liquiditeGenerale} step={0.1} onChange={(v) => setTh({ ...th, liquiditeGenerale: v })} hint="Actif circulant / Passif circulant — standard : 1,5" />
          <Num label="Endettement (maximum)" value={th.endettement} step={0.1} onChange={(v) => setTh({ ...th, endettement: v })} hint="Dettes fin. / Capitaux propres — standard : ≤ 1,0" />
          <Num label="Autonomie financière (minimum)" value={th.autonomie} step={0.05} onChange={(v) => setTh({ ...th, autonomie: v })} hint="Capitaux propres / Total Passif — standard : ≥ 0,5" />
          <Num label="DSO maximum (jours)" value={th.dsoMax} step={5} onChange={(v) => setTh({ ...th, dsoMax: v })} hint="Délai moyen clients — standard OHADA : 60 jours" />
          <Num label="Trésorerie minimum (XOF)" value={th.tresoMin} step={1_000_000} onChange={(v) => setTh({ ...th, tresoMin: v })} hint="Seuil plancher en-dessous duquel une alerte critique est levée" />
        </div>
      </Modal>
    </div>
  );
}

function Num({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (v: number) => void; step: number; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <input type="number" step={step} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-[10px] text-primary-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// View Switcher (Liste / Cartes / Table / Kanban)
// ─────────────────────────────────────────────────────────────────────
function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const buttons: { v: ViewMode; icon: any; label: string }[] = [
    { v: 'cards', icon: LayoutGrid, label: 'Cartes' },
    { v: 'table', icon: Rows3, label: 'Table' },
    { v: 'kanban', icon: LayoutDashboard, label: 'Kanban' },
    { v: 'list', icon: AlertTriangle, label: 'Liste' },
  ];
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-primary-200/40 dark:bg-primary-800/40">
      {buttons.map((b) => {
        const active = view === b.v;
        return (
          <button
            key={b.v}
            type="button"
            onClick={() => onChange(b.v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all',
              active ? 'bg-surface text-primary-900 shadow-sm dark:bg-primary-100 dark:text-primary-900'
                     : 'text-primary-500 hover:text-primary-900 dark:hover:text-primary-100',
            )}
            aria-pressed={active}
            title={`Vue ${b.label}`}
          >
            <b.icon className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Vue Cartes ──────────────────────────────────────────────────────
function CardsView({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string) => void }) {
  const sevColors: Record<Severity, string> = {
    critical: 'border-l-error bg-error/5',
    high:     'border-l-warning bg-warning/5',
    medium:   'border-l-primary-400 bg-primary-100/50 dark:bg-primary-800/30',
    low:      'border-l-primary-300 bg-transparent',
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {alerts.map((a) => (
        <div key={a.id} className={clsx('card border-l-4 p-4', sevColors[a.sev])}>
          <div className="flex items-start justify-between mb-2 gap-2">
            <Badge variant={a.sev}>{a.sev}</Badge>
            <Badge>{a.category}</Badge>
          </div>
          <p className="font-semibold text-sm leading-snug mb-1">{a.title}</p>
          <p className="text-xs text-primary-500 mb-3 leading-relaxed">{a.msg}</p>
          <button className="btn-outline w-full !py-1.5 text-xs" onClick={() => onAck(a.id)}>
            <CheckCircle2 className="w-3 h-3" /> Traiter
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Vue Table ───────────────────────────────────────────────────────
function TableView({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-100/60 dark:bg-primary-800/60 text-primary-600 dark:text-primary-300 text-[11px] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-semibold w-24">Sévérité</th>
              <th className="text-left py-2.5 px-4 font-semibold w-32">Catégorie</th>
              <th className="text-left py-2.5 px-4 font-semibold">Titre</th>
              <th className="text-left py-2.5 px-4 font-semibold">Description</th>
              <th className="py-2.5 px-4 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={a.id} className={clsx(i !== alerts.length - 1 && 'border-b border-primary-200/60 dark:border-primary-800', 'hover:bg-primary-100/40 dark:hover:bg-primary-900/40')}>
                <td className="py-2 px-4"><Badge variant={a.sev}>{a.sev}</Badge></td>
                <td className="py-2 px-4"><Badge>{a.category}</Badge></td>
                <td className="py-2 px-4 font-medium">{a.title}</td>
                <td className="py-2 px-4 text-xs text-primary-500">{a.msg}</td>
                <td className="py-2 px-4">
                  <button className="btn-outline !py-1 !px-2 text-xs" onClick={() => onAck(a.id)} title="Traiter">
                    <CheckCircle2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vue Kanban (colonnes par sévérité) ──────────────────────────────
function KanbanView({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string) => void }) {
  const COLUMNS: { sev: Severity; label: string; color: string }[] = [
    { sev: 'critical', label: 'Critique', color: 'border-error bg-error/5' },
    { sev: 'high',     label: 'Élevée',   color: 'border-warning bg-warning/5' },
    { sev: 'medium',   label: 'Moyenne',  color: 'border-primary-400 bg-primary-100/50 dark:bg-primary-800/30' },
    { sev: 'low',      label: 'Faible',   color: 'border-primary-300 bg-transparent' },
  ];
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = alerts.filter((a) => a.sev === col.sev);
        return (
          <div key={col.sev} className="shrink-0 w-[300px] flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-200">
                {col.label}
              </h3>
              <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-primary-200/60 dark:bg-primary-800/60 text-primary-600 dark:text-primary-300">
                {items.length}
              </span>
            </div>
            <div className={clsx('flex flex-col gap-2 p-2 rounded-2xl min-h-[200px] flex-1 border-2', col.color)}>
              {items.length === 0 ? (
                <p className="text-[10px] text-primary-400 italic text-center py-4">Aucune alerte</p>
              ) : items.map((a) => (
                <div key={a.id} className="card p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge>{a.category}</Badge>
                  </div>
                  <p className="font-semibold text-xs leading-snug mb-1">{a.title}</p>
                  <p className="text-[10px] text-primary-500 leading-relaxed mb-2 line-clamp-3">{a.msg}</p>
                  <button className="btn-outline w-full !py-1 text-[10px]" onClick={() => onAck(a.id)}>
                    <CheckCircle2 className="w-3 h-3" /> Traiter
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
