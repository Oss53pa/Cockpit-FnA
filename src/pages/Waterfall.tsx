// Waterfall Analysis
// Cascade visuelle : décomposition du Résultat Net SIG ou des écarts
// Budget/Réalisé section par section. Rendu en barres « pilule » ECharts.
import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { ChartCard } from '../components/ui/ChartCard';
import { Chart } from '../components/ui/Chart';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useBudgetActual, useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';
import { bySection, computeIntermediates } from '../engine/budgetActual';
import { waterfallOption, type WaterfallDatum } from '../lib/chartTemplates';

type Mode = 'sig' | 'variance';

export default function Waterfall() {
  const { currentYear, currentOrgId, theme } = useApp();
  const org = useCurrentOrg();
  const { sig } = useStatements();
  const rows = useBudgetActual();
  const ct = useChartTheme();
  const [mode, setMode] = useState<Mode>('sig');
  const dark = theme === 'dark';

  // Mode SIG : cascade du CA au Résultat Net (deltas signés ; totaux = valeur absolue)
  const sigSteps = useMemo<WaterfallDatum[]>(() => {
    if (!sig) return [];
    return [
      { label: 'CA', value: sig.ca, isTotal: true },
      { label: 'Achats & MP', value: -(sig.ca - sig.margeBrute) },
      { label: 'Marge brute', value: sig.margeBrute, isTotal: true },
      { label: 'Services ext.', value: -(sig.margeBrute - sig.valeurAjoutee) },
      { label: 'Valeur ajoutée', value: sig.valeurAjoutee, isTotal: true },
      { label: 'Personnel', value: -(sig.valeurAjoutee - sig.ebe) },
      { label: 'EBE', value: sig.ebe, isTotal: true },
      { label: 'Amort.', value: -(sig.ebe - sig.re) },
      { label: 'Rés. expl.', value: sig.re, isTotal: true },
      { label: 'Rés. fin.', value: sig.rf },
      { label: 'HAO', value: sig.rhao },
      { label: 'Impôt', value: -sig.impot },
      { label: 'Rés. net', value: sig.resultat, isTotal: true },
    ];
  }, [sig]);

  // Mode Variance : décomposition des écarts budget par section
  const varianceSteps = useMemo<WaterfallDatum[]>(() => {
    if (!rows.length) return [];
    const sections = bySection(rows, currentOrgId);
    const inter = computeIntermediates(sections);
    const find = (s: string) => sections.find((x) => x.section === s);
    // Pour les produits : écart positif = bon. Pour les charges : on inverse le signe.
    const contrib = (sec: ReturnType<typeof find>, sign: 1 | -1) => sec ? (sec.totalRealise - sec.totalBudget) * sign : 0;
    return [
      { label: 'Budget RN', value: inter.res_net.budget, isTotal: true },
      { label: 'Δ Prod. expl.', value: contrib(find('produits_expl'), 1) },
      { label: 'Δ Ch. expl.', value: contrib(find('charges_expl'), -1) },
      { label: 'Δ Prod. fin.', value: contrib(find('produits_fin'), 1) },
      { label: 'Δ Ch. fin.', value: contrib(find('charges_fin'), -1) },
      { label: 'Δ HAO', value: contrib(find('produits_hao'), 1) + contrib(find('charges_hao'), -1) },
      { label: 'Δ Impôts', value: contrib(find('impots'), -1) },
      { label: 'Réalisé RN', value: inter.res_net.realise, isTotal: true },
    ];
  }, [rows, currentOrgId]);

  const data = mode === 'sig' ? sigSteps : varianceSteps;

  // KPIs d'en-tête
  const headerKpis = useMemo(() => {
    if (mode === 'sig') {
      return {
        kpi1: { title: "Chiffre d'affaires", value: fmtK(sig?.ca ?? 0), sub: '100 %' },
        kpi2: { title: 'EBE', value: fmtK(sig?.ebe ?? 0), sub: sig?.ca ? `${((sig.ebe / sig.ca) * 100).toFixed(1)} % du CA` : '—' },
        kpi3: { title: "Résultat d'exploitation", value: fmtK(sig?.re ?? 0), sub: sig?.ca ? `${((sig.re / sig.ca) * 100).toFixed(1)} % du CA` : '—' },
        kpi4: { title: 'Résultat net', value: fmtK(sig?.resultat ?? 0), sub: sig?.ca ? `${((sig.resultat / sig.ca) * 100).toFixed(1)} % du CA` : '—' },
      };
    }
    const sections = bySection(rows, currentOrgId);
    const inter = computeIntermediates(sections);
    const delta = inter.res_net.realise - inter.res_net.budget;
    return {
      kpi1: { title: 'Budget Résultat Net', value: fmtK(inter.res_net.budget), sub: 'Cible' },
      kpi2: { title: 'Réalisé Résultat Net', value: fmtK(inter.res_net.realise), sub: inter.res_net.realise >= inter.res_net.budget ? 'Au-dessus' : 'En-dessous' },
      kpi3: { title: 'Écart Budget', value: `${delta >= 0 ? '+' : ''}${fmtK(delta)}`, sub: inter.res_net.budget ? `${((delta / Math.abs(inter.res_net.budget)) * 100).toFixed(1)} %` : '—' },
      kpi4: { title: 'Statut', value: delta >= 0 ? 'Favorable' : 'Défavorable', sub: delta >= 0 ? '✓ Objectif tenu' : '⚠ Écart à expliquer' },
    };
  }, [mode, sig, rows, currentOrgId]);

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/waterfall" />
      <div className="flex justify-end mb-3">
        <div className="flex gap-1 p-0.5 bg-primary-100 dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800">
          <button onClick={() => setMode('sig')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'sig' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Cascade SIG</button>
          <button onClick={() => setMode('variance')} className={`px-3 py-1 text-[11px] rounded font-medium ${mode === 'variance' ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-600'}`}>Écarts Budget</button>
        </div>
      </div>

      <DashHeader
        icon="WF"
        title={mode === 'sig' ? 'Waterfall — Résultat SIG' : 'Waterfall — Écarts Budget vs Réalisé'}
        subtitle={mode === 'sig' ? `Cascade du CA au résultat net — ${org?.name ?? '—'} · Exercice ${currentYear}` : `Décomposition de l'écart Budget/Réalisé sur le résultat net — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title={headerKpis.kpi1.title} value={headerKpis.kpi1.value} unit="XOF" subValue={headerKpis.kpi1.sub} icon={<TrendingUp className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title={headerKpis.kpi2.title} value={headerKpis.kpi2.value} unit="XOF" subValue={headerKpis.kpi2.sub} icon={<Target className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title={headerKpis.kpi3.title} value={headerKpis.kpi3.value} unit="XOF" subValue={headerKpis.kpi3.sub} icon={<Target className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title={headerKpis.kpi4.title} value={headerKpis.kpi4.value} unit={mode === 'variance' && typeof headerKpis.kpi4.value === 'string' && !headerKpis.kpi4.value.match(/[A-Za-z]/) ? 'XOF' : ''} subValue={headerKpis.kpi4.sub} icon={(sig?.resultat ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} color={(sig?.resultat ?? 0) >= 0 ? ct.at(0) : ct.at(1)} />
      </div>

      <ChartCard
        title={mode === 'sig' ? 'Cascade SIG — du CA au Résultat Net' : "Décomposition de l'écart Budget Résultat Net → Réalisé Résultat Net"}
        subtitle={mode === 'sig' ? 'Apports (positifs) · charges (négatifs) · totaux intermédiaires (neutres)' : 'Écart favorable (positif) · défavorable (négatif) · bornes Budget/Réalisé (neutres)'}
        accent={ct.at(0)}
      >
        <Chart
          height={430}
          option={waterfallOption(data, {
            colors: ct.colors,
            textColor: dark ? '#d4d4d4' : '#525252',
            trackColor: ct.colors[4] ?? '#737373',
            valueFormatter: (v) => fmtK(v),
            barWidth: 22,
          })}
        />
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <ChartCard title="Lecture de la cascade" subtitle="Comment interpréter ce graphique" accent={ct.at(3)}>
          <ul className="text-[12px] text-primary-600 dark:text-primary-300 space-y-2 leading-relaxed">
            {mode === 'sig' ? (
              <>
                <li>Les barres <strong>positives</strong> représentent les <strong>produits</strong> qui ajoutent au résultat (CA, produits financiers, HAO positif).</li>
                <li>Les barres <strong>négatives</strong> représentent les <strong>charges</strong> qui réduisent le résultat (achats, personnel, dotations, impôts).</li>
                <li>Les barres <strong>neutres</strong> sont des <strong>totaux intermédiaires</strong> (Marge brute, VA, EBE, RE, RN).</li>
                <li>Suivez la cascade de gauche à droite pour voir chaque étape de transformation du CA en résultat final.</li>
              </>
            ) : (
              <>
                <li>Les barres <strong>positives</strong> indiquent un <strong>écart favorable</strong> par rapport au budget (produits supérieurs ou charges inférieures).</li>
                <li>Les barres <strong>négatives</strong> indiquent un <strong>écart défavorable</strong> (produits sous budget ou charges au-dessus).</li>
                <li>Le point de départ est le <strong>Budget Résultat Net</strong>, l'arrivée est le <strong>Réalisé Résultat Net</strong>.</li>
                <li>Les sections avec le plus gros écart absolu méritent l'attention pour expliquer la performance.</li>
              </>
            )}
          </ul>
        </ChartCard>

        <ChartCard title="Top contributeurs" subtitle={mode === 'sig' ? 'Les 5 plus gros mouvements dans la cascade' : 'Les 5 sections avec le plus gros écart'} accent={ct.at(1)}>
          <div className="space-y-2">
            {data
              .filter((d) => !d.isTotal)
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, 5)
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
