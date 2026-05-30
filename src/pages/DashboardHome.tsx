/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area,
} from 'recharts';
import { ResponsivePie } from '@nivo/pie';
import { Download, Sparkles, TrendingUp, Wallet, Activity, BadgeDollarSign, ArrowDownToLine, ArrowUpFromLine, Upload, PieChart, ArrowRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCloudData } from '../hooks/useCloudData';
import { dataProvider } from '../db/provider';
import { inferBranch } from '../engine/analyticBranch';
import { PageHeader } from '../components/layout/PageHeader';
import { DataIntegrityBanner } from '../components/ui/DataIntegrityBanner';
import { SyncStatusPanel } from '../components/ui/SyncStatusPanel';
import { KpiCockpit } from '../components/ui/KpiCockpit';
import { ChartCard } from '../components/ui/ChartCard';
import { TabSwitch } from '../components/ui/TabSwitch';
import { SIGList } from '../components/ui/SIGList';
import { PerformanceGauges } from '../components/ui/PerformanceGauges';
import { AlertsCard } from '../components/ui/AlertsCard';
import { EmptyState } from '../components/ui/EmptyState';
import { useCurrentOrg, useMonthlyCA, useRatios, useStatements } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
import { ChartGradients, barGradId, areaGradId } from '../components/charts/ChartGradients';
import { fmtFull, fmtK } from '../lib/format';
import { exportStatementsPDF } from '../engine/exporter';
import { computeMonthlyBilan } from '../engine/monthly';
import {
  computeAlerts, computeCaData, computeChargesData, computeFRBFRMonthly, computeStructure,
  type FRBFRRow,
} from '../engine/synthese';
import { resolveSystem, SYSTEM_META } from '../syscohada/systems';

const nivoTheme = {
  background: 'transparent',
  text: { fontSize: 11, fill: 'rgb(var(--p-600))' },
  legends: { text: { fontSize: 11, fill: 'rgb(var(--p-600))' } },
  tooltip: { container: { background: 'rgb(var(--p-900))', color: 'rgb(var(--p-50))', fontSize: 11, borderRadius: 8, boxShadow: '0 10px 25px rgb(0 0 0 / 0.15)', padding: '8px 12px' } },
};

