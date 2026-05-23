/**
 * D09 — Dashboard Couverture Analytique
 *
 * Public : Comptable, Auditeur interne
 * Mesure la qualité de la ventilation analytique :
 *   - Taux de couverture global (% lignes 6/7 affectées sur au moins un axe)
 *   - Taux par journal / par classe comptable / par mois
 *   - Liste des écritures non ventilées (top 50)
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, AlertCircle, CheckCircle2, BarChart2,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from 'recharts';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { ChartCard } from '../../components/ui/ChartCard';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { useChartTheme } from '../../lib/chartTheme';
import { dataProvider } from '../../db/provider';
import { loadAnalyticContext, computeCoverageBreakdown } from '../../engine/analyticDashboards';
import type { GLEntry } from '../../db/schema';

export default function AnalyticalCoverage() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    total: number; assigned: number; coverageRate: number;
    byJournal: { journal: string; total: number; assigned: number; rate: number }[];
    byClass: { class: string; total: number; assigned: number; rate: number }[];
    byMonth: { month: number; label: string; rate: number; total: number; assigned: number }[];
    unassigned: GLEntry[];
  } | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [ctx, periods] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
        ]);
        const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= 1);
        setData(computeCoverageBreakdown(ctx, yearPeriods));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="D09 — Couverture analytique"
        subtitle="Qualité de la ventilation : taux global, par journal, par compte, par mois"
        icon={<ShieldCheck className="w-5 h-5" />}
        back="/dashboards"
      />

      {loading && <div className="py-12 text-center text-sm text-primary-500">Calcul de la couverture…</div>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI
              label="Couverture globale"
              value={`${data.coverageRate} %`}
              status={data.coverageRate >= 80 ? 'good' : data.coverageRate >= 50 ? 'warn' : 'risk'}
            />
            <KPI label="Lignes éligibles" value={data.total.toLocaleString('fr-FR')} sub="classes 6/7" />
            <KPI label="Lignes affectées" value={data.assigned.toLocaleString('fr-FR')} />
            <KPI
              label="Lignes manquantes"
              value={(data.total - data.assigned).toLocaleString('fr-FR')}
              status={(data.total - data.assigned) === 0 ? 'good' : 'warn'}
            />
          </div>

          {/* Évolution mensuelle */}
          {data.byMonth.length > 0 && (
            <ChartCard title="Évolution mensuelle de la couverture">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.byMonth.map((m) => ({ mois: m.label.substring(0, 3), rate: m.rate, assigned: m.assigned, total: m.total }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => n === 'rate' ? `${v} %` : (v as number).toLocaleString('fr-FR')} />
                  <Line type="monotone" dataKey="rate" stroke={ct.at(2)} strokeWidth={2} dot={{ r: 4 }} name="Couverture" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Couverture par journal */}
            <ChartCard title="Couverture par journal">
              {data.byJournal.length === 0 ? (
                <div className="py-12 text-center text-xs text-primary-400">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.byJournal.length * 32)}>
                  <BarChart data={data.byJournal} layout="vertical">
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="journal" width={70} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${v} %`} />
                    <Bar dataKey="rate" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Couverture par classe comptable */}
            <ChartCard title="Couverture par classe comptable">
              {data.byClass.length === 0 ? (
                <div className="py-12 text-center text-xs text-primary-400">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.byClass.length * 32)}>
                  <BarChart data={data.byClass} layout="vertical">
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="class" width={50} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${v} %`} />
                    <Bar dataKey="rate" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Détail par journal */}
          <Card title="Détail par journal" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-primary-100 dark:bg-primary-900">
                  <tr>
                    <th className="text-left px-3 py-2">Journal</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2">Affectées</th>
                    <th className="text-right px-3 py-2">Non affectées</th>
                    <th className="text-right px-3 py-2">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byJournal.map((j) => (
                    <tr key={j.journal} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="px-3 py-2 font-mono font-semibold">{j.journal}</td>
                      <td className="px-3 py-2 text-right num">{j.total.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-right num">{j.assigned.toLocaleString('fr-FR')}</td>
                      <td className="px-3 py-2 text-right num">{(j.total - j.assigned).toLocaleString('fr-FR')}</td>
                      <td className={`px-3 py-2 text-right num font-bold ${j.rate >= 80 ? 'text-success' : j.rate >= 50 ? 'text-warning' : 'text-error'}`}>
                        {j.rate} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Liste des écritures non affectées */}
          {data.unassigned.length > 0 && (
            <Card
              title={`Écritures non ventilées (${data.unassigned.length} affichées${data.total - data.assigned > 50 ? ` / ${data.total - data.assigned} total` : ''})`}
              padded={false}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-primary-100 dark:bg-primary-900">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Journal</th>
                      <th className="text-left px-3 py-2">Pièce</th>
                      <th className="text-left px-3 py-2">Compte</th>
                      <th className="text-left px-3 py-2">Libellé</th>
                      <th className="text-right px-3 py-2">Débit</th>
                      <th className="text-right px-3 py-2">Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unassigned.map((e) => (
                      <tr key={e.id} className="border-b border-primary-100 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/40">
                        <td className="px-3 py-2 num">{e.date}</td>
                        <td className="px-3 py-2 font-mono">{e.journal}</td>
                        <td className="px-3 py-2 font-mono">{e.piece}</td>
                        <td className="px-3 py-2 font-mono">{e.account}</td>
                        <td className="px-3 py-2 truncate max-w-[280px]">{e.label}</td>
                        <td className="px-3 py-2 text-right num">{e.debit > 0 ? e.debit.toLocaleString('fr-FR') : ''}</td>
                        <td className="px-3 py-2 text-right num">{e.credit > 0 ? e.credit.toLocaleString('fr-FR') : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-primary-200 dark:border-primary-800 flex items-center justify-end">
                <Link to="/analytical?tab=assign" className="btn-primary text-xs inline-flex items-center gap-1.5">
                  Affecter ces lignes <BarChart2 className="w-3 h-3" />
                </Link>
              </div>
            </Card>
          )}

          {/* Si tout est OK */}
          {data.total > 0 && data.coverageRate === 100 && (
            <Card padded>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-success">Couverture analytique complète</p>
                  <p className="text-xs text-primary-500 mt-1">
                    Toutes les écritures éligibles (classes 6/7) sont affectées sur au moins un axe.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {data.total === 0 && (
            <Card padded>
              <p className="text-sm text-primary-600">
                Aucune écriture éligible (classes 6/7) trouvée pour l'exercice {currentYear}.
                Importez votre Grand Livre pour démarrer le suivi analytique.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: 'good' | 'warn' | 'risk' }) {
  const color = status === 'good' ? 'text-success' : status === 'warn' ? 'text-warning' : status === 'risk' ? 'text-error' : '';
  const Icon = status === 'good' ? CheckCircle2 : status === 'warn' || status === 'risk' ? AlertCircle : null;
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <p className={`num text-xl font-bold ${color}`}>{value}</p>
      </div>
      {sub && <p className="text-[10px] text-primary-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
