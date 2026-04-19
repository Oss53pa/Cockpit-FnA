// Comptabilité Analytique — Plan multi-axes, règles de mapping, affectation, dashboard
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, Line, ComposedChart } from 'recharts';
import { Layers, Play, Plus, Settings, Trash2, Wand2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull } from '../lib/format';
import { AnalyticAxis, AnalyticCode, AnalyticRule } from '../db/schema';
import {
  getAxes, saveAxis, deleteAxis,
  getCodes, saveCode, deleteCode,
  getRules, saveRule, deleteRule,
  simulateRules, applyRules, assignManual, clearAutoAssignments,
  computeAnalyticDashboard, computeAnalyticMonthly, getUnmappedLines, getCoverageStats,
  type AnalyticDashRow, type MappingReport,
} from '../engine/analyticalEngine';

type Tab = 'dashboard' | 'axes' | 'codes' | 'rules' | 'assign';

const uid = () => crypto.randomUUID();

export default function Analytical() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  useEffect(() => { getAxes(currentOrgId).then(setAxes); }, [currentOrgId, refresh]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'axes', label: 'Axes analytiques' },
    { key: 'codes', label: 'Codes' },
    { key: 'rules', label: 'Règles de mapping' },
    { key: 'assign', label: 'Affectation' },
  ];

  return (
    <div>
      <PageHeader title="Comptabilité Analytique" subtitle="Plan multi-axes · Règles de mapping · Dashboard de pilotage" />

      <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
              tab === t.key ? 'border-primary-900 dark:border-primary-100' : 'border-transparent text-primary-500 hover:text-primary-900')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab orgId={currentOrgId} year={currentYear} axes={axes} ct={ct} />}
      {tab === 'axes' && <AxesTab orgId={currentOrgId} axes={axes} onUpdate={bump} />}
      {tab === 'codes' && <CodesTab orgId={currentOrgId} axes={axes} onUpdate={bump} />}
      {tab === 'rules' && <RulesTab orgId={currentOrgId} axes={axes} onUpdate={bump} year={currentYear} />}
      {tab === 'assign' && <AssignTab orgId={currentOrgId} axes={axes} year={currentYear} onUpdate={bump} ct={ct} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ orgId, year, axes, ct }: { orgId: string; year: number; axes: AnalyticAxis[]; ct: ReturnType<typeof useChartTheme> }) {
  const [axisNum, setAxisNum] = useState(1);
  const [data, setData] = useState<AnalyticDashRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<{ months: string[]; charges: number[]; produits: number[] } | null>(null);
  const [coverage, setCoverage] = useState<{ total: number; assigned: number; rate: number; byAxis: { axis: number; name: string; rate: number }[] }>({ total: 0, assigned: 0, rate: 0, byAxis: [] });

  useEffect(() => { if (axes.length > 0) setAxisNum(axes[0].number); }, [axes]);
  useEffect(() => { computeAnalyticDashboard(orgId, year, axisNum).then(setData); }, [orgId, year, axisNum]);
  useEffect(() => { getCoverageStats(orgId, year).then(setCoverage); }, [orgId, year]);
  useEffect(() => {
    if (selected) computeAnalyticMonthly(orgId, year, axisNum, selected).then(setMonthly);
    else setMonthly(null);
  }, [selected, orgId, year, axisNum]);

  const totalCharges = data.reduce((s, r) => s + r.charges, 0);
  const totalProduits = data.reduce((s, r) => s + r.produits, 0);
  const totalResultat = totalProduits - totalCharges;
  const pieData = data.filter((r) => r.charges > 0 && r.codeId !== '__unassigned__').map((r, i) => ({ name: r.label, value: r.charges, color: ct.at(i) }));

  if (axes.length === 0) return (
    <Card padded>
      <div className="py-16 text-center">
        <Layers className="w-12 h-12 mx-auto text-primary-300 mb-4" />
        <p className="text-primary-500 text-sm mb-2">Aucun axe analytique configuré.</p>
        <p className="text-primary-400 text-xs">Allez dans l'onglet "Axes analytiques" pour créer votre plan analytique.</p>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="Couverture" value={`${coverage.rate} %`} sub={`${coverage.assigned} / ${coverage.total} lignes`} />
        <KPI label="Charges" value={fmtFull(totalCharges)} />
        <KPI label="Produits" value={fmtFull(totalProduits)} />
        <KPI label="Résultat" value={fmtFull(totalResultat)} highlight={totalResultat >= 0} />
        <KPI label="Sections" value={String(data.filter((r) => r.codeId !== '__unassigned__').length)} />
      </div>

      {/* Sélection axe */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-primary-500 font-semibold uppercase">Axe :</span>
        {axes.filter((a) => a.active).map((a) => (
          <button key={a.number} onClick={() => setAxisNum(a.number)}
            className={clsx('px-3 py-1.5 text-xs rounded-lg transition font-medium', axisNum === a.number ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'bg-primary-100 dark:bg-primary-800 text-primary-600')}>
            Axe {a.number} — {a.name}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Répartition des charges">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.name} (${Math.round((e.value / totalCharges) * 100)}%)`} labelLine={{ stroke: ct.grid }}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtFull(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Charges vs Produits par section">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.filter((r) => r.codeId !== '__unassigned__').slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tickFormatter={fmtFull} tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => fmtFull(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="charges" name="Charges" fill={ct.at(0)} radius={[0, 3, 3, 0]} />
              <Bar dataKey="produits" name="Produits" fill={ct.at(4)} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Couverture par axe */}
      {coverage.byAxis.length > 1 && (
        <ChartCard title="Taux de couverture par axe">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={coverage.byAxis} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v} %`} />
              <Bar dataKey="rate" name="Couverture" fill={ct.at(2)} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Tableau détaillé */}
      <Card title="Détail par section analytique" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-100 dark:bg-primary-900">
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Libellé</th>
                <th className="text-right px-3 py-2">Charges</th>
                <th className="text-right px-3 py-2">Produits</th>
                <th className="text-right px-3 py-2">Résultat</th>
                <th className="text-right px-3 py-2">Budget</th>
                <th className="text-right px-3 py-2">Écart</th>
                <th className="text-right px-3 py-2">%</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.codeId} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50 cursor-pointer" onClick={() => setSelected(r.codeId)}>
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-right num">{fmtFull(r.charges)}</td>
                  <td className="px-3 py-2 text-right num">{fmtFull(r.produits)}</td>
                  <td className={`px-3 py-2 text-right num font-semibold ${r.resultat < 0 ? 'text-error' : ''}`}>{fmtFull(r.resultat)}</td>
                  <td className="px-3 py-2 text-right num">{r.budget > 0 ? fmtFull(r.budget) : '—'}</td>
                  <td className={`px-3 py-2 text-right num ${r.ecart > 0 ? 'text-error' : ''}`}>{r.budget > 0 ? fmtFull(r.ecart) : '—'}</td>
                  <td className="px-3 py-2 text-right num">{r.pctTotal} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Évolution mensuelle */}
      {selected && monthly && (
        <ChartCard title={`Évolution mensuelle — ${data.find((r) => r.codeId === selected)?.label ?? selected}`}>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={monthly.months.map((m, i) => ({ mois: m, charges: monthly.charges[i], produits: monthly.produits[i], resultat: monthly.produits[i] - monthly.charges[i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmtFull(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="charges" name="Charges" fill={ct.at(0)} />
              <Bar dataKey="produits" name="Produits" fill={ct.at(4)} />
              <Line type="monotone" dataKey="resultat" name="Résultat" stroke={ct.at(2)} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AXES
// ══════════════════════════════════════════════════════════════════════════════
function AxesTab({ orgId, axes, onUpdate }: { orgId: string; axes: AnalyticAxis[]; onUpdate: () => void }) {
  const [editing, setEditing] = useState<AnalyticAxis | null>(null);

  const create = () => {
    const next = (axes.length > 0 ? Math.max(...axes.map((a) => a.number)) : 0) + 1;
    if (next > 5) { alert('Maximum 5 axes.'); return; }
    setEditing({ id: uid(), orgId, number: next, name: '', codeName: '', required: false, active: true });
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    await saveAxis(editing);
    setEditing(null);
    onUpdate();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet axe et tous ses codes ?')) return;
    await deleteAxis(id);
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-primary-500">Configurez jusqu'à 5 axes analytiques (Projet, Centre de coût, Ressource, Région…)</p>
        <button className="btn-primary text-sm" onClick={create}><Plus className="w-4 h-4" /> Ajouter un axe</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {axes.map((a) => (
          <Card key={a.id} padded>
            <div className="flex items-center justify-between mb-3">
              <Badge>Axe {a.number}</Badge>
              <div className="flex gap-1">
                <button className="btn-ghost !p-1.5" onClick={() => setEditing(a)}><Settings className="w-4 h-4" /></button>
                <button className="btn-ghost !p-1.5 text-error" onClick={() => remove(a.id)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <p className="font-semibold text-sm">{a.name}</p>
            <p className="text-xs text-primary-500">{a.codeName}</p>
            <div className="flex gap-2 mt-2 text-[10px]">
              {a.required && <Badge variant="warning">Obligatoire</Badge>}
              <Badge variant={a.active ? 'success' : 'default'}>{a.active ? 'Actif' : 'Inactif'}</Badge>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.name ? `Modifier — Axe ${editing.number}` : `Nouvel axe ${editing.number}`}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Nom de l'axe *</label>
              <input className="input" placeholder="Ex : Projet, Centre de coût" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Nom du code</label>
              <input className="input" placeholder="Ex : Code projet" value={editing.codeName} onChange={(e) => setEditing({ ...editing, codeName: e.target.value })} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} /> Obligatoire
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Actif
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button className="btn-outline" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CODES
// ══════════════════════════════════════════════════════════════════════════════
function CodesTab({ orgId, axes, onUpdate }: { orgId: string; axes: AnalyticAxis[]; onUpdate: () => void }) {
  const [axisId, setAxisId] = useState('');
  const [codes, setCodes] = useState<AnalyticCode[]>([]);
  const [editing, setEditing] = useState<AnalyticCode | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { if (axes.length > 0 && !axisId) setAxisId(axes[0].id); }, [axes, axisId]);
  useEffect(() => { if (axisId) getCodes(orgId, axisId).then(setCodes); }, [orgId, axisId]);

  // axes.find((a) => a.id === axisId); — valeur conservée pour extension future

  const filtered = useMemo(() => {
    if (!search) return codes.filter((c) => c.active);
    const q = search.toLowerCase();
    return codes.filter((c) => c.code.toLowerCase().includes(q) || c.shortLabel.toLowerCase().includes(q) || c.longLabel.toLowerCase().includes(q));
  }, [codes, search]);

  const create = () => {
    if (!axisId) return;
    setEditing({ id: uid(), orgId, axisId, code: '', shortLabel: '', longLabel: '', active: true, order: codes.length });
  };

  const save = async () => {
    if (!editing || !editing.code.trim() || !editing.shortLabel.trim()) return;
    await saveCode(editing);
    setEditing(null);
    getCodes(orgId, axisId).then(setCodes);
    onUpdate();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce code analytique ?')) return;
    await deleteCode(id);
    getCodes(orgId, axisId).then(setCodes);
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={axisId} onChange={(e) => setAxisId(e.target.value)}>
          {axes.map((a) => <option key={a.id} value={a.id}>Axe {a.number} — {a.name}</option>)}
        </select>
        <input className="input !w-64" placeholder="Rechercher un code…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <button className="btn-primary text-sm" onClick={create}><Plus className="w-4 h-4" /> Nouveau code</button>
        </div>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-100 dark:bg-primary-900">
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Libellé court</th>
                <th className="text-left px-3 py-2">Libellé long</th>
                <th className="text-center px-3 py-2">Statut</th>
                <th className="text-center px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50">
                  <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
                  <td className="px-3 py-2">{c.shortLabel}</td>
                  <td className="px-3 py-2 text-primary-500">{c.longLabel}</td>
                  <td className="px-3 py-2 text-center"><Badge variant={c.active ? 'success' : 'default'}>{c.active ? 'Actif' : 'Inactif'}</Badge></td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <button className="btn-ghost !p-1" onClick={() => setEditing(c)}><Settings className="w-3.5 h-3.5" /></button>
                      <button className="btn-ghost !p-1 text-error" onClick={() => remove(c.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-primary-400">Aucun code. Cliquez sur "Nouveau code" pour commencer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.code ? 'Modifier le code' : 'Nouveau code analytique'}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Code *</label>
              <input className="input" placeholder="Ex : IB005, P0402" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Libellé court *</label>
              <input className="input" placeholder="Ex : Arcades 5" value={editing.shortLabel} onChange={(e) => setEditing({ ...editing, shortLabel: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Libellé long</label>
              <input className="input" placeholder="Ex : Arcades 5 — Résidence Gorée" value={editing.longLabel} onChange={(e) => setEditing({ ...editing, longLabel: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Code parent (hiérarchie)</label>
              <select className="input" value={editing.parentId ?? ''} onChange={(e) => setEditing({ ...editing, parentId: e.target.value || undefined })}>
                <option value="">— Aucun (racine) —</option>
                {codes.filter((c) => c.id !== editing.id).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.shortLabel}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Actif
            </label>
            <div className="flex gap-2 pt-2">
              <button className="btn-outline" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RÈGLES DE MAPPING
// ══════════════════════════════════════════════════════════════════════════════
function RulesTab({ orgId, axes, onUpdate, year }: { orgId: string; axes: AnalyticAxis[]; onUpdate: () => void; year: number }) {
  const [rules, setRules] = useState<AnalyticRule[]>([]);
  const [codes, setCodes] = useState<AnalyticCode[]>([]);
  const [editing, setEditing] = useState<AnalyticRule | null>(null);
  const [simResult, setSimResult] = useState<MappingReport | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => { getRules(orgId).then(setRules); }, [orgId]);
  useEffect(() => { getCodes(orgId).then(setCodes); }, [orgId]);

  const create = () => setEditing({
    id: uid(), orgId, name: '', priority: rules.length + 1, active: true,
    conditionType: 'label_contains', conditionValue: '', targetAxis: axes[0]?.number ?? 1,
    analyticCodeId: '', createdAt: Date.now(),
  });

  const save = async () => {
    if (!editing || !editing.name.trim() || !editing.conditionValue.trim() || !editing.analyticCodeId) return;
    await saveRule(editing);
    setEditing(null);
    getRules(orgId).then(setRules);
    onUpdate();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette règle ?')) return;
    await deleteRule(id);
    getRules(orgId).then(setRules);
    onUpdate();
  };

  const simulate = async () => {
    const result = await simulateRules(orgId, year);
    setSimResult(result);
  };

  const apply = async () => {
    if (!confirm(`Appliquer ${rules.filter((r) => r.active).length} règle(s) sur les lignes non affectées ?`)) return;
    setApplying(true);
    try {
      const result = await applyRules(orgId, year);
      setSimResult(result);
      alert(`${result.matched} ligne(s) affectée(s). Taux de couverture : ${result.coverageRate}%`);
      onUpdate();
    } finally { setApplying(false); }
  };

  const clearAuto = async () => {
    if (!confirm('Supprimer toutes les affectations automatiques ? Les affectations manuelles seront conservées.')) return;
    const n = await clearAutoAssignments(orgId);
    alert(`${n} affectation(s) supprimée(s).`);
    onUpdate();
  };

  const conditionLabels: Record<string, string> = {
    label_contains: 'Libellé contient', account_range: 'Plage de comptes',
    journal_eq: 'Journal =', amount_between: 'Montant entre', direct_code: 'Code direct',
  };

  const targetCodes = editing ? codes.filter((c) => {
    const axis = axes.find((a) => a.number === editing.targetAxis);
    return axis && c.axisId === axis.id && c.active;
  }) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-primary-500">Les règles sont appliquées par ordre de priorité. La première qui matche affecte la ligne.</p>
        <div className="ml-auto flex gap-2">
          <button className="btn-outline text-sm" onClick={clearAuto}><Trash2 className="w-4 h-4" /> Réinitialiser auto</button>
          <button className="btn-outline text-sm" onClick={simulate}><Wand2 className="w-4 h-4" /> Simuler</button>
          <button className="btn-primary text-sm" disabled={applying} onClick={apply}><Zap className="w-4 h-4" /> {applying ? 'Application…' : 'Appliquer'}</button>
          <button className="btn-primary text-sm" onClick={create}><Plus className="w-4 h-4" /> Nouvelle règle</button>
        </div>
      </div>

      {simResult && (
        <Card padded>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-primary-500">Total lignes</p><p className="num font-bold text-lg">{simResult.totalLines}</p></div>
            <div><p className="text-xs text-primary-500">Affectées</p><p className="num font-bold text-lg text-success">{simResult.matched}</p></div>
            <div><p className="text-xs text-primary-500">Non affectées</p><p className="num font-bold text-lg text-error">{simResult.unmatched}</p></div>
            <div><p className="text-xs text-primary-500">Couverture</p><p className="num font-bold text-lg">{simResult.coverageRate} %</p></div>
          </div>
          {simResult.byRule.length > 0 && (
            <div className="mt-4 text-xs">
              <p className="font-semibold mb-1">Par règle :</p>
              {simResult.byRule.map((r) => <div key={r.ruleId} className="flex justify-between py-0.5">{r.ruleName} <span className="num">{r.count}</span></div>)}
            </div>
          )}
        </Card>
      )}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-100 dark:bg-primary-900">
                <th className="text-center px-2 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Nom</th>
                <th className="text-left px-3 py-2">Condition</th>
                <th className="text-left px-3 py-2">Valeur</th>
                <th className="text-center px-3 py-2">Axe cible</th>
                <th className="text-left px-3 py-2">Code analytique</th>
                <th className="text-center px-3 py-2">Statut</th>
                <th className="text-center px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const code = codes.find((c) => c.id === r.analyticCodeId);
                return (
                  <tr key={r.id} className="border-b border-primary-100 dark:border-primary-800">
                    <td className="text-center px-2 py-2 num font-semibold">{r.priority}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2"><Badge>{conditionLabels[r.conditionType]}</Badge></td>
                    <td className="px-3 py-2 font-mono text-primary-500">{r.conditionValue}</td>
                    <td className="px-3 py-2 text-center">Axe {r.targetAxis}</td>
                    <td className="px-3 py-2 font-mono">{code?.code ?? '?'} — {code?.shortLabel ?? ''}</td>
                    <td className="px-3 py-2 text-center"><Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'On' : 'Off'}</Badge></td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button className="btn-ghost !p-1" onClick={() => setEditing(r)}><Settings className="w-3.5 h-3.5" /></button>
                        <button className="btn-ghost !p-1 text-error" onClick={() => remove(r.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rules.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-primary-400">Aucune règle. Créez des règles pour automatiser l'affectation analytique.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.name ? 'Modifier la règle' : 'Nouvelle règle de mapping'}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">Nom de la règle *</label>
              <input className="input" placeholder="Ex : Charges personnel projet X" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-primary-500 block mb-1">Type de condition</label>
                <select className="input" value={editing.conditionType} onChange={(e) => setEditing({ ...editing, conditionType: e.target.value as any })}>
                  {Object.entries(conditionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-primary-500 block mb-1">Valeur *</label>
                <input className="input" placeholder={editing.conditionType === 'account_range' ? 'Ex : 601000-609999' : editing.conditionType === 'amount_between' ? 'Ex : 1000-50000' : 'Ex : personnel'} value={editing.conditionValue} onChange={(e) => setEditing({ ...editing, conditionValue: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-primary-500 block mb-1">Axe cible</label>
                <select className="input" value={editing.targetAxis} onChange={(e) => setEditing({ ...editing, targetAxis: Number(e.target.value), analyticCodeId: '' })}>
                  {axes.map((a) => <option key={a.number} value={a.number}>Axe {a.number} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-primary-500 block mb-1">Code analytique *</label>
                <select className="input" value={editing.analyticCodeId} onChange={(e) => setEditing({ ...editing, analyticCodeId: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {targetCodes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.shortLabel}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs font-semibold text-primary-500 block mb-1">Priorité</label>
                <input type="number" className="input !w-20" min={1} value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-sm mt-5">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button className="btn-outline" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AFFECTATION MANUELLE
// ══════════════════════════════════════════════════════════════════════════════
function AssignTab({ orgId, axes, year, onUpdate }: { orgId: string; axes: AnalyticAxis[]; year: number; onUpdate: () => void; ct: ReturnType<typeof useChartTheme> }) {
  const [axisNum, setAxisNum] = useState(1);
  const [lines, setLines] = useState<any[]>([]);
  const [codes, setCodes] = useState<AnalyticCode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [targetCodeId, setTargetCodeId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (axes.length > 0) setAxisNum(axes[0].number); }, [axes]);
  useEffect(() => { reload(); }, [orgId, year, axisNum]);

  const reload = async () => {
    setLoading(true);
    try {
      const unmapped = await getUnmappedLines(orgId, year, axisNum, 500);
      setLines(unmapped);
      const axis = axes.find((a) => a.number === axisNum);
      if (axis) setCodes((await getCodes(orgId, axis.id)).filter((c) => c.active));
    } finally { setLoading(false); }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === lines.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(lines.map((l) => l.id)));
  };

  const assign = async () => {
    if (selectedIds.size === 0 || !targetCodeId) { alert('Sélectionnez des lignes et un code analytique.'); return; }
    await assignManual(orgId, [...selectedIds], axisNum, targetCodeId);
    setSelectedIds(new Set());
    setTargetCodeId('');
    reload();
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={axisNum} onChange={(e) => setAxisNum(Number(e.target.value))}>
          {axes.filter((a) => a.active).map((a) => <option key={a.number} value={a.number}>Axe {a.number} — {a.name}</option>)}
        </select>
        <span className="text-xs text-primary-500">{lines.length} ligne(s) non affectée(s)</span>
        <div className="ml-auto flex gap-2 items-center">
          <select className="input !w-auto" value={targetCodeId} onChange={(e) => setTargetCodeId(e.target.value)}>
            <option value="">— Code cible —</option>
            {codes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.shortLabel}</option>)}
          </select>
          <button className="btn-primary text-sm" onClick={assign} disabled={selectedIds.size === 0 || !targetCodeId}>
            <Play className="w-4 h-4" /> Affecter ({selectedIds.size})
          </button>
        </div>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white dark:bg-primary-950 z-10">
              <tr className="bg-primary-100 dark:bg-primary-900">
                <th className="px-2 py-2 w-8"><input type="checkbox" checked={selectedIds.size === lines.length && lines.length > 0} onChange={selectAll} /></th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">Compte</th>
                <th className="text-left px-2 py-2">Journal</th>
                <th className="text-left px-2 py-2">Libellé</th>
                <th className="text-right px-2 py-2">Débit</th>
                <th className="text-right px-2 py-2">Crédit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={clsx('border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50', selectedIds.has(l.id) && 'bg-primary-100 dark:bg-primary-800/50')}>
                  <td className="px-2 py-1.5"><input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                  <td className="px-2 py-1.5 num">{l.date}</td>
                  <td className="px-2 py-1.5 font-mono">{l.account}</td>
                  <td className="px-2 py-1.5">{l.journal}</td>
                  <td className="px-2 py-1.5">{l.label}</td>
                  <td className="px-2 py-1.5 text-right num">{l.debit > 0 ? fmtFull(l.debit) : ''}</td>
                  <td className="px-2 py-1.5 text-right num">{l.credit > 0 ? fmtFull(l.credit) : ''}</td>
                </tr>
              ))}
              {lines.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-primary-400">Toutes les lignes sont affectées pour cet axe.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className={`num text-xl font-bold mt-1 ${highlight === false ? 'text-error' : ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-primary-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