export default function DashboardHome() {
  const { bilan, cr, sig, balance } = useStatements();
  const org = useCurrentOrg();
  const monthly = useMonthlyCA();
  const ratios = useRatios();
  const { currentOrgId, currentYear, currentPeriodId, fromMonth, toMonth } = useApp();
  const MONTH_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const periodLabel = (fromMonth === 1 && toMonth === 12)
    ? `Cumul YTD ${currentYear}`
    : `${MONTH_SHORT[fromMonth - 1]} → ${MONTH_SHORT[toMonth - 1]} ${currentYear}`;
  const navigate = useNavigate();
  const [fr, setFR] = useState<FRBFRRow[]>([]);
  const [tab, setTab] = useState<'perf' | 'risk'>('perf');
  const ct = useChartTheme();

  useEffect(() => {
    if (!currentOrgId) return;
    computeMonthlyBilan(currentOrgId, currentYear).then((mb) => setFR(computeFRBFRMonthly(mb)));
  }, [currentOrgId, currentYear]);

  const alerts = useMemo(() => computeAlerts(ratios, balance), [ratios, balance]);

  if (!bilan || !sig) {
    // Pas de donnees : EmptyState avec CTA d'import (sinon le skeleton tourne
    // indefiniment quand l'utilisateur n'a pas encore importe son Grand Livre)
    return (
      <div>
        <PageHeader
          title="Synthèse de gestion"
          subtitle={`${org?.name ?? '—'} · Exercice ${currentYear}`}
        />
        <EmptyState
          icon={Upload}
          title="Aucune donnée à analyser"
          description="Importez votre Grand Livre pour générer automatiquement le bilan, le compte de résultat, les SIG et tous les ratios financiers SYSCOHADA."
          action={
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => navigate('/imports')}>
                <Upload className="w-4 h-4" /> Importer un Grand Livre
              </button>
              <button className="btn-outline" onClick={() => navigate('/demo')}>
                Voir la démo
              </button>
            </div>
          }
        />
      </div>
    );
  }

  const system = resolveSystem(org?.accountingSystem);
  const ca = sig.ca;
  const { fr: frV, bfr: bfrV, tn: tnV } = computeStructure(bilan, ca);
  const caData = computeCaData(monthly);
  const chargesData = computeChargesData(balance);

  // ── Filtrage des mois actifs sur les charts ──────────────────────────
  // Bug: les charts affichaient tous les 12 mois même quand les données du
  // GL s'arrêtaient en avril → ligne plate de avril à décembre, donnant
  // l'impression de valeurs aberrantes (ex: trésorerie qui semble rester
  // figée à 1.8B). Solution : trouver le dernier mois avec activité réelle
  // (CA non-zéro dans `monthly`) et borner les charts à ce mois.
  const lastActiveMonthIdx = (() => {
    let last = -1;
    for (let i = 0; i < monthly.length; i++) {
      if (monthly[i].realise && monthly[i].realise !== 0) last = i;
    }
    return last;
  })();
  // On garde au moins jusqu'au mois courant si CA détecté, sinon montre tout.
  // Note : monthly est borné par fromMonth/toMonth donc l'index correspond.
  const activeFr = lastActiveMonthIdx >= 0 ? fr.slice(0, lastActiveMonthIdx + 1) : fr;
  const treso = activeFr.map((r) => ({ mois: r.mois, solde: r.tn }));

  const caN1 = caData.reduce((s, m) => s + m.n1, 0);
  const caBudget = caData.reduce((s, m) => s + m.budget, 0);
  const budgetExec = ca && caBudget ? (ca / caBudget) * 100 : 0;
  const marge = ca ? (sig.resultat / ca) * 100 : 0;
  const currency = org?.currency ?? 'XOF';

  const handleExport = () => {
    if (!org) return;
    exportStatementsPDF({
      org: org.name,
      period: currentPeriodId ? 'Période sélectionnée' : `YTD ${currentYear}`,
      bilanActif: bilan.actif, bilanPassif: bilan.passif, cr, ratios,
    });
  };

  // Trends pour les sparklines KPI (12 derniers mois) — sanitized pour eviter NaN/Infinity
  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  const caTrend = caData.map((m) => safe(m.realise));
  const tnTrend = activeFr.map((r) => safe(r.tn));
  const totCaForRatio = caData.reduce((s, m) => s + safe(m.realise), 0) || 1;
  const sigResultat = safe(sig.resultat);
  const sigEbe = safe(sig.ebe);
  const resTrend = caData.map((m) => safe((safe(m.realise) / totCaForRatio) * sigResultat));
  const ebeTrend = caData.map((m) => safe((safe(m.realise) / totCaForRatio) * sigEbe));

  return (
    <div>
      <PageHeader
        eyebrow="Synthèse de gestion"
        title={(() => {
          try {
            const u = JSON.parse(sessionStorage.getItem('cockpit-current-user') || '{}');
            const firstName = (u.name || '').split(' ')[0];
            if (firstName) return `Bonjour ${firstName}`;
          } catch { /* ignore */ }
          return 'Synthèse de gestion';
        })()}
        subtitle={`${org?.name ? `${org.name} — ` : ''}Vue d'ensemble temps réel — bilan, compte de résultat, ratios SYSCOHADA et trésorerie.`}
        hero
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => navigate('/ai')}><Sparkles className="w-4 h-4" /> Commenter avec l'IA</button>
            <button className="btn-clay" onClick={handleExport}><Download className="w-4 h-4" /> Exporter PDF</button>
          </div>
        }
      />

      <SyncStatusPanel />
      <DataIntegrityBanner />

      {system === 'SMT' && (
        <>
          <div className="mb-4 px-3 py-2 rounded-lg bg-primary-100 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 text-xs text-primary-600 dark:text-primary-400">
            <strong>{SYSTEM_META.SMT.label}</strong> — cadrage simplifié. Pour le détail, voir onglet <em>Recettes / Dépenses</em> dans <a href="/states" className="underline">États financiers</a>.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fade-in-up">
            {(() => {
              const recettes = balance.filter((r) => r.account.startsWith('7')).reduce((s, r) => s + r.credit - r.debit, 0);
              const depenses = balance.filter((r) => r.account.startsWith('6')).reduce((s, r) => s + r.debit - r.credit, 0);
              const soldeNet = recettes - depenses;
              return <>
                <KpiCockpit label="Recettes" value={recettes} currency={currency} tone="green" icon={ArrowDownToLine} />
                <KpiCockpit label="Dépenses" value={depenses} currency={currency} tone="red" icon={ArrowUpFromLine} />
                <KpiCockpit label="Solde net" value={soldeNet} currency={currency} tone={soldeNet >= 0 ? 'green' : 'red'} icon={TrendingUp} />
                <KpiCockpit label="Trésorerie" value={tnV} currency={currency} tone="blue" icon={Wallet} />
              </>;
            })()}
          </div>
        </>
      )}

      {system !== 'SMT' && (
        <TabSwitch
          tabs={[
            { key: 'perf', label: 'Performance' },
            { key: 'risk', label: 'Structure & Risques' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      {system !== 'SMT' && tab === 'perf' && <>
        {/* Hero KPI grid — 4 cards uniformes premium avec icone coloree + sparkline gradient */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fade-in-up">
          <KpiCockpit
            label="Chiffre d'affaires"
            value={ca}
            previous={caN1}
            currency={currency}
            tone="orange"
            icon={TrendingUp}
            subtitle={caBudget ? `Budget : ${fmtK(caBudget)} (${budgetExec.toFixed(0)} % exécuté)` : `Cumul ${periodLabel}`}
            trend={caTrend}
          />
          <KpiCockpit
            label="Résultat net"
            value={sig.resultat}
            currency={currency}
            tone={sig.resultat >= 0 ? 'green' : 'red'}
            icon={BadgeDollarSign}
            subtitle={`Marge nette : ${marge.toFixed(1)} %`}
            trend={resTrend}
          />
          <KpiCockpit
            label="EBE"
            value={sig.ebe}
            currency={currency}
            tone="amber"
            icon={Activity}
            subtitle={`Taux EBE : ${ca ? ((sig.ebe / ca) * 100).toFixed(1) : 0} %`}
            trend={ebeTrend}
          />
          <KpiCockpit
            label="Trésorerie nette"
            value={tnV}
            currency={currency}
            tone={tnV >= 0 ? 'blue' : 'red'}
            icon={Wallet}
            subtitle={`FR ${fmtK(frV)} · BFR ${fmtK(bfrV)}`}
            trend={tnTrend}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <ChartCard title="Chiffre d'Affaires" subtitle="Réalisé · Budget N · Budget N-1 (mensuel)" className="lg:col-span-2" accent={ct.at(0)}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={caData} barGap={2} barCategoryGap="30%">
                <ChartGradients />
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="mois" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <Bar dataKey="realise" name="Réalisé" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="budget" name="Budget N" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="n1" name="Budget N-1" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Répartition des Charges" subtitle="Top postes de dépenses" accent={ct.at(1)}>
            <div style={{ height: 230 }}>
              {(() => {
                // Filtre rigoureux : NaN/Infinity/0 ignorés
                const data = chargesData
                  .filter((d) => Number.isFinite(d.value) && d.value > 0)
                  .map((d) => ({ id: d.name, label: d.name, value: d.value }));
                if (data.length === 0) {
                  return <div className="h-full flex items-center justify-center text-xs text-primary-400">Aucune charge à afficher</div>;
                }
                const total = data.reduce((s, x) => s + x.value, 0);
                // MEME palette monochrome/harmonique que "Structure de l'Actif" :
                // gradient du primary-900 (foncé) au primary-400 (clair) — donne un
                // dégradé visuel cohérent au lieu de couleurs disparates.
                const palette = [ct.at(0), ct.at(2), ct.at(3), ct.at(4), ct.at(5), ct.at(6)].slice(0, data.length);
                return (
                  <ResponsivePie
                    data={data}
                    margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                    innerRadius={0.6}
                    padAngle={1}
                    cornerRadius={4}
                    colors={palette}
                    borderWidth={2}
                    borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
                    enableArcLinkLabels={false}
                    arcLabelsTextColor="#fff"
                    arcLabel={(d) => `${Math.round((d.value / total) * 100)} %`}
                    arcLabelsSkipAngle={10}
                    valueFormat={(v) => fmtFull(v)}
                    theme={nivoTheme}
                    animate={false}
                    legends={[
                      { anchor: 'bottom', direction: 'row', translateY: 30, itemWidth: 110, itemHeight: 14, itemTextColor: 'rgb(var(--p-600))', symbolSize: 10, symbolShape: 'circle' },
                    ]}
                  />
                );
              })()}
            </div>
          </ChartCard>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <SIGList sig={sig} ca={ca} />
        </div>
      </>}

      {system !== 'SMT' && tab === 'risk' && <>
        {fr.length === 0 ? (
          <div className="card p-8 text-center mb-4 animate-fade-in-up">
            <p className="text-sm text-primary-500">Données mensuelles en cours de calcul depuis le Grand Livre…</p>
            <p className="text-xs text-primary-400 mt-2">Si rien n'apparaît, vérifiez que votre import contient des écritures réparties sur plusieurs périodes.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 animate-fade-in-up">
          <ChartCard title="Évolution de la Trésorerie Nette" subtitle="Cumul mensuel YTD — calculé depuis le Grand Livre" accent={ct.at(0)}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={treso}>
                <ChartGradients />
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="mois" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} />
                <Area type="monotone" dataKey="solde" stroke={ct.at(0)} strokeWidth={2.5} fill={`url(#${areaGradId(0)})`} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="FR / BFR / Trésorerie Nette" subtitle="Équilibre du cycle d'exploitation — données réelles GL" accent={ct.at(1)}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={activeFr}>
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="mois" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="fr" name="FR" stroke={ct.at(0)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="bfr" name="BFR" stroke={ct.at(1)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="tn" name="TN" stroke={ct.at(2)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <PerformanceGauges budgetExec={budgetExec} marge={marge} ratios={ratios} />
          <AlertsCard alerts={alerts} />
        </div>
      </>}

      <AnalyticalSummary orgId={currentOrgId} year={currentYear} />

      <div className="mt-5 pt-3 border-t border-primary-200 dark:border-primary-800 flex justify-between items-center text-[11px] text-primary-400">
        <span>Dernière synchronisation : {new Date().toLocaleString('fr-FR')}</span>
        <span>Cockpit FnA v0.2 — SYSCOHADA révisé 2017</span>
      </div>
    </div>
  );
}

/**
 * AnalyticalSummary — bloc inséré dans la Vue d'ensemble si l'utilisateur
 * utilise la comptabilité analytique (axes ou assignments existent).
 *
 * Affiche : couverture, top projet (marge nette), nb projets actifs,
 * et un lien rapide vers la Vue WBS / Diagnostic Couverture.
 */
function AnalyticalSummary({ orgId, year }: { orgId: string; year: number }) {
  const { data } = useCloudData<{
    used: boolean;
    coverageRate: number;
    activeAxes: number;
    activeRules: number;
    topProject: { code: string; label: string; margin: number } | null;
    projectCount: number;
    eligibleEntries: number;
  }>(
    async () => {
      if (!orgId) return { used: false, coverageRate: 0, activeAxes: 0, activeRules: 0, topProject: null, projectCount: 0, eligibleEntries: 0 };
      const [axes, assignments, rules, codes, periods, allEntries] = await Promise.all([
        dataProvider.getAnalyticAxes(orgId),
        dataProvider.getAnalyticAssignments(orgId),
        dataProvider.getAnalyticRules(orgId),
        dataProvider.getAnalyticCodes(orgId),
        dataProvider.getPeriods(orgId),
        dataProvider.getGLEntries({ orgId }),
      ]);
      const activeAxes = axes.filter((a) => a.active).length;
      const used = activeAxes > 0 || assignments.length > 0;
      if (!used) return { used: false, coverageRate: 0, activeAxes: 0, activeRules: 0, topProject: null, projectCount: 0, eligibleEntries: 0 };

      const yearPeriodIds = new Set(periods.filter((p) => p.year === year && p.month >= 1).map((p) => p.id));
      const yearEntries = allEntries.filter((e) => yearPeriodIds.has(e.periodId));
      const eligible = yearEntries.filter((e) => e.account.startsWith('6') || e.account.startsWith('7'));

      const codeById = new Map(codes.map((c) => [c.id, c]));
      const assByEntry = new Map<number, typeof assignments>();
      for (const a of assignments) {
        if (!a.glEntryId) continue;
        const arr = assByEntry.get(a.glEntryId) ?? [];
        arr.push(a);
        assByEntry.set(a.glEntryId, arr);
      }

      const eligibleCount = eligible.length;
      const assignedSet = new Set<number>();
      for (const e of eligible) {
        if (e.id !== undefined && assByEntry.has(e.id)) assignedSet.add(e.id);
      }
      const coverageRate = eligibleCount > 0 ? Math.round((assignedSet.size / eligibleCount) * 100) : 0;

      // Calcul top projet (marge nette = revenus - coûts - FG par projet)
      const byProject = new Map<string, { code: string; label: string; revenue: number; cost: number }>();
      for (const e of yearEntries) {
        const ass = assByEntry.get(e.id ?? -1) ?? [];
        const branch = inferBranch(e, { assignments: ass });
        if (!branch) continue;
        const amount = branch === 'revenue' ? (e.credit - e.debit) : (e.debit - e.credit);
        if (Math.abs(amount) < 0.005) continue;
        const projAss = ass.find((a) => a.axisNumber === 1);
        const projCode = projAss ? codeById.get(projAss.codeId) : undefined;
        if (!projCode) continue;
        const key = projCode.code;
        let row = byProject.get(key);
        if (!row) {
          row = { code: projCode.code, label: projCode.shortLabel, revenue: 0, cost: 0 };
          byProject.set(key, row);
        }
        if (branch === 'revenue') row.revenue += amount;
        else row.cost += amount;
      }
      const projects = Array.from(byProject.values()).map((p) => ({ ...p, margin: p.revenue - p.cost }));
      const topProject = projects.sort((a, b) => b.margin - a.margin)[0] ?? null;

      return {
        used: true,
        coverageRate,
        activeAxes,
        activeRules: rules.filter((r) => r.active).length,
        topProject: topProject ? { code: topProject.code, label: topProject.label, margin: topProject.margin } : null,
        projectCount: projects.length,
        eligibleEntries: eligibleCount,
      };
    },
    [orgId, year],
    {
      initial: { used: false, coverageRate: 0, activeAxes: 0, activeRules: 0, topProject: null, projectCount: 0, eligibleEntries: 0 },
      tag: ['analyticAxes', 'analyticAssignments', 'gl'],
    },
  );

  if (!data.used) return null;

  const lowCoverage = data.coverageRate < 70;

  return (
    <div className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-5 mt-5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <PieChart className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100">Comptabilité analytique</h3>
            <p className="text-[11px] text-primary-500">Pilotage par projet / centre / ressource</p>
          </div>
        </div>
        <Link to="/analytical" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
          Ouvrir le module <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-primary-50 dark:bg-primary-900/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-primary-500">Couverture</p>
          <p className={`num text-xl font-bold mt-0.5 ${lowCoverage ? 'text-warning' : 'text-success'}`}>
            {data.coverageRate} %
          </p>
          <p className="text-[10px] text-primary-400">{data.eligibleEntries.toLocaleString('fr-FR')} lignes éligibles</p>
        </div>
        <div className="rounded-lg bg-primary-50 dark:bg-primary-900/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-primary-500">Axes / Règles</p>
          <p className="num text-xl font-bold mt-0.5">{data.activeAxes} / {data.activeRules}</p>
          <p className="text-[10px] text-primary-400">configurés actifs</p>
        </div>
        <div className="rounded-lg bg-primary-50 dark:bg-primary-900/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-primary-500">Projets actifs</p>
          <p className="num text-xl font-bold mt-0.5">{data.projectCount}</p>
          <p className="text-[10px] text-primary-400">avec mouvement {year}</p>
        </div>
        {data.topProject ? (
          <div className="rounded-lg bg-success/10 p-3">
            <p className="text-[10px] uppercase tracking-wider text-success">Top projet</p>
            <p className="text-sm font-bold text-primary-900 dark:text-primary-100 mt-0.5 truncate">{data.topProject.code}</p>
            <p className={`num text-xs mt-0.5 ${data.topProject.margin >= 0 ? 'text-success' : 'text-error'}`}>
              {fmtFull(data.topProject.margin)}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-warning/10 p-3">
            <p className="text-[10px] uppercase tracking-wider text-warning">Pas de projet</p>
            <p className="text-xs mt-1 text-primary-700 dark:text-primary-300">
              Aucune affectation sur l'axe 1 (Projet).
            </p>
          </div>
        )}
      </div>

      {lowCoverage && (
        <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-warning/10 border-l-2 border-warning">
          <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-primary-700 dark:text-primary-300">
            La couverture analytique est faible ({data.coverageRate} %).{' '}
            <Link to="/analytical/coverage" className="text-accent underline hover:opacity-80">
              Voir les écritures non ventilées →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
