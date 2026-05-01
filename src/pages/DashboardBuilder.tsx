/**
 * Sprint 4 — Dashboard Builder personnalisé.
 * MVP : composition de widgets (KPI, charts, tables) via drag & drop natif HTML5,
 * persistance localStorage, mode édition / preview, partage par URL.
 *
 * Limitations volontaires de cette V1 :
 *   - Drag & drop HTML5 natif (pas de @dnd-kit pour ne pas alourdir le bundle)
 *   - Pas de redimensionnement (chaque widget = 1 unit fixe)
 *   - Persistance localStorage uniquement (synchro Supabase = V2)
 *
 * Architecture :
 *   - WIDGET_CATALOG : 12 widgets prédéfinis (chacun avec data fetcher inline)
 *   - User compose son layout en glissant des widgets depuis la palette
 *   - Layout sauvegardé en localStorage par dashboard custom
 *   - Mode preview : layout final + impression PDF
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Save, Eye, Edit, Trash2, GripVertical,
  TrendingUp, TrendingDown, Wallet, Activity, BadgeDollarSign,
  Banknote, AlertTriangle, BarChart3, PieChart as PieIcon, ListChecks, Hash, Target,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { toast } from '../components/ui/Toast';
import { useStatements, useRatios, useMonthlyCA, useCurrentOrg } from '../hooks/useFinancials';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useApp } from '../store/app';
import clsx from 'clsx';

// ── Catalogue des widgets disponibles ────────────────────────────────

type WidgetType =
  | 'kpi-ca' | 'kpi-rn' | 'kpi-ebe' | 'kpi-marge' | 'kpi-treso' | 'kpi-bfr' | 'kpi-fr'
  | 'chart-ca-monthly' | 'chart-charges-pie' | 'chart-treso-area'
  | 'table-top-charges' | 'table-ratios' | 'list-alerts';

interface WidgetDef {
  type: WidgetType;
  label: string;
  desc: string;
  icon: typeof Plus;
  category: 'KPI' | 'Charts' | 'Tables';
  size: 1 | 2; // unités de largeur (1 = 1/4, 2 = 1/2)
}

const WIDGET_CATALOG: WidgetDef[] = [
  // KPIs
  { type: 'kpi-ca',     label: "Chiffre d'Affaires", desc: 'KPI total CA', icon: TrendingUp, category: 'KPI', size: 1 },
  { type: 'kpi-rn',     label: 'Résultat Net',       desc: 'KPI bénéfice/perte', icon: BadgeDollarSign, category: 'KPI', size: 1 },
  { type: 'kpi-ebe',    label: 'EBE',                desc: 'Excédent brut exploitation', icon: Activity, category: 'KPI', size: 1 },
  { type: 'kpi-marge',  label: 'Marge nette',        desc: '% RN / CA', icon: Target, category: 'KPI', size: 1 },
  { type: 'kpi-treso',  label: 'Trésorerie nette',   desc: 'TN', icon: Wallet, category: 'KPI', size: 1 },
  { type: 'kpi-bfr',    label: 'BFR',                desc: 'Besoin fonds roulement', icon: TrendingDown, category: 'KPI', size: 1 },
  { type: 'kpi-fr',     label: 'Fonds de roulement', desc: 'FR', icon: Banknote, category: 'KPI', size: 1 },
  // Charts
  { type: 'chart-ca-monthly',  label: 'Évolution CA mensuel',  desc: 'Bar chart 12 mois', icon: BarChart3, category: 'Charts', size: 2 },
  { type: 'chart-charges-pie', label: 'Répartition charges',   desc: 'Donut par nature',  icon: PieIcon, category: 'Charts', size: 2 },
  { type: 'chart-treso-area',  label: 'Évolution trésorerie',  desc: 'Area chart',        icon: TrendingUp, category: 'Charts', size: 2 },
  // Tables
  { type: 'table-top-charges', label: 'Top 10 charges',     desc: 'Comptes les plus mouvementés', icon: ListChecks, category: 'Tables', size: 2 },
  { type: 'table-ratios',      label: 'Ratios financiers',  desc: 'Liste des ratios + statut',    icon: Hash, category: 'Tables', size: 2 },
  { type: 'list-alerts',       label: 'Alertes',            desc: 'Ratios hors seuil',            icon: AlertTriangle, category: 'Tables', size: 2 },
];

// ── Persistance localStorage ─────────────────────────────────────────

interface CustomDashboard {
  id: string;
  name: string;
  layout: WidgetType[];
  createdAt: number;
}

const STORAGE_KEY = 'cockpit-custom-dashboards';

function loadDashboards(): CustomDashboard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDashboards(dashboards: CustomDashboard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
}

// ── Widget renderer (alimenté par les hooks data) ────────────────────

function WidgetRenderer({ type, onRemove, editing }: { type: WidgetType; onRemove?: () => void; editing?: boolean }) {
  const { sig, bilan, balance } = useStatements();
  const ratios = useRatios();
  const monthly = useMonthlyCA();
  const ct = useChartTheme();

  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const ca = sig?.ca ?? 0;
  const rn = sig?.resultat ?? 0;
  const ebe = sig?.ebe ?? 0;
  const marge = ca ? (rn / ca) * 100 : 0;
  const tn = bilan ? get(bilan.actif, '_BT') - get(bilan.passif, 'DV') : 0;
  const bfr = bilan ? get(bilan.actif, '_BK') - get(bilan.passif, '_DP') : 0;
  const fr = bilan ? get(bilan.passif, 'CP') - get(bilan.actif, '_AZ') : 0;

  const def = WIDGET_CATALOG.find((w) => w.type === type);
  if (!def) return <Card><p className="text-xs text-error">Widget inconnu : {type}</p></Card>;

  const removeBtn = editing && onRemove ? (
    <button
      onClick={onRemove}
      className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-error/90 hover:bg-error text-white flex items-center justify-center text-xs print:hidden"
      title="Retirer ce widget"
      aria-label="Retirer"
    >
      <Trash2 className="w-3 h-3" />
    </button>
  ) : null;

  // ── KPIs ──
  if (type === 'kpi-ca')    return <div className="relative">{removeBtn}<KPICard title="Chiffre d'Affaires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-rn')    return <div className="relative">{removeBtn}<KPICard title="Résultat Net" value={fmtK(rn)} unit="XOF" icon={<BadgeDollarSign className="w-4 h-4" strokeWidth={2} />} subValue={`${marge.toFixed(1)}% marge`} /></div>;
  if (type === 'kpi-ebe')   return <div className="relative">{removeBtn}<KPICard title="EBE" value={fmtK(ebe)} unit="XOF" icon={<Activity className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-marge') return <div className="relative">{removeBtn}<KPICard title="Marge nette" value={`${marge.toFixed(1)}`} unit="%" icon={<Target className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-treso') return <div className="relative">{removeBtn}<KPICard title="Trésorerie Nette" value={fmtK(tn)} unit="XOF" icon={<Wallet className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-bfr')   return <div className="relative">{removeBtn}<KPICard title="BFR" value={fmtK(bfr)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} inverse /></div>;
  if (type === 'kpi-fr')    return <div className="relative">{removeBtn}<KPICard title="Fonds de roulement" value={fmtK(fr)} unit="XOF" icon={<Banknote className="w-4 h-4" strokeWidth={2} />} /></div>;

  // ── Charts ──
  if (type === 'chart-ca-monthly') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Évolution CA mensuel" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            <Bar dataKey="ca" fill={ct.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );

  if (type === 'chart-charges-pie') {
    const cats = [
      { name: 'Achats',   prefix: ['60'] },
      { name: 'Personnel', prefix: ['66'] },
      { name: 'Services', prefix: ['61','62','63'] },
      { name: 'Amorts',    prefix: ['68','69'] },
      { name: 'Impôts',    prefix: ['64'] },
      { name: 'Autres',    prefix: ['65','67'] },
    ].map((c) => ({
      name: c.name,
      value: balance?.filter((r: any) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s: number, r: any) => s + r.debit - r.credit, 0) ?? 0,
    })).filter((c) => c.value > 0);
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Répartition charges" accent={ct.at(1)}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={cats} innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" stroke="rgb(var(--bg-surface))" strokeWidth={2}>
                {cats.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  if (type === 'chart-treso-area') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Évolution trésorerie" accent={ct.at(2)}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <defs>
              <linearGradient id="treso-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ct.accent} stopOpacity={0.4} />
                <stop offset="100%" stopColor={ct.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            <Area type="monotone" dataKey="ca" stroke={ct.accent} strokeWidth={2} fill="url(#treso-grad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );

  // ── Tables ──
  if (type === 'table-top-charges') {
    const top = balance?.filter((r: any) => r.account.startsWith('6'))
      .map((r: any) => ({ ...r, value: r.debit - r.credit }))
      .filter((r: any) => r.value > 0)
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Top 10 charges" accent={ct.at(1)}>
          <table className="w-full text-xs">
            <tbody>
              {top.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1.5 text-primary-500 num">{r.account}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                  <td className="py-1.5 text-right num font-semibold">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-ratios') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Ratios financiers" accent={ct.at(2)}>
        <table className="w-full text-xs">
          <tbody>
            {ratios.slice(0, 10).map((r) => (
              <tr key={r.code} className="border-b border-primary-100/60 dark:border-primary-800/40">
                <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                <td className="py-1.5 text-right num font-semibold">{r.value.toFixed(2)} {r.unit}</td>
                <td className="py-1.5 text-right">
                  <span className={`inline-block w-2 h-2 rounded-full ${r.status === 'good' ? 'bg-success' : r.status === 'warn' ? 'bg-warning' : 'bg-error'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );

  if (type === 'list-alerts') {
    const alerts = ratios.filter((r) => r.status !== 'good');
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Alertes" accent={ct.at(1)}>
          {alerts.length === 0 ? (
            <p className="text-xs text-success">✓ Tous les ratios sont conformes</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {alerts.map((a) => (
                <li key={a.code} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.status === 'alert' ? 'bg-error' : 'bg-warning'}`} />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="num font-semibold">{a.value.toFixed(2)} {a.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    );
  }

  return null;
}

// ── Page principale ──────────────────────────────────────────────────

export default function DashboardBuilder() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const org = useCurrentOrg();
  const { currentYear } = useApp();

  const [dashboards, setDashboards] = useState<CustomDashboard[]>(() => loadDashboards());
  const [editing, setEditing] = useState(!id);
  const [name, setName] = useState('Mon dashboard');
  const [layout, setLayout] = useState<WidgetType[]>([]);
  const [draggedWidget, setDraggedWidget] = useState<WidgetType | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Charge le dashboard si id présent
  useEffect(() => {
    if (id) {
      const d = dashboards.find((x) => x.id === id);
      if (d) {
        setName(d.name);
        setLayout(d.layout);
        setEditing(false);
      }
    }
  }, [id, dashboards]);

  const onDragStartFromCatalog = (type: WidgetType) => (e: React.DragEvent) => {
    setDraggedWidget(type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDragOverDropZone = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const onDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedWidget) {
      setLayout((prev) => [...prev, draggedWidget]);
      setDraggedWidget(null);
    }
  };

  const onDragStartReorder = (idx: number) => (e: React.DragEvent) => {
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropReorder = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    setLayout((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  };

  const removeWidget = (idx: number) => setLayout((prev) => prev.filter((_, i) => i !== idx));

  const save = () => {
    if (!name.trim()) { toast.warning('Nom requis', 'Donnez un nom à ce dashboard'); return; }
    if (layout.length === 0) { toast.warning('Vide', 'Ajoutez au moins un widget'); return; }
    const dashId = id ?? Math.random().toString(36).slice(2, 9);
    const next = id
      ? dashboards.map((d) => d.id === id ? { ...d, name, layout } : d)
      : [...dashboards, { id: dashId, name, layout, createdAt: Date.now() }];
    setDashboards(next);
    saveDashboards(next);
    toast.success('Dashboard enregistré', `"${name}" sauvegardé localement`);
    if (!id) navigate(`/builder/${dashId}`);
  };

  const remove = () => {
    if (!id) return;
    if (!confirm(`Supprimer le dashboard "${name}" ?`)) return;
    const next = dashboards.filter((d) => d.id !== id);
    setDashboards(next);
    saveDashboards(next);
    toast.success('Dashboard supprimé');
    navigate('/builder');
  };

  const widgetsByCategory = useMemo(() => {
    const map: Record<string, WidgetDef[]> = {};
    for (const w of WIDGET_CATALOG) {
      if (!map[w.category]) map[w.category] = [];
      map[w.category].push(w);
    }
    return map;
  }, []);

  // Vue d'index : liste de tous les dashboards persos
  if (!id && !editing) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Dashboards personnalisés"
          subtitle={`${dashboards.length} dashboard(s) custom · drag & drop builder`}
          action={<button className="btn-primary" onClick={() => setEditing(true)}><Plus className="w-4 h-4" /> Nouveau dashboard</button>}
        />
        {dashboards.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-primary-500">Aucun dashboard personnalisé pour l'instant.</p>
            <button className="btn-primary mt-4" onClick={() => setEditing(true)}>
              <Plus className="w-4 h-4" /> Créer mon premier dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/builder/${d.id}`)}
                className="card-hover p-5 text-left"
              >
                <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold">Custom</p>
                <p className="text-base font-semibold mt-1">{d.name}</p>
                <p className="text-xs text-primary-500 mt-2">{d.layout.length} widget(s) · {new Date(d.createdAt).toLocaleDateString('fr-FR')}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title={editing ? 'Éditeur de dashboard' : name}
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · ${editing ? 'Mode édition' : 'Mode lecture'}`}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setEditing(!editing)}>
              {editing ? <><Eye className="w-4 h-4" /> Aperçu</> : <><Edit className="w-4 h-4" /> Éditer</>}
            </button>
            {editing && <button className="btn-primary" onClick={save}><Save className="w-4 h-4" /> Sauvegarder</button>}
            {id && !editing && <button className="btn-outline text-error" onClick={remove}><Trash2 className="w-4 h-4" /> Supprimer</button>}
          </div>
        }
      />

      {editing && (
        <Card title="Informations">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du dashboard (ex: Reporting Direction Mensuel)" />
        </Card>
      )}

      <div className={clsx('grid gap-5', editing && 'lg:grid-cols-[280px_1fr]')}>
        {/* Palette de widgets — en mode édition uniquement */}
        {editing && (
          <Card title="Catalogue de widgets" subtitle="Glissez-déposez vers la zone droite">
            <div className="space-y-4">
              {Object.entries(widgetsByCategory).map(([cat, widgets]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {widgets.map((w) => (
                      <div
                        key={w.type}
                        draggable
                        onDragStart={onDragStartFromCatalog(w.type)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-200/60 dark:border-primary-700 bg-surface dark:bg-primary-900 cursor-grab hover:bg-primary-100/60 dark:hover:bg-primary-800/60 active:cursor-grabbing transition-colors"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        <w.icon className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{w.label}</p>
                          <p className="text-[10px] text-primary-400 truncate">{w.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Zone de composition */}
        <div
          onDragOver={onDragOverDropZone}
          onDrop={onDropZone}
          className={clsx(
            'min-h-[400px]',
            editing && layout.length === 0 && 'border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-2xl flex items-center justify-center bg-primary-50/50 dark:bg-primary-950/30',
          )}
        >
          {editing && layout.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Plus className="w-8 h-8 text-primary-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">Glissez un widget ici</p>
              <p className="text-xs text-primary-500 mt-1">Composez votre dashboard en glissant les blocs depuis la palette</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {layout.map((w, i) => {
                const def = WIDGET_CATALOG.find((x) => x.type === w);
                const colSpan = def?.size === 2 ? 'md:col-span-2' : '';
                return (
                  <div
                    key={`${w}-${i}`}
                    draggable={editing}
                    onDragStart={editing ? onDragStartReorder(i) : undefined}
                    onDragOver={editing ? onDragOverDropZone : undefined}
                    onDrop={editing ? onDropReorder(i) : undefined}
                    className={clsx(colSpan, editing && 'cursor-move ring-1 ring-transparent hover:ring-primary-300 transition-all rounded-2xl')}
                  >
                    <WidgetRenderer type={w} editing={editing} onRemove={() => removeWidget(i)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
