import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Chart } from '../components/ui/Chart';
import { Badge } from '../components/ui/Badge';
import { useChartColors } from '../store/theme';
import { useApp } from '../store/app';
import { useStatements, useMonthlyCA } from '../hooks/useFinancials';
import { dataProvider } from '../db/provider';
import { loadAnalyticContext, computeCoverageBreakdown } from '../engine/analyticDashboards';
import { fmtK } from '../lib/format';
import {
  pillBarOption,
  explodedDonutOption,
  waterfallOption,
  type PillBarDatum,
  type DonutDatum,
  type WaterfallDatum,
} from '../lib/chartTemplates';

// ── Replis illustratifs (utilisés si l'org n'a pas encore de données) ────────
const DEMO_PILL: PillBarDatum[] = [
  { label: 'Jan', value: 62 }, { label: 'Fév', value: 71 }, { label: 'Mar', value: 48 },
  { label: 'Avr', value: 83 }, { label: 'Mai', value: 91 }, { label: 'Juin', value: 77 },
];
const DEMO_DONUT: DonutDatum[] = [
  { name: 'Projets', value: 41 }, { name: 'Centres de coût', value: 24 },
  { name: 'Frais généraux', value: 18 }, { name: 'Refacturations', value: 11 }, { name: 'Non ventilé', value: 6 },
];
const DEMO_WF: WaterfallDatum[] = [
  { label: 'CA', value: 1000, isTotal: true }, { label: 'Achats', value: -420 },
  { label: 'Services', value: -180 }, { label: 'Personnel', value: -240 },
  { label: 'Amort.', value: -60 }, { label: 'Rés. fin.', value: 35 },
  { label: 'Rés. net', value: 135, isTotal: true },
];

function Source({ live }: { live: boolean }) {
  return (
    <Badge variant={live ? 'success' : 'default'}>
      {live ? 'Données réelles' : 'Exemple'}
    </Badge>
  );
}

export default function ChartGallery() {
  const colors = useChartColors();
  const dark = useApp((s) => s.theme) === 'dark';
  const { currentOrgId, currentYear } = useApp();
  const { sig } = useStatements();
  const monthlyCA = useMonthlyCA();

  const text = dark ? '#d4d4d4' : '#525252';
  const track = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const surface = dark ? '#202020' : '#ffffff';

  // ── Modèle 1 : exécution budgétaire mensuelle (réalisé / budget) ──
  const pill = useMemo(() => {
    const rows = (monthlyCA ?? []).filter((m) => m.budget > 0);
    if (rows.length === 0) return { data: DEMO_PILL, live: false };
    return {
      data: rows.map((m) => ({ label: m.mois, value: Math.round((m.realise / m.budget) * 100) })),
      live: true,
    };
  }, [monthlyCA]);

  // ── Modèle 3 : cascade SIG du CA au Résultat Net ──
  const wf = useMemo<{ data: WaterfallDatum[]; live: boolean }>(() => {
    if (!sig || !sig.ca) return { data: DEMO_WF, live: false };
    return {
      data: [
        { label: 'CA', value: sig.ca, isTotal: true },
        { label: 'Achats', value: -(sig.ca - sig.margeBrute) },
        { label: 'Marge brute', value: sig.margeBrute, isTotal: true },
        { label: 'Services ext.', value: -(sig.margeBrute - sig.valeurAjoutee) },
        { label: 'VA', value: sig.valeurAjoutee, isTotal: true },
        { label: 'Personnel', value: -(sig.valeurAjoutee - sig.ebe) },
        { label: 'EBE', value: sig.ebe, isTotal: true },
        { label: 'Amort.', value: -(sig.ebe - sig.re) },
        { label: 'Rés. expl.', value: sig.re, isTotal: true },
        { label: 'Rés. fin.', value: sig.rf },
        { label: 'HAO', value: sig.rhao },
        { label: 'Impôt', value: -sig.impot },
        { label: 'Rés. net', value: sig.resultat, isTotal: true },
      ],
      live: true,
    };
  }, [sig]);

  // ── Modèle 2 : couverture analytique par journal (async — D09) ──
  const [donut, setDonut] = useState<{ data: DonutDatum[]; rate: number; live: boolean }>({
    data: DEMO_DONUT,
    rate: 94,
    live: false,
  });
  useEffect(() => {
    if (!currentOrgId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [ctx, periods] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
        ]);
        const yearPeriods = periods.filter((p) => p.year === currentYear);
        const cov = computeCoverageBreakdown(ctx, yearPeriods);
        if (cancelled) return;
        const src = cov.byJournal.length >= 2 ? cov.byJournal.map((j) => ({ name: j.journal, value: j.total }))
          : cov.byClass.map((c) => ({ name: `Classe ${c.class}`, value: c.total }));
        if (cov.total > 0 && src.length > 0) {
          setDonut({ data: src.sort((a, b) => b.value - a.value), rate: cov.coverageRate, live: true });
        }
      } catch {
        /* repli illustratif déjà en place */
      }
    })();
    return () => { cancelled = true; };
  }, [currentOrgId, currentYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Galerie de graphiques"
        subtitle="3 modèles réutilisables, branchés sur tes données réelles — repli sur un exemple si l'org est vide"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Barres « pilule » + timeline"
          subtitle="Taux d'exécution budgétaire mensuel (réalisé / budget)"
          action={<Source live={pill.live} />}
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={300}
              option={pillBarOption(pill.data, { colors, textColor: text, trackColor: track, unit: '%', max: 120 })}
            />
          </div>
        </Card>

        <Card
          title="Donut « explosé » + libellé central"
          subtitle="Couverture analytique par journal (D09)"
          action={<Source live={donut.live} />}
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={300}
              option={explodedDonutOption(donut.data, {
                colors,
                textColor: text,
                trackColor: surface,
                explodeIndex: 0,
                centerTitle: `${donut.rate}%`,
                centerSubtitle: 'COUVERTURE',
                valueFormatter: (v) => `${v.toLocaleString('fr-FR')} lignes`,
              })}
            />
          </div>
        </Card>

        <Card
          title="Waterfall « pilule »"
          subtitle={`Passage du CA au Résultat Net (SIG) — exercice ${currentYear}`}
          action={<Source live={wf.live} />}
          className="lg:col-span-2"
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={340}
              option={waterfallOption(wf.data, { colors, textColor: text, valueFormatter: (v) => fmtK(v) })}
            />
          </div>
        </Card>
      </div>

      <Card variant="ghost">
        <p className="text-xs text-primary-500 leading-relaxed">
          <span className="font-semibold text-primary-700 dark:text-primary-300">Réutilisation —</span>{' '}
          importez les builders depuis <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">src/lib/chartTemplates.ts</code>,
          passez vos données + <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">colors=useChartColors()</code>
          {' '}(et un <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">valueFormatter</code> pour les montants),
          puis rendez avec <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">&lt;Chart option=&#123;...&#125; /&gt;</code>.
          Couleurs et thème suivent automatiquement la palette active.
        </p>
      </Card>
    </div>
  );
}
