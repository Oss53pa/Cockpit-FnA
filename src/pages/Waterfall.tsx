// Waterfall Analysis
// Cascade visuelle : décomposition du Résultat Net SIG ou des écarts
// Budget/Réalisé section par section.
import { useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList } from 'recharts';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useBudgetActual, useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';
import { bySection, computeIntermediates } from '../engine/budgetActual';

type Mode = 'sig' | 'variance';

/**
 * Construit les données waterfall pour recharts.
 * On simule une cascade avec deux séries :
 * - 'invisible' : décalage pour que la barre commence au bon niveau
 * - 'value' : valeur visible (hauteur de la barre)
 */
type WaterfallRow = {
  name: string;
  invisible: number;
  value: number;
  displayValue: number;
  color: string;
  isTotal?: boolean;
};

function buildWaterfall(steps: Array<{ name: string; delta: number; isTotal?: boolean; color?: string }>): WaterfallRow[] {
  const rows: WaterfallRow[] = [];
  let running = 0;
  for (const s of steps) {
    if (s.isTotal) {
      rows.push({
        name: s.name,
        invisible: 0,
        value: Math.abs(running + s.delta),
        displayValue: running + s.delta,
        color: s.color ?? ((running + s.delta) >= 0 ? '#1e40af' : '#dc2626'),
        isTotal: true,
      });
      running += s.delta;
    } else {
      // Pour une barre incrémentale
      if (s.delta >= 0) {
        rows.push({
          name: s.name,
          invisible: running,
          value: s.delta,
          displayValue: s.delta,
          color: s.color ?? '#22c55e',
        });
      } else {
        rows.push({
          name: s.name,
          invisible: running + s.delta,
          value: -s.delta,
          displayValue: s.delta,
          color: s.color ?? '#ef4444',
        });
      }
      running += s.delta;
    }
  }
  return rows;
}

