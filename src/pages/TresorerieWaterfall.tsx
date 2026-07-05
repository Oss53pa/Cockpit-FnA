// Waterfall Trésorerie
// Pont de trésorerie (cash bridge) : de la trésorerie d'ouverture à la clôture,
// décomposé par activité (exploitation / investissement / financement — TFT
// SYSCOHADA) ou mois par mois. Rendu en barres « pilule » ECharts (robuste).
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { ChartCard } from '../components/ui/ChartCard';
import { Chart } from '../components/ui/Chart';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useCurrentOrg } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';
import { computeTFT, computeMonthlyTFT, type TFTResult } from '../engine/flows';
import { waterfallOption, type WaterfallDatum } from '../lib/chartTemplates';

type Mode = 'activites' | 'mensuel';
type MonthlyBridge = { months: string[]; opening: number; deltas: number[]; closing: number };

export default function TresorerieWaterfall() {
  // ⚠️ Tous les hooks AVANT tout `return` (React rules-of-hooks / #310).
  const { currentYear, currentOrgId, theme } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [mode, setMode] = useState<Mode>('activites');
  const [totals, setTotals] = useState<TFTResult['totals'] | null>(null);
  const [monthly, setMonthly] = useState<MonthlyBridge | null>(null);
  const dark = theme === 'dark';

  useEffect(() => {
    if (!currentOrgId) return;
    let alive = true;
    computeTFT(currentOrgId, currentYear).then((r) => { if (alive) setTotals(r.totals); });
    return () => { alive = false; };
  }, [currentOrgId, currentYear]);

  useEffect(() => {
    if (!currentOrgId) return;
    let alive = true;
    computeMonthlyTFT(currentOrgId, currentYear).then((mt) => {
      if (!alive) return;
      const line = (code: string) => mt.lines.find((l) => l.code === code)?.values ?? [];
      const fm = line('FM'); const fn = line('FN'); const zf = line('_ZF');
      setMonthly({
        months: mt.months,
        opening: fm[0] ?? 0,
        deltas: zf,
        closing: fn[fn.length - 1] ?? 0,
      });
    });
    return () => { alive = false; };
  }, [currentOrgId, currentYear]);

  // sy neutralise NaN/Infinity avant le chart (évite un rendu cassé).
  const sy = (v: number) => (Number.isFinite(v) ? v : 0);

  // Mode « activités » : ouverture → flux op/invest/financement → clôture (annuel).
  const activitesSteps = useMemo<WaterfallDatum[]>(() => {
    if (!totals) return [];
    return [
      { label: 'Trésorerie ouverture', value: sy(totals.tresoOuverture), isTotal: true },
      { label: 'Flux opérationnels', value: sy(totals.fluxOperationnels) },
      { label: "Flux d'investissement", value: sy(totals.fluxInvestissement) },
      { label: 'Flux de financement', value: sy(totals.fluxFinancement) },
      { label: 'Trésorerie clôture', value: sy(totals.tresoCloture), isTotal: true },
    ];
  }, [totals]);

  // Mode « mensuel » : ouverture + Δ de chaque mois → clôture.
  const mensuelSteps = useMemo<WaterfallDatum[]>(() => {
    if (!monthly) return [];
    return [
      { label: 'Ouverture', value: sy(monthly.opening), isTotal: true },
      ...monthly.months.map((m, i) => ({ label: m, value: sy(monthly.deltas[i] ?? 0) })),
      { label: 'Clôture', value: sy(monthly.closing), isTotal: true },
    ];
  }, [monthly]);

  const data = mode === 'activites' ? activitesSteps : mensuelSteps;

  const kpis = useMemo(() => {
    const ouverture = sy(totals?.tresoOuverture ?? monthly?.opening ?? 0);
    const cloture = sy(totals?.tresoCloture ?? monthly?.closing ?? 0);
    const variation = cloture - ouverture;
    const fluxOp = sy(totals?.fluxOperationnels ?? 0);
    return { ouverture, cloture, variation, fluxOp };
  }, [totals, monthly]);

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/tre-waterfall" />
      <div className="flex justify-end mb-3">
        <div className="flex gap-1 p-0.5 bg-primary-100 dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800">
          <button onClick={() => setMode('activites')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'activites' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Par activité</button>
          <button onClick={() => setMode('mensuel')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'mensuel' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Mois par mois</button>
        </div>
      </div>

      <DashHeader
        icon="TW"
        title="Waterfall Trésorerie"
        subtitle={
          mode === 'activites'
            ? `Pont de trésorerie par activité (exploitation / investissement / financement) — ${org?.name ?? '—'} · Exercice ${currentYear}`
            : `Évolution mois par mois de la trésorerie nette — ${org?.name ?? '—'} · Exercice ${currentYear}`
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Trésorerie ouverture" value={fmtK(kpis.ouverture)} unit="XOF" subValue="Solde initial" icon={<Wallet className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Flux opérationnels" value={fmtK(kpis.fluxOp)} unit="XOF" subValue={kpis.fluxOp >= 0 ? 'Générateur de cash' : 'Consommateur de cash'} icon={kpis.fluxOp >= 0 ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />} color={kpis.fluxOp >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title="Variation nette" value={`${kpis.variation >= 0 ? '+' : ''}${fmtK(kpis.variation)}`} unit="XOF" subValue={kpis.variation >= 0 ? 'Trésorerie en hausse' : 'Trésorerie en baisse'} icon={kpis.variation >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} color={kpis.variation >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title="Trésorerie clôture" value={fmtK(kpis.cloture)} unit="XOF" subValue={kpis.cloture >= 0 ? 'Position positive' : 'Position négative'} icon={<Wallet className="w-4 h-4" />} color={kpis.cloture >= 0 ? ct.at(0) : ct.at(1)} />
      </div>

      <ChartCard
        title={mode === 'activites' ? 'Pont de trésorerie — de l\'ouverture à la clôture' : 'Trésorerie nette — cumul mensuel'}
        subtitle={mode === 'activites' ? 'Flux générateurs (positifs) · consommateurs (négatifs) · bornes Ouverture/Clôture (neutres)' : 'Variation de chaque mois entre la trésorerie d\'ouverture et de clôture'}
        accent={ct.at(0)}
      >
        {data.length === 0 ? (
          <div className="h-[430px] flex items-center justify-center text-sm text-primary-400">
            Calcul du flux de trésorerie depuis le Grand Livre…
          </div>
        ) : (
          <Chart
            height={430}
            option={waterfallOption(data, {
              colors: ct.colors,
              textColor: dark ? '#d4d4d4' : '#525252',
              trackColor: ct.colors[4] ?? '#737373',
              valueFormatter: (v) => fmtK(v),
              barWidth: mode === 'mensuel' ? 18 : 26,
            })}
          />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <ChartCard title="Lecture du pont" subtitle="Comment interpréter cette cascade" accent={ct.at(3)}>
          <ul className="text-[12px] text-primary-600 dark:text-primary-300 space-y-2 leading-relaxed">
            {mode === 'activites' ? (
              <>
                <li>Le point de départ est la <strong>trésorerie d'ouverture</strong>, l'arrivée la <strong>trésorerie de clôture</strong>.</li>
                <li>Les <strong>flux opérationnels</strong> (CAFG − variation du BFR) mesurent le cash généré par l'activité courante — idéalement <strong>positifs</strong>.</li>
                <li>Les <strong>flux d'investissement</strong> sont souvent <strong>négatifs</strong> (acquisitions d'immobilisations).</li>
                <li>Les <strong>flux de financement</strong> reflètent emprunts, remboursements, apports et dividendes.</li>
              </>
            ) : (
              <>
                <li>Chaque barre est la <strong>variation nette de trésorerie du mois</strong> (flux op + invest + financement).</li>
                <li>Les mois <strong>positifs</strong> font monter le solde, les mois <strong>négatifs</strong> le font descendre.</li>
                <li>La cascade relie la trésorerie d'<strong>ouverture</strong> (janvier) à celle de <strong>clôture</strong> (décembre).</li>
                <li>Les mois à forte baisse méritent un contrôle (gros décaissement, échéance, saisonnalité).</li>
              </>
            )}
          </ul>
        </ChartCard>

        <ChartCard title={mode === 'activites' ? 'Contribution par activité' : 'Mois les plus marquants'} subtitle={mode === 'activites' ? '3 flux du TFT' : 'Les 5 plus fortes variations mensuelles'} accent={ct.at(1)}>
          <div className="space-y-2">
            {data
              .filter((d) => !d.isTotal)
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, mode === 'activites' ? 3 : 5)
              .map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.value >= 0 ? ct.colors[0] : ct.colors[1] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate">{d.label}</p>
                  </div>
                  <span className={`num text-[12px] font-semibold ${d.value >= 0 ? 'text-success' : 'text-error'}`}>
                    {d.value >= 0 ? '+' : ''}{fmtFull(d.value)}
                  </span>
                </div>
              ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
