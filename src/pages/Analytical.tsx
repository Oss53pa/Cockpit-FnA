/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// Comptabilité Analytique — Plan multi-axes, règles de mapping, affectation, dashboard
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, Line, ComposedChart } from 'recharts';
import { AlertCircle, ArrowRight, BarChart2, CheckCircle2, FileText, Gauge, Layers, ListChecks, Play, Plus, Printer, Settings, Target, TrendingDown, TrendingUp, Trash2, Wand2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull } from '../lib/format';
import { AnalyticAxis, AnalyticCode, AnalyticRule, AnalyticBranch, AnalyticAssignment } from '../db/schema';
import { BRANCH_LABELS, BRANCH_COLORS, inferBranch } from '../engine/analyticBranch';
import { dataProvider } from '../db/provider';
import { ChartGradients, barGradId } from '../components/charts/ChartGradients';
import {
  getAxes, saveAxis, deleteAxis,
  getCodes, saveCode, deleteCode,
  getRules, saveRule, deleteRule,
  simulateRules, applyRules, assignManual, clearAutoAssignments,
  computeAnalyticDashboard, computeAnalyticMonthly, getUnmappedLines, getCoverageStats,
  importAnalyticCodes, type AnalyticCodeImportRow,
  type AnalyticDashRow, type MappingReport,
} from '../engine/analyticalEngine';
import { downloadAnalyticCodesTemplate } from '../engine/templates';
import { parseFile } from '../engine/importer';
import { Download, Upload } from 'lucide-react';

type Tab = 'overview' | 'dashboard' | 'wbs' | 'axes' | 'codes' | 'rules' | 'assign' | 'report';

const uid = () => crypto.randomUUID();

const VALID_TABS: Tab[] = ['overview', 'dashboard', 'wbs', 'axes', 'codes', 'rules', 'assign', 'report'];

