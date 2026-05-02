/**
 * Rolling Forecast — projection trésorerie 30/60/90 jours basée sur les flux historiques.
 * Modèle Prophet-like avec tendance + saisonnalité + bandes de confiance.
 */
import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Calendar } from 'lucide-react';
import { ResponsiveContainer, Area, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { forecastTresorerie, type TresoForecast } from '../engine/proph3/predictions';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function RollingForecastPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const [data, setData] = useState<TresoForecast | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    forecastTresorerie(currentOrgId, currentYear, horizon)
      .then(setData)
      .finally(() => setLoading(false));
  }, [currentOrgId, currentYear, horizon]);

  const chartData = data?.forecast.predictions.map((p, i) => ({
    date: new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    solde: p.value,
    lower80: data.forecast.confidence80.lower[i],
    upper80: data.forecast.confidence80.upper[i],
    lower95: data.forecast.confidence95.lower[i],
    upper95: data.forecast.confidence95.upper[i],
  })) ?? [];

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Rolling Forecast"
        subtitle={`${org?.name ?? '—'} · Projection trésorerie ${horizon} jours · Modèle Prophet-like`}
        action={
          <div className="flex gap-1 p-0.5 rounded-full bg-primary-200/40 dark:bg-primary-800/40">
            {([30, 60, 90] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${horizon === h ? 'bg-surface text-primary-900 shadow-sm dark:bg-primary-100 dark:text-primary-900' : 'text-primary-500 hover:text-primary-900'}`}
              >
                {h}j
              </button>
            ))}
          </div>
        }
      />

      {loading && <div className="py-20 text-center text-primary-400">Calcul du forecast en cours…</div>}

      {!loading && data && (
        <>
          {/* KPI Hero */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <KPICard
              variant={data.risqueRupture ? 'default' : 'hero'}
              title="Solde projeté"
              value={fmtK(data.soldePrevu)}
              unit="XOF"
              icon={<TrendingUp className="w-5 h-5" strokeWidth={2} />}
              variation={data.soldeActuel ? ((data.soldePrevu - data.soldeActuel) / Math.abs(data.soldeActuel)) * 100 : undefined}
              vsLabel="vs aujourd'hui"
              subValue={`Horizon : ${horizon} jours`}
            />
            <KPICard
              title="Solde actuel"
              value={fmtK(data.soldeActuel)}
              unit="XOF"
              icon={<Calendar className="w-4 h-4" strokeWidth={2} />}
              subValue="Trésorerie nette"
            />
            <KPICard
              title="Flux moyen mensuel"
              value={fmtK(data.fluxMoyenMensuel)}
              unit="XOF"
              icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
              subValue="Tendance historique"
            />
            <KPICard
              title="Précision (MAPE)"
              value={`${data.forecast.mape.toFixed(1)} %`}
              icon={<AlertTriangle className="w-4 h-4" strokeWidth={2} />}
              subValue={data.forecast.mape < 15 ? 'Forecast fiable' : 'Précision modérée'}
              inverse
            />
          </div>

          {/* Alerte rupture */}
          {data.risqueRupture && data.forecast.dateRupture && (
            <div className="card p-4 border-l-4 border-error bg-error/5 dark:bg-error/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-error">Risque de rupture de trésorerie détecté</p>
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                    Le solde devient négatif aux alentours du <strong>{new Date(data.forecast.dateRupture).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
                    Action immédiate recommandée : ligne de crédit, accélération encaissements, report de paiements.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chart projection */}
          <ChartCard
            title="Projection journalière"
            subtitle="Solde + bandes de confiance 80% / 95%"
            accent={ct.accent}
          >
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="forecast-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.accent} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={ct.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="date" {...ct.axisProps} interval={Math.floor(chartData.length / 8)} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip
                  formatter={(v: any) => fmtFull(v)}
                  contentStyle={ct.tooltipStyle}
                  itemStyle={ct.tooltipItemStyle}
                  labelStyle={ct.tooltipLabelStyle}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Rupture', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                {/* Bande 95% */}
                <Area type="monotone" dataKey="upper95" stroke="none" fill={ct.accent} fillOpacity={0.06} legendType="none" />
                <Area type="monotone" dataKey="lower95" stroke="none" fill={ct.accent} fillOpacity={0.06} legendType="none" />
                {/* Bande 80% */}
                <Area type="monotone" dataKey="upper80" stroke="none" fill={ct.accent} fillOpacity={0.12} legendType="none" />
                <Area type="monotone" dataKey="lower80" stroke="none" fill={ct.accent} fillOpacity={0.12} legendType="none" />
                {/* Trace principale */}
                <Line type="monotone" dataKey="solde" stroke={ct.accent} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}
