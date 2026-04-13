import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { Download, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { TabSwitch } from '../components/ui/TabSwitch';
import { SIGList } from '../components/ui/SIGList';
import { PerformanceGauges } from '../components/ui/PerformanceGauges';
import { AlertsCard } from '../components/ui/AlertsCard';
import { useCurrentOrg, useMonthlyCA, useRatios, useStatements } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
import { C } from '../lib/colors';
import { fmtFull, fmtK } from '../lib/format';
import { exportStatementsPDF } from '../engine/exporter';
import { computeMonthlyBilan } from '../engine/monthly';
import {
  computeAlerts, computeCaData, computeChargesData, computeFRBFRMonthly, computeStructure,
  type FRBFRRow,
} from '../engine/synthese';
import { resolveSystem, SYSTEM_META } from '../syscohada/systems';

export default function DashboardHome() {
  const { bilan, cr, sig, balance } = useStatements();
  const org = useCurrentOrg();
  const monthly = useMonthlyCA();
  const ratios = useRatios();
  const { currentOrgId, currentYear, currentPeriodId } = useApp();
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
    return <div className="py-20 text-center text-primary-500">Chargement des données financières…</div>;
  }

  const system = resolveSystem(org?.accountingSystem);
  const ca = sig.ca;
  const { fr: frV, bfr: bfrV, tn: tnV, jCA } = computeStructure(bilan, ca);
  const caData = computeCaData(monthly);
  const chargesData = computeChargesData(balance);
  const treso = fr.map((r) => ({ mois: r.mois, solde: r.tn }));

  const caN1 = caData.reduce((s, m) => s + m.n1, 0);
  const caBudget = caData.reduce((s, m) => s + m.budget, 0);
  const variationCA = caN1 ? ((ca - caN1) / Math.abs(caN1)) * 100 : 0;
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

  return (
    <div>
      <PageHeader
        title="Synthèse de gestion"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · ${currentPeriodId ? 'Période sélectionnée' : 'Cumul YTD'}`}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => navigate('/ai')}><Sparkles className="w-4 h-4" /> Commenter avec l'IA</button>
            <button className="btn-primary" onClick={handleExport}><Download className="w-4 h-4" /> Exporter PDF</button>
          </div>
        }
      />

      {system === 'SMT' && (
        <>
          <div className="mb-4 px-3 py-2 rounded-lg bg-primary-100 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 text-xs text-primary-600 dark:text-primary-400">
            <strong>{SYSTEM_META.SMT.label}</strong> — cadrage simplifié. Pour le détail, voir onglet <em>Recettes / Dépenses</em> dans <a href="/states" className="underline">États financiers</a>.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {(() => {
              const recettes = balance.filter((r) => r.account.startsWith('7')).reduce((s, r) => s + r.credit - r.debit, 0);
              const depenses = balance.filter((r) => r.account.startsWith('6')).reduce((s, r) => s + r.debit - r.credit, 0);
              const soldeNet = recettes - depenses;
              return <>
                <KPICard title="Recettes" value={fmtK(recettes)} unit={currency} variation={0} vsLabel="" icon="R" color={C.primary} />
                <KPICard title="Dépenses" value={fmtK(depenses)} unit={currency} variation={0} vsLabel="" icon="D" color={C.secondary} />
                <KPICard title="Solde net" value={fmtK(soldeNet)} unit={currency} variation={0} vsLabel="" icon="S" color={C.accent1} />
                <KPICard title="Trésorerie" value={fmtK(tnV)} unit={currency} variation={0} vsLabel="" icon="T" color={C.accent2} />
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5">
          <KPICard title="Chiffre d'Affaires" value={fmtK(ca)} unit={currency} variation={variationCA} vsLabel="vs N-1" icon="CA" color={C.primary} subValue={`Budget : ${fmtK(caBudget)} (${budgetExec.toFixed(0)} %)`} />
          <KPICard title="Résultat Net" value={fmtK(sig.resultat)} unit={currency} variation={0} vsLabel="vs N-1" icon="RN" color={C.secondary} subValue={`Marge nette : ${marge.toFixed(1)} %`} />
          <KPICard title="EBE" value={fmtK(sig.ebe)} unit={currency} variation={0} vsLabel="vs Budget" icon="⚡" color={C.warning} subValue={`Taux EBE : ${ca ? ((sig.ebe / ca) * 100).toFixed(1) : 0} %`} />
          <KPICard title="Trésorerie Nette" value={fmtK(tnV)} unit={currency} variation={0} vsLabel="vs M-1" icon="TN" color={C.accent1} subValue={`FR : ${fmtK(frV)} · BFR : ${fmtK(bfrV)}`} />
          <KPICard title="BFR" value={fmtK(bfrV)} unit={currency} variation={0} vsLabel="vs N-1" icon="BF" color={C.accent4} subValue={`${jCA.toFixed(1)} jours de CA`} inverse />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <ChartCard title="Chiffre d'Affaires — Réalisé vs Budget vs N-1 (mensuel)" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={caData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: C.dark }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="realise" name="Réalisé" fill={ct.at(0)} radius={[3, 3, 0, 0]} />
                <Bar dataKey="budget" name="Budget" fill={ct.at(1)} radius={[3, 3, 0, 0]} />
                <Bar dataKey="n1" name="N-1" fill={ct.at(2)} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="🍩 Répartition des Charges">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={chargesData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                  label={(p: any) => `${p.name} ${p.pct}%`} labelLine={false} fontSize={10}>
                  {chargesData.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <SIGList sig={sig} ca={ca} />
      </>}

      {system !== 'SMT' && tab === 'risk' && <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Évolution de la Trésorerie Nette">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={treso}>
                <defs>
                  <linearGradient id="colorTreso" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.at(0)} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={ct.at(0)} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="solde" stroke={ct.at(0)} strokeWidth={2.5} fill="url(#colorTreso)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="FR / BFR / Trésorerie Nette">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={fr}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="fr" name="FR" stroke={ct.at(0)} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="bfr" name="BFR" stroke={ct.at(1)} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="tn" name="TN" stroke={ct.at(2)} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PerformanceGauges budgetExec={budgetExec} marge={marge} ratios={ratios} />
          <AlertsCard alerts={alerts} />
        </div>
      </>}

      <div className="mt-5 pt-3 border-t border-primary-200 dark:border-primary-800 flex justify-between items-center text-[11px] text-primary-400">
        <span>Dernière synchronisation : {new Date().toLocaleString('fr-FR')}</span>
        <span>CockPit F&amp;A v0.2 — SYSCOHADA révisé 2017</span>
      </div>
    </div>
  );
}
