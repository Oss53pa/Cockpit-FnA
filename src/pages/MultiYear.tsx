/**
 * Comparatif multi-exercices N / N-1 / N-2 / N-3.
 * Vue stratégique des tendances pluriannuelles.
 */
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { computeBalance } from '../engine/balance';
import { computeBilan, computeSIG } from '../engine/statements';
import { fmtFull, fmtK, fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

interface YearSnap {
  year: number;
  ca: number;
  rn: number;
  ebe: number;
  margeBrute: number;
  totalActif: number;
  capPropres: number;
  treso: number;
}

export default function MultiYearPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [snaps, setSnaps] = useState<YearSnap[]>([]);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => [currentYear - 3, currentYear - 2, currentYear - 1, currentYear], [currentYear]);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    Promise.all(years.map(async (y) => {
      const balance = await computeBalance({ orgId: currentOrgId, year: y, includeOpening: true });
      const bilan = computeBilan(balance);
      const { sig } = computeSIG(balance);
      const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
      return {
        year: y,
        ca: sig.ca,
        rn: sig.resultat,
        ebe: sig.ebe,
        margeBrute: sig.margeBrute,
        totalActif: get(bilan.actif, '_BZ'),
        capPropres: get(bilan.passif, 'CP'),
        treso: get(bilan.actif, '_BT') - get(bilan.passif, 'DV'),
      };
    })).then(setSnaps).finally(() => setLoading(false));
  }, [currentOrgId, years]);

  const last = snaps[snaps.length - 1];
  const prev = snaps[snaps.length - 2];

  const cagr = (start: number, end: number, years: number): number => {
    if (start === 0 || !Number.isFinite(start) || !Number.isFinite(end)) return NaN;
    return (Math.pow(Math.abs(end) / Math.abs(start), 1 / years) - 1) * 100;
  };

  const cagrCA = snaps.length >= 2 ? cagr(snaps[0].ca, last?.ca ?? 0, snaps.length - 1) : NaN;
  const cagrRN = snaps.length >= 2 ? cagr(snaps[0].rn, last?.rn ?? 0, snaps.length - 1) : NaN;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Comparatif multi-exercices"
        subtitle={`${org?.name ?? '—'} · ${years[0]} → ${years[years.length - 1]} · Tendances pluriannuelles`}
      />

      {loading && <div className="py-20 text-center text-primary-400">Calcul {years.length} exercices…</div>}

      {!loading && snaps.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              variant="hero"
              title={`CA ${currentYear}`}
              value={fmtK(last?.ca ?? 0)}
              unit="XOF"
              icon={<TrendingUp className="w-5 h-5" strokeWidth={2} />}
              variation={prev?.ca ? ((last!.ca - prev.ca) / Math.abs(prev.ca)) * 100 : undefined}
              vsLabel={`vs ${currentYear - 1}`}
              subValue={`CAGR ${snaps.length - 1} ans : ${fmtPct(cagrCA)}`}
            />
            <KPICard
              title="Résultat net"
              value={fmtK(last?.rn ?? 0)}
              unit="XOF"
              icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
              variation={prev?.rn ? ((last!.rn - prev.rn) / Math.abs(prev.rn)) * 100 : undefined}
              subValue={`CAGR ${snaps.length - 1} ans : ${fmtPct(cagrRN)}`}
            />
            <KPICard
              title="Total Actif"
              value={fmtK(last?.totalActif ?? 0)}
              unit="XOF"
              icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
              variation={prev?.totalActif ? ((last!.totalActif - prev.totalActif) / Math.abs(prev.totalActif)) * 100 : undefined}
            />
            <KPICard
              title="Capitaux propres"
              value={fmtK(last?.capPropres ?? 0)}
              unit="XOF"
              icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />}
              variation={prev?.capPropres ? ((last!.capPropres - prev.capPropres) / Math.abs(prev.capPropres)) * 100 : undefined}
            />
          </div>

          <ChartCard title="Évolution CA / Résultat / EBE" subtitle="4 exercices comparés" accent={ct.accent}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={snaps}>
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="year" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="ca" name="Chiffre d'affaires" stroke={ct.at(0)} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="rn" name="Résultat net" stroke={ct.accent} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="ebe" name="EBE" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Structure financière par exercice" subtitle="Total Actif vs Capitaux propres vs Trésorerie" accent={ct.at(2)}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={snaps} barCategoryGap="30%">
                <CartesianGrid {...ct.gridProps} />
                <XAxis dataKey="year" {...ct.axisProps} />
                <YAxis {...ct.axisProps} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
                <Bar dataKey="totalActif" name="Total Actif" fill={ct.at(0)} radius={[4, 4, 0, 0]} />
                <Bar dataKey="capPropres" name="Capitaux propres" fill={ct.at(2)} radius={[4, 4, 0, 0]} />
                <Bar dataKey="treso" name="Trésorerie nette" fill={ct.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tableau récapitulatif" accent={ct.at(1)}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                    <th className="text-left py-2.5 px-3">Indicateur</th>
                    {snaps.map((s) => (
                      <th key={s.year} className="text-right py-2.5 px-3 num">{s.year}</th>
                    ))}
                    <th className="text-right py-2.5 px-3">Tendance</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Chiffre d\'affaires', key: 'ca' },
                    { label: 'Résultat net', key: 'rn' },
                    { label: 'EBE', key: 'ebe' },
                    { label: 'Marge brute', key: 'margeBrute' },
                    { label: 'Total Actif', key: 'totalActif' },
                    { label: 'Capitaux propres', key: 'capPropres' },
                    { label: 'Trésorerie nette', key: 'treso' },
                  ].map(({ label, key }) => {
                    const values = snaps.map((s) => (s as any)[key] as number);
                    const last = values[values.length - 1];
                    const first = values[0];
                    const trend = first ? ((last - first) / Math.abs(first)) * 100 : 0;
                    return (
                      <tr key={key} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                        <td className="py-2 px-3 font-medium">{label}</td>
                        {values.map((v, i) => (
                          <td key={i} className="text-right py-2 px-3 num tabular-nums">{fmtFull(v)}</td>
                        ))}
                        <td className="text-right py-2 px-3 num font-semibold">
                          <span className={trend >= 0 ? 'text-success' : 'text-error'}>
                            {fmtPct(trend)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
