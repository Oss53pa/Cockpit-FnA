/**
 * Tableau de bord hebdomadaire — flash CA / cash / alertes pour Direction.
 */
import { TrendingUp, Wallet, AlertTriangle, Target } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useStatements, useRatios, useMonthlyCA, useCurrentOrg } from '../hooks/useFinancials';
import { fmtFull, fmtK, fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';

export default function WeeklyDashboardPage() {
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const monthly = useMonthlyCA();
  const ct = useChartTheme();

  if (!sig || !bilan) return <div className="py-20 text-center text-primary-400">Chargement…</div>;

  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const tn = get(bilan.actif, '_BT') - get(bilan.passif, 'DV');
  const alertCount = ratios.filter((r) => r.status !== 'good').length;
  const margeNette = sig.ca ? (sig.resultat / sig.ca) * 100 : 0;
  const week = `Semaine ${Math.ceil(new Date().getDate() / 7)} de ${new Date().toLocaleDateString('fr-FR', { month: 'long' })}`;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/weekly" />
      <PageHeader title="Flash hebdomadaire" subtitle={`${org?.name ?? '—'} · ${week}`} />

      {/* KPI flash 4 colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard variant="hero" title="CA YTD" value={fmtK(sig.ca)} unit="XOF" icon={<TrendingUp className="w-5 h-5" />} subValue={`${fmtPct(margeNette)} marge`} />
        <KPICard title="Trésorerie nette" value={fmtK(tn)} unit="XOF" icon={<Wallet className="w-4 h-4" />} />
        <KPICard title="Résultat" value={fmtK(sig.resultat)} unit="XOF" icon={<Target className="w-4 h-4" />} />
        <KPICard title="Alertes" value={String(alertCount)} icon={<AlertTriangle className="w-4 h-4" />} subValue={`/ ${ratios.length} ratios`} inverse />
      </div>

      {/* Mini chart évolution CA */}
      <ChartCard title="Évolution CA — derniers mois" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <defs>
              <linearGradient id="weekly-ca" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ct.accent} stopOpacity={0.5} />
                <stop offset="100%" stopColor={ct.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="mois" {...ct.axisProps} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} />
            <Area type="monotone" dataKey="ca" stroke={ct.accent} strokeWidth={2.5} fill="url(#weekly-ca)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top alertes */}
      {alertCount > 0 && (
        <ChartCard title={`Alertes prioritaires (${alertCount})`} accent={ct.at(1)}>
          <ul className="space-y-2 text-sm">
            {ratios.filter((r) => r.status !== 'good').slice(0, 5).map((a) => (
              <li key={a.code} className="flex items-start gap-3 p-2 rounded-lg bg-primary-50/50 dark:bg-primary-950/50">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.status === 'alert' ? 'bg-error' : 'bg-warning'}`} />
                <div className="flex-1">
                  <p className="font-medium">{a.label}</p>
                  <p className="text-xs text-primary-500">Valeur : {a.value.toFixed(2)} {a.unit} · Cible : {a.target}</p>
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}
    </div>
  );
}