export default function Analytical() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [searchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') as Tab) ? (searchParams.get('tab') as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  useEffect(() => { getAxes(currentOrgId).then(setAxes); }, [currentOrgId, refresh]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'dashboard', label: 'Dashboard analytique' },
    { key: 'wbs', label: 'Vue WBS (par projet)' },
    { key: 'axes', label: 'Plan analytique (Axes)' },
    { key: 'codes', label: 'Codes analytiques' },
    { key: 'rules', label: 'Règles de mapping' },
    { key: 'assign', label: 'Affectation manuelle' },
    { key: 'report', label: 'Rapport analytique' },
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

      {tab === 'overview' && <OverviewTab orgId={currentOrgId} year={currentYear} axes={axes} ct={ct} setTab={setTab} />}
      {tab === 'dashboard' && <DashboardTab orgId={currentOrgId} year={currentYear} axes={axes} ct={ct} />}
      {tab === 'wbs' && <WBSTab orgId={currentOrgId} year={currentYear} axes={axes} ct={ct} />}
      {tab === 'axes' && <AxesTab orgId={currentOrgId} axes={axes} onUpdate={bump} />}
      {tab === 'codes' && <CodesTab orgId={currentOrgId} axes={axes} onUpdate={bump} />}
      {tab === 'rules' && <RulesTab orgId={currentOrgId} axes={axes} onUpdate={bump} year={currentYear} />}
      {tab === 'assign' && <AssignTab orgId={currentOrgId} axes={axes} year={currentYear} onUpdate={bump} ct={ct} />}
      {tab === 'report' && <ReportTab orgId={currentOrgId} year={currentYear} axes={axes} />}
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
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tickFormatter={fmtFull} tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => fmtFull(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="charges" name="Charges" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
              <Bar dataKey="produits" name="Produits" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Couverture par axe */}
      {coverage.byAxis.length > 1 && (
        <ChartCard title="Taux de couverture par axe">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={coverage.byAxis} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v} %`} />
              <Bar dataKey="rate" name="Couverture" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
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
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmtFull(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="charges" name="Charges" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
              <Bar dataKey="produits" name="Produits" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
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
    if (next > 5) { toast.warning('Maximum atteint', '5 axes analytiques maximum'); return; }
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
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ total: number; inserted: number; updated: number; rejected: number; errors: { row: number; reason: string }[] } | null>(null);

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

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportReport(null);
    try {
      const { rows: rawRows } = await parseFile(file);
      // Mapping flexible des en-têtes (FR/EN, Excel/CSV)
      const mapped: AnalyticCodeImportRow[] = rawRows.map((r: Record<string, unknown>) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        const axe = parseInt(get('Axe', 'axe', 'Axis', 'axis_number') || '1', 10) || 1;
        const code = get('Code', 'code');
        const shortLabel = get('Libellé court', 'Libelle court', 'short_label', 'shortLabel', 'Libellé', 'Label');
        const longLabel = get('Libellé long', 'Libelle long', 'long_label', 'longLabel', 'Description');
        const parent = get('Code parent', 'parent', 'parent_code', 'parentCode');
        const branchRaw = get('Branche WBS', 'Branche', 'branch', 'WBS');
        const activeRaw = get('Actif', 'active', 'Active');
        const branch = branchRaw && ['revenue', 'project_cost', 'overhead'].includes(branchRaw)
          ? branchRaw as 'revenue' | 'project_cost' | 'overhead'
          : undefined;
        const active = activeRaw === '' ? true : !['0', 'false', 'non', 'no'].includes(activeRaw.toLowerCase());
        return { axe, code, shortLabel, longLabel, parent: parent || undefined, branch, active };
      }).filter((r) => r.code);
      const report = await importAnalyticCodes(orgId, mapped);
      setImportReport(report);
      // Rafraîchir si l'axe en cours est concerné
      if (axisId) getCodes(orgId, axisId).then(setCodes);
      onUpdate();
      if (report.errors.length === 0) {
        toast.success(`Import réussi : ${report.inserted} créés, ${report.updated} mis à jour`);
      } else {
        toast.warning(
          `Import partiel : ${report.inserted + report.updated} OK, ${report.rejected} rejetés`,
          'Voir le détail dans le rapport ci-dessous',
        );
      }
    } catch (e) {
      toast.error('Échec de l\'import', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={axisId} onChange={(e) => setAxisId(e.target.value)}>
          {axes.map((a) => <option key={a.id} value={a.id}>Axe {a.number} — {a.name}</option>)}
        </select>
        <input className="input !w-64" placeholder="Rechercher un code…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <button
            className="btn-outline text-sm"
            onClick={() => downloadAnalyticCodesTemplate()}
            title="Télécharger le modèle Excel pour l'import"
          >
            <Download className="w-4 h-4" /> Modèle
          </button>
          <label className="btn-outline text-sm cursor-pointer" title="Importer un fichier Excel/CSV">
            <Upload className="w-4 h-4" />
            {importing ? 'Import…' : 'Importer'}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <button className="btn-primary text-sm" onClick={create}><Plus className="w-4 h-4" /> Nouveau code</button>
        </div>
      </div>

      {importReport && (
        <Card padded>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">
                Rapport d'import
              </p>
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                {importReport.total} ligne(s) traitée(s) · {importReport.inserted} créé(s) ·{' '}
                {importReport.updated} mis à jour · {importReport.rejected} rejeté(s)
              </p>
              {importReport.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-error cursor-pointer hover:underline">
                    Voir les {importReport.errors.length} erreur(s)
                  </summary>
                  <ul className="text-[11px] text-primary-600 dark:text-primary-400 mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {importReport.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>Ligne {e.row} : {e.reason}</li>
                    ))}
                    {importReport.errors.length > 50 && (
                      <li className="italic">… et {importReport.errors.length - 50} autres</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
            <button className="btn-ghost !p-1" onClick={() => setImportReport(null)} title="Fermer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-100 dark:bg-primary-900">
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Libellé court</th>
                <th className="text-left px-3 py-2">Libellé long</th>
                <th className="text-center px-3 py-2">Branche WBS</th>
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
                  <td className="px-3 py-2 text-center">
                    {c.branch ? (
                      <Badge variant={BRANCH_COLORS[c.branch] as any}>{BRANCH_LABELS[c.branch]}</Badge>
                    ) : <span className="text-[10px] text-primary-400">Universel</span>}
                  </td>
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
                <tr><td colSpan={6} className="px-3 py-8 text-center text-primary-400">Aucun code. Cliquez sur "Nouveau code" pour commencer.</td></tr>
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
            <div>
              <label className="text-xs font-semibold text-primary-500 block mb-1">
                Branche WBS
                <span className="ml-2 font-normal text-primary-400">(restreint l'affectation)</span>
              </label>
              <select
                className="input"
                value={editing.branch ?? ''}
                onChange={(e) => setEditing({ ...editing, branch: (e.target.value || undefined) as AnalyticBranch | undefined })}
              >
                <option value="">— Universel (compatible toutes lignes) —</option>
                <option value="revenue">{BRANCH_LABELS.revenue} — comptes 7x</option>
                <option value="project_cost">{BRANCH_LABELS.project_cost} — 6x avec projet</option>
                <option value="overhead">{BRANCH_LABELS.overhead} — 6x sans projet</option>
              </select>
              <p className="text-[10px] text-primary-400 mt-1">
                Ex : un code "Centre de revenu" en branche Revenus ne pourra pas être affecté à
                une ligne de coût ; un code "Tâche" en Coûts projets ne pourra pas être affecté
                aux frais généraux.
              </p>
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
      toast.success('Affectations exécutées', `${result.matched} lignes affectées · couverture ${result.coverageRate}%`);
      onUpdate();
    } finally { setApplying(false); }
  };

  const clearAuto = async () => {
    if (!confirm('Supprimer toutes les affectations automatiques ? Les affectations manuelles seront conservées.')) return;
    const n = await clearAutoAssignments(orgId);
    toast.success('Affectations supprimées', `${n} lignes effacées`);
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
  useEffect(() => { reload(); }, [orgId, year, axisNum]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (selectedIds.size === 0 || !targetCodeId) { toast.warning('Sélection requise', 'Choisissez des lignes et un code analytique'); return; }
    const result = await assignManual(orgId, [...selectedIds], axisNum, targetCodeId);
    if (result.rejected > 0) {
      toast.warning(
        `${result.assigned} affectées · ${result.rejected} refusées (branche WBS incompatible)`,
        result.rejectedReasons.slice(0, 2).join(' '),
      );
    } else if (result.assigned > 0) {
      toast.success(`${result.assigned} ligne(s) affectée(s)`);
    }
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

// ══════════════════════════════════════════════════════════════════════════════
// VUE WBS — consolidation par projet (axe 1) avec sous-totaux par branche
// ══════════════════════════════════════════════════════════════════════════════
type WBSRow = {
  projectCode: string;
  projectLabel: string;
  revenue: number;
  projectCost: number;
  overhead: number;
  margeBrute: number;       // revenue - projectCost
  margeNette: number;       // revenue - projectCost - overhead (alloué si applicable)
};

function WBSTab({ orgId, year, axes, ct }: { orgId: string; year: number; axes: AnalyticAxis[]; ct: ReturnType<typeof useChartTheme> }) {
  const [rows, setRows] = useState<WBSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unallocOverhead, setUnallocOverhead] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    void (async () => {
      try {
        // 1) Récupère GL + assignments + codes + périodes
        const [periods, allEntries, assignments, codes] = await Promise.all([
          dataProvider.getPeriods(orgId),
          dataProvider.getGLEntries({ orgId }),
          dataProvider.getAnalyticAssignments(orgId),
          dataProvider.getAnalyticCodes(orgId),
        ]);

        const yearPeriodIds = new Set(
          periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id),
        );
        const yearEntries = allEntries.filter((e) => yearPeriodIds.has(e.periodId));

        // 2) Index : entryId → assignations, codeId → code
        const codeById = new Map<string, AnalyticCode>(codes.map((c) => [c.id, c]));
        const assignmentsByEntry = new Map<number, AnalyticAssignment[]>();
        for (const a of assignments) {
          if (!a.glEntryId) continue;
          const arr = assignmentsByEntry.get(a.glEntryId) ?? [];
          arr.push(a);
          assignmentsByEntry.set(a.glEntryId, arr);
        }

        // 3) Identifie l'axe 1 (Projet) — convention de l'utilisateur
        const projectAxis = axes.find((a) => a.number === 1);

        // 4) Pour chaque ligne GL, détermine projet et branche puis cumule
        const byProject = new Map<string, WBSRow>();
        let totalUnallocOverhead = 0;

        for (const entry of yearEntries) {
          const entryAssignments = assignmentsByEntry.get(entry.id ?? -1) ?? [];
          const branch = inferBranch(entry, { assignments: entryAssignments });
          if (!branch) continue;

          // Détermine le code projet sur l'axe 1
          const projectAssignment = projectAxis
            ? entryAssignments.find((a) => a.axisNumber === 1)
            : undefined;
          const projectCode = projectAssignment ? codeById.get(projectAssignment.codeId) : undefined;

          // Montant signé (charges = positif côté débit, produits = positif côté crédit)
          const amount = branch === 'revenue'
            ? (entry.credit - entry.debit)
            : (entry.debit - entry.credit);
          if (Math.abs(amount) < 0.005) continue;

          // FG sans projet : ne rentre pas dans un projet, on agrège dans unalloc
          if (branch === 'overhead' && !projectCode) {
            totalUnallocOverhead += amount;
            continue;
          }

          const key = projectCode?.code ?? '__no_project__';
          const label = projectCode?.shortLabel ?? '— Sans projet —';
          let row = byProject.get(key);
          if (!row) {
            row = {
              projectCode: key === '__no_project__' ? '—' : key,
              projectLabel: label,
              revenue: 0, projectCost: 0, overhead: 0,
              margeBrute: 0, margeNette: 0,
            };
            byProject.set(key, row);
          }
          if (branch === 'revenue') row.revenue += amount;
          else if (branch === 'project_cost') row.projectCost += amount;
          else if (branch === 'overhead') row.overhead += amount;
        }

        // Calcul des marges
        const finalRows = Array.from(byProject.values()).map((r) => ({
          ...r,
          margeBrute: r.revenue - r.projectCost,
          margeNette: r.revenue - r.projectCost - r.overhead,
        })).sort((a, b) => b.revenue - a.revenue);

        setRows(finalRows);
        setUnallocOverhead(totalUnallocOverhead);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, year, axes]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      projectCost: acc.projectCost + r.projectCost,
      overhead: acc.overhead + r.overhead,
      margeBrute: acc.margeBrute + r.margeBrute,
      margeNette: acc.margeNette + r.margeNette,
    }),
    { revenue: 0, projectCost: 0, overhead: 0, margeBrute: 0, margeNette: 0 },
  ), [rows]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-primary-500">Calcul de la vue WBS…</div>;
  }

  if (rows.length === 0) {
    return (
      <Card padded>
        <p className="text-sm text-primary-600 dark:text-primary-300">
          Aucune ligne analytique avec branche WBS détectée pour l'exercice {year}.
        </p>
        <p className="text-xs text-primary-400 mt-2">
          Pour activer la Vue WBS : (1) crée des codes analytiques avec une branche définie
          (Revenus / Coûts projets / Frais généraux), (2) configure des règles de mapping
          ou affecte manuellement les lignes via l'onglet Affectation.
        </p>
      </Card>
    );
  }

  // Top / Flop projets par marge nette
  const top5Profitable = [...rows].filter((r) => r.margeNette > 0).sort((a, b) => b.margeNette - a.margeNette).slice(0, 5);
  const top5Loss = [...rows].filter((r) => r.margeNette < 0).sort((a, b) => a.margeNette - b.margeNette).slice(0, 5);

  // Pie : répartition revenus par projet
  const revenuePieData = rows
    .filter((r) => r.revenue > 0 && r.projectCode !== '—')
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((r, i) => ({ name: r.projectCode, value: r.revenue, color: ct.at(i) }));

  // Bar comparatif Revenus vs Coûts par projet (top 10)
  const compareBarData = rows.slice(0, 10).map((r) => ({
    code: r.projectCode,
    Revenus: r.revenue,
    Coûts: r.projectCost + r.overhead,
    Marge: r.margeNette,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI label="Revenus" value={fmtFull(totals.revenue)} />
        <KPI label="Coûts projets" value={fmtFull(totals.projectCost)} />
        <KPI label="Marge brute" value={fmtFull(totals.margeBrute)} highlight={totals.margeBrute >= 0} />
        <KPI label="Frais généraux" value={fmtFull(totals.overhead)} sub={`+ ${fmtFull(unallocOverhead)} non alloués`} />
        <KPI label="Marge nette" value={fmtFull(totals.margeNette)} highlight={totals.margeNette >= 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 5 projets profitables">
          {top5Profitable.length === 0 ? (
            <div className="py-12 text-center text-xs text-primary-400">Aucun projet profitable</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={top5Profitable} layout="vertical">
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis type="number" tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="projectCode" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Bar dataKey="margeNette" name="Marge nette" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top 5 projets déficitaires">
          {top5Loss.length === 0 ? (
            <div className="py-12 text-center text-xs text-primary-400">Aucun projet déficitaire</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={top5Loss} layout="vertical">
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis type="number" tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="projectCode" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Bar dataKey="margeNette" name="Marge nette" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Répartition des revenus par projet (Top 8)">
          {revenuePieData.length === 0 ? (
            <div className="py-12 text-center text-xs text-primary-400">Aucun revenu sur projet</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenuePieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90}
                  label={(e) => `${e.name} (${Math.round((e.value / totals.revenue) * 100)}%)`}
                  labelLine={{ stroke: ct.grid }}
                >
                  {revenuePieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Comparatif Revenus / Coûts par projet (Top 10)">
          {compareBarData.length === 0 ? (
            <div className="py-12 text-center text-xs text-primary-400">Aucune donnée</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={compareBarData}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="code" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis tickFormatter={fmtFull} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Revenus" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Coûts" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="Marge" stroke={ct.at(2)} strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="text-left px-3 py-2">Projet</th>
                <th className="text-left px-3 py-2">Libellé</th>
                <th className="text-right px-3 py-2">Revenus</th>
                <th className="text-right px-3 py-2">Coûts projets</th>
                <th className="text-right px-3 py-2">Marge brute</th>
                <th className="text-right px-3 py-2">FG alloués</th>
                <th className="text-right px-3 py-2">Marge nette</th>
                <th className="text-right px-3 py-2">% marge nette</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pctNet = r.revenue > 0 ? (r.margeNette / r.revenue) * 100 : 0;
                const negative = r.margeNette < 0;
                return (
                  <tr key={r.projectCode} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/50">
                    <td className="px-3 py-2 font-mono font-semibold">{r.projectCode}</td>
                    <td className="px-3 py-2">{r.projectLabel}</td>
                    <td className="px-3 py-2 text-right num">{fmtFull(r.revenue)}</td>
                    <td className="px-3 py-2 text-right num">{fmtFull(r.projectCost)}</td>
                    <td className={clsx('px-3 py-2 text-right num font-semibold', r.margeBrute < 0 && 'text-error')}>
                      {fmtFull(r.margeBrute)}
                    </td>
                    <td className="px-3 py-2 text-right num">{fmtFull(r.overhead)}</td>
                    <td className={clsx('px-3 py-2 text-right num font-bold', negative && 'text-error')}>
                      {fmtFull(r.margeNette)}
                    </td>
                    <td className={clsx('px-3 py-2 text-right num', negative && 'text-error')}>
                      {pctNet.toFixed(1)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-primary-100 dark:bg-primary-900 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-right num">{fmtFull(totals.revenue)}</td>
                <td className="px-3 py-2 text-right num">{fmtFull(totals.projectCost)}</td>
                <td className="px-3 py-2 text-right num">{fmtFull(totals.margeBrute)}</td>
                <td className="px-3 py-2 text-right num">{fmtFull(totals.overhead)}</td>
                <td className="px-3 py-2 text-right num">{fmtFull(totals.margeNette)}</td>
                <td className="px-3 py-2 text-right num">
                  {totals.revenue > 0 ? ((totals.margeNette / totals.revenue) * 100).toFixed(1) : '0.0'} %
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {unallocOverhead > 0 && (
        <Card padded>
          <p className="text-xs text-warning font-semibold">
            ⚠ Frais généraux non alloués : {fmtFull(unallocOverhead)}
          </p>
          <p className="text-[11px] text-primary-500 mt-1">
            Ces FG ne sont rattachés à aucun projet (axe 1 vide). Pour les répartir sur les
            projets, configurez une clé de répartition (CA, heures, direct) — fonctionnalité
            disponible dans une future version.
          </p>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW — synthèse exécutive du module analytique
// ══════════════════════════════════════════════════════════════════════════════
type OverviewStats = {
  loading: boolean;
  // Configuration
  axesCount: number;
  axesActive: number;
  codesCount: number;
  codesActive: number;
  codesWithBranch: number;
  rulesCount: number;
  rulesActive: number;
  // Couverture
  totalLines: number;
  assignedLines: number;
  coverageRate: number;
  byAxisCoverage: { axis: number; name: string; rate: number }[];
  // WBS totals
  revenue: number;
  projectCost: number;
  overhead: number;
  margeBrute: number;
  margeNette: number;
  topProjects: { code: string; label: string; margeNette: number }[];
  worstProjects: { code: string; label: string; margeNette: number }[];
};

function OverviewTab({
  orgId, year, axes, setTab,
}: {
  orgId: string; year: number; axes: AnalyticAxis[];
  ct: ReturnType<typeof useChartTheme>;
  setTab: (t: Tab) => void;
}) {
  const [stats, setStats] = useState<OverviewStats>({
    loading: true,
    axesCount: 0, axesActive: 0, codesCount: 0, codesActive: 0, codesWithBranch: 0,
    rulesCount: 0, rulesActive: 0,
    totalLines: 0, assignedLines: 0, coverageRate: 0, byAxisCoverage: [],
    revenue: 0, projectCost: 0, overhead: 0, margeBrute: 0, margeNette: 0,
    topProjects: [], worstProjects: [],
  });

  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      try {
        const [codes, rules, coverage, periods, allEntries, assignments] = await Promise.all([
          getCodes(orgId),
          getRules(orgId),
          getCoverageStats(orgId, year),
          dataProvider.getPeriods(orgId),
          dataProvider.getGLEntries({ orgId }),
          dataProvider.getAnalyticAssignments(orgId),
        ]);

        const yearPeriodIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
        const yearEntries = allEntries.filter((e) => yearPeriodIds.has(e.periodId));

        // WBS totals
        const codeById = new Map<string, AnalyticCode>(codes.map((c) => [c.id, c]));
        const assignmentsByEntry = new Map<number, AnalyticAssignment[]>();
        for (const a of assignments) {
          if (!a.glEntryId) continue;
          const arr = assignmentsByEntry.get(a.glEntryId) ?? [];
          arr.push(a);
          assignmentsByEntry.set(a.glEntryId, arr);
        }

        let revenue = 0, projectCost = 0, overhead = 0;
        const byProject = new Map<string, { code: string; label: string; revenue: number; cost: number }>();

        for (const entry of yearEntries) {
          const ass = assignmentsByEntry.get(entry.id ?? -1) ?? [];
          const branch = inferBranch(entry, { assignments: ass });
          if (!branch) continue;
          const amount = branch === 'revenue'
            ? (entry.credit - entry.debit)
            : (entry.debit - entry.credit);
          if (Math.abs(amount) < 0.005) continue;

          if (branch === 'revenue') revenue += amount;
          else if (branch === 'project_cost') projectCost += amount;
          else overhead += amount;

          // Per-project tracking
          const projAss = ass.find((a) => a.axisNumber === 1);
          const projCode = projAss ? codeById.get(projAss.codeId) : undefined;
          if (projCode) {
            const key = projCode.code;
            let row = byProject.get(key);
            if (!row) {
              row = { code: projCode.code, label: projCode.shortLabel, revenue: 0, cost: 0 };
              byProject.set(key, row);
            }
            if (branch === 'revenue') row.revenue += amount;
            else row.cost += amount; // project_cost ou overhead alloué
          }
        }

        const projectArr = Array.from(byProject.values()).map((r) => ({
          code: r.code, label: r.label, margeNette: r.revenue - r.cost,
        }));
        const topProjects = [...projectArr].filter((p) => p.margeNette > 0).sort((a, b) => b.margeNette - a.margeNette).slice(0, 3);
        const worstProjects = [...projectArr].filter((p) => p.margeNette < 0).sort((a, b) => a.margeNette - b.margeNette).slice(0, 3);

        setStats({
          loading: false,
          axesCount: axes.length,
          axesActive: axes.filter((a) => a.active).length,
          codesCount: codes.length,
          codesActive: codes.filter((c) => c.active).length,
          codesWithBranch: codes.filter((c) => !!c.branch).length,
          rulesCount: rules.length,
          rulesActive: rules.filter((r) => r.active).length,
          totalLines: coverage.total,
          assignedLines: coverage.assigned,
          coverageRate: coverage.rate,
          byAxisCoverage: coverage.byAxis,
          revenue, projectCost, overhead,
          margeBrute: revenue - projectCost,
          margeNette: revenue - projectCost - overhead,
          topProjects, worstProjects,
        });
      } catch {
        setStats((s) => ({ ...s, loading: false }));
      }
    })();
  }, [orgId, year, axes]);

  if (stats.loading) {
    return <div className="py-12 text-center text-sm text-primary-500">Chargement de la synthèse…</div>;
  }

  // Health score : pondération couverture + complétude config
  const configScore = Math.min(100, Math.round(
    (stats.axesActive >= 1 ? 25 : 0) +
    (stats.codesActive >= 5 ? 25 : (stats.codesActive / 5) * 25) +
    (stats.rulesActive >= 1 ? 25 : 0) +
    (stats.coverageRate >= 80 ? 25 : (stats.coverageRate / 80) * 25),
  ));
  const configStatus: 'good' | 'warn' | 'risk' = configScore >= 75 ? 'good' : configScore >= 45 ? 'warn' : 'risk';
  const configColor = configStatus === 'good' ? 'text-success' : configStatus === 'warn' ? 'text-warning' : 'text-error';

  // Recommandations
  const recos: { icon: typeof CheckCircle2; severity: 'info' | 'warn' | 'error'; text: string; tab?: Tab }[] = [];
  if (stats.axesActive === 0) recos.push({ icon: AlertCircle, severity: 'error', text: 'Aucun axe analytique actif. Configurez au moins un axe (ex. Projet) pour commencer.', tab: 'axes' });
  if (stats.codesActive === 0) recos.push({ icon: AlertCircle, severity: 'error', text: 'Aucun code analytique. Importez ou créez des codes pour pouvoir affecter les écritures.', tab: 'codes' });
  if (stats.rulesActive === 0 && stats.codesActive > 0) recos.push({ icon: AlertCircle, severity: 'warn', text: 'Aucune règle de mapping active. L\'affectation reste 100% manuelle — considérez automatiser.', tab: 'rules' });
  if (stats.coverageRate < 50 && stats.totalLines > 0) recos.push({ icon: TrendingDown, severity: 'warn', text: `Couverture seulement ${stats.coverageRate}%. Lancez les règles ou affectez les lignes manquantes.`, tab: 'assign' });
  if (stats.codesWithBranch === 0 && stats.codesActive > 0) recos.push({ icon: AlertCircle, severity: 'info', text: 'Aucun code n\'utilise les branches WBS (Revenus / Coûts projets / FG). Activez la sémantique conditionnelle.', tab: 'codes' });
  if (stats.worstProjects.length > 0) {
    const w = stats.worstProjects[0];
    recos.push({ icon: TrendingDown, severity: 'warn', text: `Projet ${w.code} (${w.label}) en perte : ${fmtFull(w.margeNette)}. À analyser en priorité.`, tab: 'wbs' });
  }
  if (recos.length === 0) {
    recos.push({ icon: CheckCircle2, severity: 'info', text: 'Configuration analytique saine. Continuez à enrichir les codes pour affiner les analyses.' });
  }

  return (
    <div className="space-y-6">
      {/* Header avec score + verdict */}
      <Card padded>
        <div className="flex flex-col sm:flex-row gap-6 items-center">
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="8" className="text-primary-200 dark:text-primary-800" fill="none" />
              <circle
                cx="60" cy="60" r="50"
                stroke="currentColor" strokeWidth="8" fill="none"
                strokeDasharray={`${(configScore / 100) * 314} 314`}
                className={configColor}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold num ${configColor}`}>{configScore}</span>
              <span className="text-[10px] uppercase tracking-wider text-primary-500">/ 100</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Gauge className={`w-4 h-4 ${configColor}`} />
              <p className={`text-xs font-bold uppercase tracking-wider ${configColor}`}>
                {configStatus === 'good' ? 'Configuration saine' : configStatus === 'warn' ? 'Configuration à enrichir' : 'Configuration incomplète'}
              </p>
            </div>
            <h3 className="text-lg font-bold text-primary-900 dark:text-primary-100 mb-2">
              Score de maturité analytique
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400">
              Pondération : couverture {stats.coverageRate}% · {stats.axesActive} axe(s) actif(s) ·
              {' '}{stats.codesActive} code(s) actif(s) · {stats.rulesActive} règle(s) actives.
            </p>
          </div>
        </div>
      </Card>

      {/* KPIs configuration & couverture */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPI label="Axes actifs" value={`${stats.axesActive}/${stats.axesCount}`} sub="jusqu'à 5 axes" />
        <KPI label="Codes actifs" value={`${stats.codesActive}/${stats.codesCount}`} sub={`${stats.codesWithBranch} typés WBS`} />
        <KPI label="Règles" value={`${stats.rulesActive}/${stats.rulesCount}`} sub="mapping automatique" />
        <KPI label="Couverture" value={`${stats.coverageRate} %`} sub={`${stats.assignedLines}/${stats.totalLines} lignes`} highlight={stats.coverageRate >= 70} />
        <KPI label="Revenus" value={fmtFull(stats.revenue)} />
        <KPI label="Marge brute" value={fmtFull(stats.margeBrute)} highlight={stats.margeBrute >= 0} />
        <KPI label="Marge nette" value={fmtFull(stats.margeNette)} highlight={stats.margeNette >= 0} />
      </div>

      {/* Couverture par axe */}
      {stats.byAxisCoverage.length > 1 && (
        <ChartCard title="Couverture par axe">
          <ResponsiveContainer width="100%" height={Math.max(140, stats.byAxisCoverage.length * 36)}>
            <BarChart data={stats.byAxisCoverage} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v} %`} />
              <Bar dataKey="rate" name="Couverture" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Top / Flop projets */}
      {(stats.topProjects.length > 0 || stats.worstProjects.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stats.topProjects.length > 0 && (
            <Card title="Top 3 projets profitables" padded={false}>
              <ul className="divide-y divide-primary-100 dark:divide-primary-800">
                {stats.topProjects.map((p) => (
                  <li key={p.code} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-success" />
                      <div>
                        <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{p.code}</p>
                        <p className="text-[11px] text-primary-500">{p.label}</p>
                      </div>
                    </div>
                    <p className="num text-sm font-bold text-success">{fmtFull(p.margeNette)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {stats.worstProjects.length > 0 && (
            <Card title="Top 3 projets en perte" padded={false}>
              <ul className="divide-y divide-primary-100 dark:divide-primary-800">
                {stats.worstProjects.map((p) => (
                  <li key={p.code} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingDown className="w-4 h-4 text-error" />
                      <div>
                        <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{p.code}</p>
                        <p className="text-[11px] text-primary-500">{p.label}</p>
                      </div>
                    </div>
                    <p className="num text-sm font-bold text-error">{fmtFull(p.margeNette)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* Recommandations / actions */}
      <Card title="Recommandations & actions" padded>
        <ul className="space-y-2">
          {recos.map((r, i) => {
            const Icon = r.icon;
            const color = r.severity === 'error' ? 'text-error' : r.severity === 'warn' ? 'text-warning' : 'text-primary-500';
            return (
              <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/40">
                <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary-800 dark:text-primary-200">{r.text}</p>
                </div>
                {r.tab && (
                  <button
                    className="text-xs text-accent hover:underline whitespace-nowrap inline-flex items-center gap-1"
                    onClick={() => setTab(r.tab!)}
                  >
                    Aller <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Quick links vers les autres tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink icon={BarChart2} label="Dashboard analytique" desc="KPIs & charts par axe" onClick={() => setTab('dashboard')} />
        <QuickLink icon={Target} label="Vue WBS" desc="Marge par projet" onClick={() => setTab('wbs')} />
        <QuickLink icon={Wand2} label="Règles de mapping" desc="Affectation auto" onClick={() => setTab('rules')} />
        <QuickLink icon={ListChecks} label="Affectation manuelle" desc="Lignes non affectées" onClick={() => setTab('assign')} />
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, desc, onClick }: { icon: typeof CheckCircle2; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-4 hover:border-accent hover:bg-accent/5 transition group text-left"
    >
      <Icon className="w-5 h-5 text-accent mb-2" />
      <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{label}</p>
      <p className="text-xs text-primary-500 mt-0.5">{desc}</p>
      <ArrowRight className="w-3 h-3 text-primary-400 mt-2 group-hover:text-accent transition" />
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RAPPORT ANALYTIQUE — synthèse imprimable + export Excel
// ══════════════════════════════════════════════════════════════════════════════
type ReportData = {
  loading: boolean;
  generatedAt: Date;
  // Synthèse
  totalLines: number;
  assignedLines: number;
  coverageRate: number;
  // P&L global
  revenue: number;
  projectCost: number;
  overhead: number;
  margeBrute: number;
  margeNette: number;
  resultPct: number;
  // Per-project P&L
  projects: { code: string; label: string; revenue: number; projectCost: number; overhead: number; margeBrute: number; margeNette: number; pctMarge: number }[];
  // Top codes par axe
  byAxis: { axisNumber: number; axisName: string; topCodes: AnalyticDashRow[] }[];
  // Anomalies
  anomalies: string[];
};

function ReportTab({ orgId, year, axes }: { orgId: string; year: number; axes: AnalyticAxis[] }) {
  const org = useApp((s) => s.currentOrgId);
  const [data, setData] = useState<ReportData>({
    loading: true,
    generatedAt: new Date(),
    totalLines: 0, assignedLines: 0, coverageRate: 0,
    revenue: 0, projectCost: 0, overhead: 0, margeBrute: 0, margeNette: 0, resultPct: 0,
    projects: [], byAxis: [], anomalies: [],
  });

  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      try {
        const [coverage, periods, allEntries, assignments, codes] = await Promise.all([
          getCoverageStats(orgId, year),
          dataProvider.getPeriods(orgId),
          dataProvider.getGLEntries({ orgId }),
          dataProvider.getAnalyticAssignments(orgId),
          dataProvider.getAnalyticCodes(orgId),
        ]);

        const yearPeriodIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
        const yearEntries = allEntries.filter((e) => yearPeriodIds.has(e.periodId));

        // Per-project + global
        const codeById = new Map<string, AnalyticCode>(codes.map((c) => [c.id, c]));
        const assignmentsByEntry = new Map<number, AnalyticAssignment[]>();
        for (const a of assignments) {
          if (!a.glEntryId) continue;
          const arr = assignmentsByEntry.get(a.glEntryId) ?? [];
          arr.push(a);
          assignmentsByEntry.set(a.glEntryId, arr);
        }

        const byProject = new Map<string, { code: string; label: string; revenue: number; projectCost: number; overhead: number }>();
        let totalRevenue = 0, totalProjectCost = 0, totalOverhead = 0;
        let unallocatedOverhead = 0;
        let entriesWithoutBranch = 0;

        for (const entry of yearEntries) {
          const ass = assignmentsByEntry.get(entry.id ?? -1) ?? [];
          const branch = inferBranch(entry, { assignments: ass });
          if (!branch) { entriesWithoutBranch++; continue; }
          const amount = branch === 'revenue'
            ? (entry.credit - entry.debit)
            : (entry.debit - entry.credit);
          if (Math.abs(amount) < 0.005) continue;

          if (branch === 'revenue') totalRevenue += amount;
          else if (branch === 'project_cost') totalProjectCost += amount;
          else totalOverhead += amount;

          const projAss = ass.find((a) => a.axisNumber === 1);
          const projCode = projAss ? codeById.get(projAss.codeId) : undefined;
          if (branch === 'overhead' && !projCode) {
            unallocatedOverhead += amount;
            continue;
          }
          const key = projCode?.code ?? '__no_project__';
          const label = projCode?.shortLabel ?? '— Sans projet —';
          let row = byProject.get(key);
          if (!row) {
            row = { code: key === '__no_project__' ? '—' : key, label, revenue: 0, projectCost: 0, overhead: 0 };
            byProject.set(key, row);
          }
          if (branch === 'revenue') row.revenue += amount;
          else if (branch === 'project_cost') row.projectCost += amount;
          else row.overhead += amount;
        }

        const projects = Array.from(byProject.values()).map((r) => {
          const margeBrute = r.revenue - r.projectCost;
          const margeNette = r.revenue - r.projectCost - r.overhead;
          return {
            ...r, margeBrute, margeNette,
            pctMarge: r.revenue > 0 ? (margeNette / r.revenue) * 100 : 0,
          };
        }).sort((a, b) => b.revenue - a.revenue);

        // Top codes par axe (top 5 par axe)
        const byAxis = await Promise.all(
          axes.filter((a) => a.active).map(async (a) => {
            const rows = await computeAnalyticDashboard(orgId, year, a.number);
            return {
              axisNumber: a.number,
              axisName: a.name,
              topCodes: rows.filter((r) => r.codeId !== '__unassigned__').slice(0, 5),
            };
          }),
        );

        // Anomalies
        const anomalies: string[] = [];
        if (coverage.rate < 80 && coverage.total > 0) {
          anomalies.push(`Couverture analytique de ${coverage.rate}% — ${coverage.total - coverage.assigned} ligne(s) non affectée(s).`);
        }
        if (unallocatedOverhead > 0) {
          anomalies.push(`Frais généraux non alloués à un projet : ${fmtFull(unallocatedOverhead)}. Configurez une clé de répartition.`);
        }
        if (entriesWithoutBranch > 0) {
          anomalies.push(`${entriesWithoutBranch} écriture(s) hors classes 6/7 (capitaux, immo, tiers, trésorerie) — non analytiques au sens WBS.`);
        }
        const totalRevenue2 = totalRevenue;
        if (totalRevenue2 === 0 && totalProjectCost > 0) {
          anomalies.push('Coûts projets enregistrés mais aucun revenu — vérifier la saisie ou la branche des codes.');
        }
        if (anomalies.length === 0) {
          anomalies.push('Aucune anomalie majeure détectée.');
        }

        setData({
          loading: false,
          generatedAt: new Date(),
          totalLines: coverage.total,
          assignedLines: coverage.assigned,
          coverageRate: coverage.rate,
          revenue: totalRevenue, projectCost: totalProjectCost, overhead: totalOverhead,
          margeBrute: totalRevenue - totalProjectCost,
          margeNette: totalRevenue - totalProjectCost - totalOverhead,
          resultPct: totalRevenue > 0 ? ((totalRevenue - totalProjectCost - totalOverhead) / totalRevenue) * 100 : 0,
          projects, byAxis, anomalies,
        });
      } catch {
        setData((d) => ({ ...d, loading: false }));
      }
    })();
  }, [orgId, year, axes]);

  const exportExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Cockpit FnA';
      wb.created = new Date();

      const wsSyn = wb.addWorksheet('Synthèse');
      wsSyn.addRow(['RAPPORT ANALYTIQUE']).font = { bold: true, size: 16 };
      wsSyn.addRow([`Société : ${org}`]);
      wsSyn.addRow([`Exercice : ${year}`]);
      wsSyn.addRow([`Généré le : ${data.generatedAt.toLocaleString('fr-FR')}`]);
      wsSyn.addRow([]);
      wsSyn.addRow(['INDICATEURS']).font = { bold: true, size: 13 };
      wsSyn.addRow(['Couverture analytique', `${data.coverageRate} %`, `${data.assignedLines} / ${data.totalLines} lignes`]);
      wsSyn.addRow(['Revenus', data.revenue]);
      wsSyn.addRow(['Coûts projets', data.projectCost]);
      wsSyn.addRow(['Marge brute', data.margeBrute]);
      wsSyn.addRow(['Frais généraux', data.overhead]);
      wsSyn.addRow(['Marge nette', data.margeNette]);
      wsSyn.addRow(['% marge nette', `${data.resultPct.toFixed(1)} %`]);
      wsSyn.getColumn(1).width = 30;
      wsSyn.getColumn(2).width = 22;
      wsSyn.getColumn(3).width = 30;

      const wsProj = wb.addWorksheet('P&L par projet');
      wsProj.addRow(['Projet', 'Libellé', 'Revenus', 'Coûts projets', 'Marge brute', 'FG alloués', 'Marge nette', '% marge nette']);
      data.projects.forEach((p) => wsProj.addRow([p.code, p.label, p.revenue, p.projectCost, p.margeBrute, p.overhead, p.margeNette, Number(p.pctMarge.toFixed(2))]));
      wsProj.getRow(1).font = { bold: true };
      wsProj.columns = [
        { width: 12 }, { width: 30 }, { width: 16 }, { width: 16 },
        { width: 16 }, { width: 14 }, { width: 16 }, { width: 12 },
      ];

      data.byAxis.forEach((axis) => {
        const ws = wb.addWorksheet(`Axe ${axis.axisNumber} ${axis.axisName}`.substring(0, 31));
        ws.addRow(['Code', 'Libellé', 'Charges', 'Produits', 'Résultat', 'Budget', 'Écart']);
        axis.topCodes.forEach((c) => ws.addRow([c.code, c.label, c.charges, c.produits, c.resultat, c.budget, c.ecart]));
        ws.getRow(1).font = { bold: true };
        ws.columns = [{ width: 14 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
      });

      const wsAnom = wb.addWorksheet('Anomalies');
      wsAnom.addRow(['#', 'Anomalie / observation']).font = { bold: true };
      data.anomalies.forEach((a, i) => wsAnom.addRow([i + 1, a]));
      wsAnom.columns = [{ width: 6 }, { width: 100 }];

      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf]), `Rapport_Analytique_${year}.xlsx`);
      toast.success('Rapport exporté en Excel');
    } catch (e) {
      toast.error('Échec export', (e as Error).message);
    }
  };

  if (data.loading) {
    return <div className="py-12 text-center text-sm text-primary-500">Génération du rapport…</div>;
  }

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-base font-bold text-primary-900 dark:text-primary-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            Rapport analytique · Exercice {year}
          </h2>
          <p className="text-xs text-primary-500 mt-0.5">
            Généré le {data.generatedAt.toLocaleString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-outline text-sm"
            onClick={() => window.print()}
            title="Imprimer / PDF"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <button
            className="btn-primary text-sm"
            onClick={exportExcel}
            title="Exporter Excel"
          >
            <Download className="w-4 h-4" /> Exporter Excel
          </button>
        </div>
      </div>

      {/* Header imprimable */}
      <div className="hidden print:block border-b pb-2 mb-2">
        <h1 className="text-xl font-bold">RAPPORT ANALYTIQUE — Exercice {year}</h1>
        <p className="text-xs text-gray-600">Généré le {data.generatedAt.toLocaleString('fr-FR')}</p>
      </div>

      {/* Section 1 : Synthèse exécutive */}
      <Card title="1. Synthèse exécutive" padded>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPI label="Couverture" value={`${data.coverageRate} %`} sub={`${data.assignedLines} / ${data.totalLines} lignes`} />
          <KPI label="Revenus" value={fmtFull(data.revenue)} />
          <KPI label="Coûts projets" value={fmtFull(data.projectCost)} />
          <KPI label="Marge brute" value={fmtFull(data.margeBrute)} highlight={data.margeBrute >= 0} />
          <KPI label="Frais généraux" value={fmtFull(data.overhead)} />
          <KPI label="Marge nette" value={fmtFull(data.margeNette)} sub={`${data.resultPct.toFixed(1)} % du CA`} highlight={data.margeNette >= 0} />
        </div>
      </Card>

      {/* Section 2 : P&L par projet */}
      {data.projects.length > 0 && (
        <Card title="2. Compte de résultat par projet (WBS)" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-primary-100 dark:bg-primary-900">
                <tr>
                  <th className="text-left px-3 py-2">Projet</th>
                  <th className="text-left px-3 py-2">Libellé</th>
                  <th className="text-right px-3 py-2">Revenus</th>
                  <th className="text-right px-3 py-2">Coûts projets</th>
                  <th className="text-right px-3 py-2">Marge brute</th>
                  <th className="text-right px-3 py-2">FG alloués</th>
                  <th className="text-right px-3 py-2">Marge nette</th>
                  <th className="text-right px-3 py-2">% marge</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => {
                  const negative = p.margeNette < 0;
                  return (
                    <tr key={p.code} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="px-3 py-2 font-mono font-semibold">{p.code}</td>
                      <td className="px-3 py-2">{p.label}</td>
                      <td className="px-3 py-2 text-right num">{fmtFull(p.revenue)}</td>
                      <td className="px-3 py-2 text-right num">{fmtFull(p.projectCost)}</td>
                      <td className={clsx('px-3 py-2 text-right num font-semibold', p.margeBrute < 0 && 'text-error')}>
                        {fmtFull(p.margeBrute)}
                      </td>
                      <td className="px-3 py-2 text-right num">{fmtFull(p.overhead)}</td>
                      <td className={clsx('px-3 py-2 text-right num font-bold', negative && 'text-error')}>
                        {fmtFull(p.margeNette)}
                      </td>
                      <td className={clsx('px-3 py-2 text-right num', negative && 'text-error')}>
                        {p.pctMarge.toFixed(1)} %
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Section 3 : Top codes par axe */}
      {data.byAxis.length > 0 && (
        <Card title="3. Top 5 par axe analytique" padded>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.byAxis.map((axis) => (
              <div key={axis.axisNumber}>
                <h4 className="text-sm font-bold text-primary-800 dark:text-primary-200 mb-2">
                  Axe {axis.axisNumber} — {axis.axisName}
                </h4>
                {axis.topCodes.length === 0 ? (
                  <p className="text-xs text-primary-400 italic">Aucune affectation sur cet axe.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-primary-500 border-b border-primary-200 dark:border-primary-700">
                        <th className="text-left py-1.5">Code</th>
                        <th className="text-left py-1.5">Libellé</th>
                        <th className="text-right py-1.5">Résultat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {axis.topCodes.map((c) => (
                        <tr key={c.codeId} className="border-b border-primary-100 dark:border-primary-800">
                          <td className="py-1.5 font-mono">{c.code}</td>
                          <td className="py-1.5">{c.label}</td>
                          <td className={clsx('py-1.5 text-right num font-semibold', c.resultat < 0 && 'text-error')}>
                            {fmtFull(c.resultat)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Section 4 : Anomalies & recommandations */}
      <Card title="4. Anomalies & observations" padded>
        <ul className="space-y-2">
          {data.anomalies.map((a, i) => {
            const isOk = a.toLowerCase().includes('aucune anomalie');
            const Icon = isOk ? CheckCircle2 : AlertCircle;
            const color = isOk ? 'text-success' : 'text-warning';
            return (
              <li key={i} className="flex items-start gap-3">
                <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                <span className="text-sm text-primary-800 dark:text-primary-200">{a}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Footer imprimable */}
      <div className="hidden print:block text-[10px] text-gray-500 border-t pt-2 mt-4">
        Cockpit FnA · Rapport analytique généré le {data.generatedAt.toLocaleString('fr-FR')} · SYSCOHADA révisé 2017
      </div>
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
