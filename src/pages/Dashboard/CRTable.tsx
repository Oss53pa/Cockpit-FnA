/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── CRSecTable + CRSecDetail ─────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import clsx from 'clsx';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useBudgetActual } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { bySection, loadLabels } from '../../engine/budgetActual';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { Diamond, Circle, Layers, Percent, Activity, Star, Target } from 'lucide-react';

// ── CRSecTable ────────────────────────────────────────────────────────
export function CRSecTable({ sectionKey }: { sectionKey: any }) {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const sections = bySection(rows, currentOrgId);
  const labels = loadLabels(currentOrgId);
  const [n1Map, setN1Map] = useState<Map<string, number>>(new Map());
  const [monthlyMap, setMonthlyMap] = useState<Map<string, Array<{ realise: number; budget: number; n1: number }>>>(new Map());
  const currentMonth = new Date().getMonth();
  const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  useEffect(() => {
    import('../../engine/budgetActual').then(({ computeBudgetActualMonthly }) => {
      computeBudgetActualMonthly(currentOrgId, currentYear).then((raw) => {
        const n1m = new Map<string, number>();
        const mm = new Map<string, Array<{ realise: number; budget: number; n1: number }>>();
        for (const r of raw.rows) { n1m.set(r.code, r.totalN1); mm.set(r.code, r.months); }
        setN1Map(n1m);
        setMonthlyMap(mm);
      });
    });
  }, [currentOrgId, currentYear]);
  const sec = sections.find((s) => s.section === sectionKey);
  const [open, setOpen] = useState(true);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;
  if (!sec) return <div className="py-12 text-center text-primary-500">Section introuvable</div>;

  const m = currentMonth > 0 ? currentMonth - 1 : 0;
  const secMonth = sec.rows.reduce((acc, r) => {
    const md = monthlyMap.get(r.code);
    if (!md) return acc;
    return { actualM: acc.actualM + md[m].realise, budgetM: acc.budgetM + md[m].budget, n1M: acc.n1M + md[m].n1 };
  }, { actualM: 0, budgetM: 0, n1M: 0 });
  const n1Ytd = sec.rows.reduce((s, r) => s + (n1Map.get(r.code) ?? 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Comptes" value={String(sec.rows.length)} icon={<Layers className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon={<Circle className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
      </div>

      <ChartCard title={`Mensuel — ${labels[sec.section]} (${MONTHS_SHORT[m]})`} className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="text-left py-1.5 px-2 font-semibold" rowSpan={2}>Compte</th>
                <th className="text-center py-1 px-1 font-semibold border-l border-primary-200 dark:border-primary-700" colSpan={3}>Mois ({MONTHS_SHORT[m]})</th>
                <th className="text-center py-1 px-1 font-semibold border-l-2 border-primary-300 dark:border-primary-600" colSpan={3}>Year-to-Date</th>
              </tr>
              <tr className="text-[10px] text-primary-500">
                <th className="py-1 px-1 text-right border-l border-primary-200 dark:border-primary-700">Actual</th>
                <th className="py-1 px-1 text-right">Budget</th>
                <th className="py-1 px-1 text-right">N-1</th>
                <th className="py-1 px-1 text-right border-l-2 border-primary-300 dark:border-primary-600">Actual</th>
                <th className="py-1 px-1 text-right">Budget</th>
                <th className="py-1 px-1 text-right">N-1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {sec.rows.slice(0, 15).map((r) => {
                const md = monthlyMap.get(r.code);
                const n1v = n1Map.get(r.code) ?? 0;
                return (
                  <tr key={r.code} className="hover:bg-primary-50 dark:hover:bg-primary-900/50">
                    <td className="py-1.5 px-2"><span className="font-mono text-primary-400 mr-1">{r.code}</span>{r.label}</td>
                    <td className="py-1.5 px-1 text-right num border-l border-primary-200 dark:border-primary-700">{md ? fmtFull(md[m].realise) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-500">{md ? fmtFull(md[m].budget) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-400">{md ? fmtFull(md[m].n1) : '—'}</td>
                    <td className="py-1.5 px-1 text-right num font-semibold border-l-2 border-primary-300 dark:border-primary-600">{fmtFull(r.realise)}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                    <td className="py-1.5 px-1 text-right num text-primary-400">{n1v ? fmtFull(n1v) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold bg-primary-100 dark:bg-primary-800">
                <td className="py-1.5 px-2">TOTAL</td>
                <td className="py-1.5 px-1 text-right num border-l border-primary-200 dark:border-primary-700">{fmtFull(secMonth.actualM)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(secMonth.budgetM)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-400">{fmtFull(secMonth.n1M)}</td>
                <td className="py-1.5 px-1 text-right num border-l-2 border-primary-300 dark:border-primary-600">{fmtFull(sec.totalRealise)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-500">{fmtFull(sec.totalBudget)}</td>
                <td className="py-1.5 px-1 text-right num text-primary-400">{fmtFull(n1Ytd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard title={`Détail annuel — ${labels[sec.section]}`}
        action={
          <div className="flex gap-1">
            <button onClick={() => setOpen(true)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
            <span className="text-primary-300">·</span>
            <button onClick={() => setOpen(false)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
              <tr>
                <th className="text-left py-2 w-8"></th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Réalisé</th>
                <th className="text-right py-2 px-3">Budget</th>
                <th className="text-right py-2 px-3">Écart</th>
                <th className="text-right py-2 px-3">Var %</th>
                <th className="text-right py-2 px-3">N-1</th>
                <th className="text-right py-2 px-3">Var N-1</th>
                <th className="text-right py-2 px-3">% section</th>
                <th className="text-center py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {open && sec.rows.map((r) => { const n1v = n1Map.get(r.code) ?? 0; const varN1v = n1v ? ((r.realise - n1v) / Math.abs(n1v) * 100) : 0; return (
                <tr key={r.code} className="border-b border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-900">
                  <td></td>
                  <td className="py-2 px-3 num font-mono">{r.code}</td>
                  <td className="py-2 px-3 text-xs">{r.label}</td>
                  <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.realise)}</td>
                  <td className="py-2 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                  <td className={clsx('py-2 px-3 text-right num',
                    r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                    {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                  </td>
                  <td className="py-2 px-3 text-right num text-xs">{r.ecartPct >= 0 ? '+' : ''}{r.ecartPct.toFixed(1)} %</td>
                  <td className="py-2 px-3 text-right num text-primary-400">{n1v ? fmtFull(n1v) : '—'}</td>
                  <td className={clsx('py-2 px-3 text-right num text-xs', varN1v === 0 ? 'text-primary-400' : (r.isCharge ? (varN1v <= 0 ? 'text-success' : 'text-error') : (varN1v >= 0 ? 'text-success' : 'text-error')))}>  {n1v ? `${varN1v >= 0 ? '+': ''}${varN1v.toFixed(1)}%` : '—'}</td>
                  <td className="py-2 px-3 text-right num text-xs text-primary-500">{sec.totalRealise ? ((r.realise / sec.totalRealise) * 100).toFixed(1) : 0} %</td>
                  <td className="py-2 px-3 text-center">
                    <span className={clsx('text-xs font-semibold',
                      r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : 'text-primary-400')}>
                      {r.status === 'favorable' ? '✓' : r.status === 'defavorable' ? '⚠' : '—'}
                    </span>
                  </td>
                </tr>
              ); })}
              <tr className="bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold">
                <td className="py-2 pl-2 w-8 text-center">
                  <button onClick={() => setOpen(!open)} className="w-5 h-5 rounded hover:bg-primary-700 dark:hover:bg-primary-300 text-xs font-bold" title={open ? 'Replier' : 'Déplier'}>
                    {open ? '−' : '+'}
                  </button>
                </td>
                <td colSpan={2} className="py-2 px-3">TOTAL SECTION ({sec.rows.length} comptes)</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalRealise)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(sec.totalBudget)}</td>
                <td className="py-2 px-3 text-right num">{sec.totalEcart >= 0 ? '+' : ''}{fmtFull(sec.totalEcart)}</td>
                <td className="py-2 px-3 text-right num">{sec.ecartPct.toFixed(1)} %</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="mt-4 card p-3 text-xs text-primary-500">
        Pour la version avec graphiques (KPIs + évolution + concentration + top 10), allez dans le <strong>Catalogue → CR — Dashboards</strong>.
      </div>
    </>
  );
}

// ── CRSecDetail ───────────────────────────────────────────────────────
export function CRSecDetail({ sectionKey }: { sectionKey: any }) {
  const rows = useBudgetActual();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const sections = bySection(rows, currentOrgId);
  const sec = sections.find((s) => s.section === sectionKey);
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId || !sec) return;
    import('../../engine/analytics').then(({ monthlyByPrefix }) => {
      const prefixes = sec.rows.map((r) => r.code.substring(0, 3));
      const uniquePrefixes = Array.from(new Set(prefixes));
      monthlyByPrefix(currentOrgId, currentYear, uniquePrefixes).then(setMonthly);
    });
  }, [currentOrgId, currentYear, sec]);

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;
  if (!sec) return <div className="py-12 text-center text-primary-500">Section introuvable</div>;

  const totalProduits = sections.filter((s) => !s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const totalCharges = sections.filter((s) => s.isCharge).reduce((acc, s) => acc + s.totalRealise, 0);
  const ref = sec.isCharge ? totalCharges : totalProduits;
  const pctActivite = ref ? (sec.totalRealise / ref) * 100 : 0;

  const top10 = [...sec.rows].sort((a, b) => Math.abs(b.realise) - Math.abs(a.realise)).slice(0, 10);
  const evolMensuelle = monthly.labels.map((m, i) => ({ mois: m, valeur: monthly.values[i] || 0 }));
  const moyMensuelle = monthly.values.length ? monthly.values.reduce((a, b) => a + b, 0) / monthly.values.length : 0;

  const top3 = sec.rows.slice(0, 3).reduce((s, r) => s + r.realise, 0);
  const reste = sec.totalRealise - top3;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Total réalisé" value={fmtK(sec.totalRealise)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Total budget" value={fmtK(sec.totalBudget)} unit="XOF" icon={<Circle className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Écart" value={fmtK(sec.totalEcart)} unit="XOF" subValue={`${sec.ecartPct.toFixed(1)} %`} icon={sec.totalEcart >= 0 ? '↑' : '↓'} />
        <KPICard title="% de l'activité" value={`${pctActivite.toFixed(1)} %`} subValue={sec.isCharge ? 'des charges totales' : 'des produits totaux'} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Nombre de comptes" value={String(sec.rows.length)} icon={<Layers className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Moyenne mensuelle" value={fmtK(moyMensuelle)} unit="XOF" icon={<Activity className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Plus gros poste" value={top10[0]?.label.substring(0, 20) ?? '—'} subValue={top10[0] ? fmtK(top10[0].realise) : ''} icon={<Star className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Concentration top 3" value={sec.totalRealise ? `${((top3 / sec.totalRealise) * 100).toFixed(1)} %` : '—'} icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Évolution mensuelle de la section" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={evolMensuelle}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="valeur" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Concentration : Top 3 vs autres">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={[
                { name: 'Top 3 comptes', value: top3 },
                { name: `${sec.rows.length - 3} autres comptes`, value: Math.max(reste, 0) },
              ]} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value"
                label={(p: any) => `${((p.value / Math.max(sec.totalRealise, 1)) * 100).toFixed(0)}%`}>
                <Cell fill={ct.bar} /><Cell fill={ct.barAlt} />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Top 10 comptes">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="code" tick={{ fontSize: 9 }} width={80} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="realise" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Réalisé vs Budget — Top 10">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={top10}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="code" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="realise" name="Réalisé" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
              <Bar dataKey="budget" name="Budget" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card p-4 text-xs text-primary-500">
        Pour le <strong>tableau détaillé</strong> avec collapsibles, ouvrez la version <strong>Table</strong> dans le Catalogue → CR — Tables.
      </div>
    </>
  );
}
