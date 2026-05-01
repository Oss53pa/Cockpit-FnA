/**
 * CAF — Capacité d'Autofinancement.
 * CAF = Résultat + dotations - reprises - plus-values cessions.
 * Indicateur clé pour banquier (capacité de remboursement).
 */
import { useEffect, useState } from 'react';
import { Banknote, TrendingUp, Activity, Coins } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { computeMonthlyTFT } from '../engine/flows';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';

export default function CAFPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig } = useStatements();
  const ct = useChartTheme();
  const [tft, setTft] = useState<Awaited<ReturnType<typeof computeMonthlyTFT>> | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    computeMonthlyTFT(currentOrgId, currentYear).then(setTft);
  }, [currentOrgId, currentYear]);

  if (!tft || !sig) return <div className="py-20 text-center text-primary-400">Calcul en cours…</div>;

  const findVals = (code: string) => tft.lines.find((l) => l.code === code)?.values ?? Array(12).fill(0);
  const findYtd = (code: string) => tft.lines.find((l) => l.code === code)?.ytd ?? 0;

  const cafgYtd = findYtd('FA');
  const dotationsYtd = findYtd('FB');
  const reprisesYtd = findYtd('FC');
  const plusValueYtd = findYtd('FD');

  const chartData = tft.months.map((m, i) => ({
    mois: m,
    Résultat: findVals('FA')[i] - findVals('FB')[i] + findVals('FC')[i] + findVals('FD')[i],
    Dotations: findVals('FB')[i],
    Reprises: -findVals('FC')[i],
    Cessions: -findVals('FD')[i],
    'CAF nette': findVals('FA')[i],
  }));

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Capacité d'Autofinancement (CAFG)"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Source du financement interne`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          variant="hero"
          title="CAFG YTD"
          value={fmtK(cafgYtd)}
          unit="XOF"
          icon={<Banknote className="w-5 h-5" strokeWidth={2} />}
          subValue="Capacité d'autofinancement globale"
        />
        <KPICard title="Résultat net" value={fmtK(sig.resultat)} unit="XOF" icon={<Coins className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="+ Dotations" value={fmtK(dotationsYtd)} unit="XOF" icon={<Activity className="w-4 h-4" strokeWidth={2} />} subValue="Charges non décaissées" />
        <KPICard title="− Reprises & cessions" value={fmtK(reprisesYtd + plusValueYtd)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue="Produits non encaissés" inverse />
      </div>

      <ChartCard title="Décomposition CAF par mois" subtitle="Résultat + dotations − reprises − cessions" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} stackOffset="sign">
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
            <ReferenceLine y={0} stroke={ct.grid} />
            <Bar dataKey="Résultat" stackId="caf" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Dotations" stackId="caf" fill={ct.at(2)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Reprises" stackId="caf" fill={ct.at(3)} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Cessions" stackId="caf" fill={ct.at(4)} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Lecture" accent={ct.at(2)}>
        <div className="text-sm space-y-3 text-primary-700 dark:text-primary-300">
          <p><strong>La CAFG</strong> représente le cash que l'entreprise génère par son activité, indépendamment de ses choix d'investissement et de financement. Elle est utilisée pour :</p>
          <ul className="space-y-1 ml-5 list-disc text-primary-600 dark:text-primary-400">
            <li>Rembourser les emprunts (capacité de remboursement = dette / CAF en années)</li>
            <li>Distribuer des dividendes</li>
            <li>Autofinancer les investissements</li>
          </ul>
          <p className="text-xs text-primary-500 italic">Formule SYSCOHADA : Résultat net + Dotations aux amortissements et provisions − Reprises sur amortissements et provisions − Plus-values nettes sur cessions.</p>
        </div>
      </ChartCard>
    </div>
  );
}