export default function Waterfall() {
  const { currentYear, currentOrgId } = useApp();
  const org = useCurrentOrg();
  const { sig } = useStatements();
  const rows = useBudgetActual();
  const ct = useChartTheme();
  const [mode, setMode] = useState<Mode>('sig');

  // Mode SIG : cascade du CA au Résultat Net
  const sigSteps = useMemo(() => {
    if (!sig) return [];
    const steps = [
      { name: "Chiffre d'affaires", delta: sig.ca, color: ct.at(0) },
      { name: 'Achats & MP', delta: -(sig.ca - sig.margeBrute), color: '#ef4444' },
      { name: 'MARGE BRUTE', delta: 0, isTotal: true, color: ct.at(3) },
      { name: 'Services ext., transports, impôts', delta: -(sig.margeBrute - sig.valeurAjoutee), color: '#ef4444' },
      { name: 'VALEUR AJOUTÉE', delta: 0, isTotal: true, color: ct.at(3) },
      { name: 'Charges de personnel', delta: -(sig.valeurAjoutee - sig.ebe), color: '#ef4444' },
      { name: 'EBE', delta: 0, isTotal: true, color: ct.at(3) },
      { name: 'Dotations / amortissements', delta: -(sig.ebe - sig.re), color: '#ef4444' },
      { name: "Résultat d'exploitation", delta: 0, isTotal: true, color: ct.at(3) },
      { name: 'Résultat financier', delta: sig.rf, color: sig.rf >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Résultat HAO', delta: sig.rhao, color: sig.rhao >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Impôt sur le résultat', delta: -sig.impot, color: '#ef4444' },
      { name: 'RÉSULTAT NET', delta: 0, isTotal: true, color: sig.resultat >= 0 ? '#1e40af' : '#dc2626' },
    ];
    // Ajuster les "total" delta pour être cohérent avec running
    return steps;
  }, [sig, ct]);

  // Mode Variance : décomposition des écarts budget par section
  const varianceSteps = useMemo(() => {
    if (!rows.length) return [];
    const sections = bySection(rows, currentOrgId);
    const inter = computeIntermediates(sections);

    const produitsExpl = sections.find((s) => s.section === 'produits_expl');
    const chargesExpl = sections.find((s) => s.section === 'charges_expl');
    const produitsFin = sections.find((s) => s.section === 'produits_fin');
    const chargesFin = sections.find((s) => s.section === 'charges_fin');
    const produitsHAO = sections.find((s) => s.section === 'produits_hao');
    const chargesHAO = sections.find((s) => s.section === 'charges_hao');
    const impots = sections.find((s) => s.section === 'impots');

    const budgetResNet = inter.res_net.budget;
    const realiseResNet = inter.res_net.realise;

    // Contribution de chaque section à l'écart (réalisé - budget)
    // Pour les produits : écart positif = bon
    // Pour les charges : écart positif (réalisé > budget) = mauvais
    const contrib = (sec: typeof produitsExpl, sign: 1 | -1) => sec ? (sec.totalRealise - sec.totalBudget) * sign : 0;

    return [
      { name: 'Budget Résultat Net', delta: budgetResNet, isTotal: true, color: ct.at(3) },
      { name: 'Δ Produits exploitation', delta: contrib(produitsExpl, 1), color: contrib(produitsExpl, 1) >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Δ Charges exploitation', delta: contrib(chargesExpl, -1), color: contrib(chargesExpl, -1) >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Δ Produits financiers', delta: contrib(produitsFin, 1), color: contrib(produitsFin, 1) >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Δ Charges financières', delta: contrib(chargesFin, -1), color: contrib(chargesFin, -1) >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Δ HAO (net)', delta: contrib(produitsHAO, 1) + contrib(chargesHAO, -1), color: '#6b7280' },
      { name: 'Δ Impôts', delta: contrib(impots, -1), color: contrib(impots, -1) >= 0 ? '#22c55e' : '#ef4444' },
      { name: 'Réalisé Résultat Net', delta: 0, isTotal: true, color: realiseResNet >= 0 ? '#1e40af' : '#dc2626' },
    ];
  }, [rows, currentOrgId, ct]);

  const data = useMemo(() => buildWaterfall(mode === 'sig' ? sigSteps : varianceSteps), [mode, sigSteps, varianceSteps]);

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
      <div className="flex items-center justify-between mb-3">
        <Link to="/dashboards" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Catalogue</Link>
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
        <KPICard title={headerKpis.kpi1.title} value={headerKpis.kpi1.value} unit={mode === 'sig' ? 'XOF' : 'XOF'} subValue={headerKpis.kpi1.sub} icon={<TrendingUp className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title={headerKpis.kpi2.title} value={headerKpis.kpi2.value} unit="XOF" subValue={headerKpis.kpi2.sub} icon={<Target className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title={headerKpis.kpi3.title} value={headerKpis.kpi3.value} unit={mode === 'sig' ? 'XOF' : 'XOF'} subValue={headerKpis.kpi3.sub} icon={<Target className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title={headerKpis.kpi4.title} value={headerKpis.kpi4.value} unit={mode === 'variance' && typeof headerKpis.kpi4.value === 'string' && !headerKpis.kpi4.value.match(/[A-Za-z]/) ? 'XOF' : ''} subValue={headerKpis.kpi4.sub} icon={(sig?.resultat ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} color={(sig?.resultat ?? 0) >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      <ChartCard
        title={mode === 'sig' ? 'Cascade SIG — du CA au Résultat Net' : "Décomposition de l'écart Budget Résultat Net → Réalisé Résultat Net"}
        subtitle={mode === 'sig' ? 'Vert : contributions positives · Rouge : charges / pertes · Bleu : totaux intermédiaires' : 'Vert : écart favorable · Rouge : écart défavorable'}
        accent={ct.at(0)}
      >
        <div className="w-full" style={{ height: 430 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 40, right: 20, bottom: 80, left: 60 }} barCategoryGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--p-200))" />
              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                interval={0}
                tick={{ fontSize: 10, fill: 'rgb(var(--p-600))' }}
                height={100}
              />
              <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fontSize: 10, fill: 'rgb(var(--p-500))' }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload as WaterfallRow;
                  return (
                    <div style={{ background: 'rgb(var(--p-900))', color: 'rgb(var(--p-50))', padding: '8px 12px', borderRadius: 8, fontSize: 11 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                      <div className="num">{d.isTotal ? 'Total : ' : d.displayValue >= 0 ? '+ ' : ''}{fmtFull(d.displayValue)} XOF</div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="rgb(var(--p-400))" strokeWidth={1} />
              {/* Barre invisible qui crée le décalage vertical */}
              <Bar dataKey="invisible" stackId="a" fill="transparent" />
              {/* Barre visible colorée */}
              <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke={entry.isTotal ? 'rgb(var(--p-900))' : 'transparent'} strokeWidth={entry.isTotal ? 1.5 : 0} />
                ))}
                <LabelList
                  dataKey="displayValue"
                  position="top"
                  formatter={(v) => fmtK(Number(v))}
                  fontSize={9}
                  fill="rgb(var(--p-700))"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <ChartCard title="Lecture de la cascade" subtitle="Comment interpréter ce graphique" accent={ct.at(3)}>
          <ul className="text-[12px] text-primary-600 dark:text-primary-300 space-y-2 leading-relaxed">
            {mode === 'sig' ? (
              <>
                <li>🟢 Les barres <strong>vertes</strong> représentent les <strong>produits</strong> qui ajoutent au résultat (CA, produits financiers, HAO positif).</li>
                <li>🔴 Les barres <strong>rouges</strong> représentent les <strong>charges</strong> qui réduisent le résultat (achats, personnel, dotations, impôts).</li>
                <li>🔵 Les barres <strong>bleues</strong> cadrées sont des <strong>totaux intermédiaires</strong> (Marge brute, VA, EBE, RE, RN).</li>
                <li>Suivez la cascade de gauche à droite pour voir chaque étape de transformation du CA en résultat final.</li>
              </>
            ) : (
              <>
                <li>🟢 Les barres <strong>vertes</strong> indiquent un <strong>écart favorable</strong> par rapport au budget (produits supérieurs ou charges inférieures).</li>
                <li>🔴 Les barres <strong>rouges</strong> indiquent un <strong>écart défavorable</strong> (produits sous budget ou charges au-dessus).</li>
                <li>🔵 Le point de départ est le <strong>Budget Résultat Net</strong>, l'arrivée est le <strong>Réalisé Résultat Net</strong>.</li>
                <li>🔍 Les sections avec le plus gros écart absolu méritent l'attention pour expliquer la performance.</li>
              </>
            )}
          </ul>
        </ChartCard>

        <ChartCard title="Top contributeurs" subtitle={mode === 'sig' ? 'Les 5 plus gros mouvements dans la cascade' : 'Les 5 sections avec le plus gros écart'} accent={ct.at(1)}>
          <div className="space-y-2">
            {data
              .filter((d) => !d.isTotal)
              .sort((a, b) => Math.abs(b.displayValue) - Math.abs(a.displayValue))
              .slice(0, 5)
              .map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate">{d.name}</p>
                  </div>
                  <span className={`num text-[12px] font-semibold ${d.displayValue >= 0 ? 'text-success' : 'text-error'}`}>
                    {d.displayValue >= 0 ? '+' : ''}{fmtFull(d.displayValue)}
                  </span>
                </div>
              ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
