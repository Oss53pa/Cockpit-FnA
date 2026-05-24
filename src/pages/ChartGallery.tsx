import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Chart } from '../components/ui/Chart';
import { useChartColors } from '../store/theme';
import { useApp } from '../store/app';
import {
  pillBarOption,
  explodedDonutOption,
  waterfallOption,
  type PillBarDatum,
  type DonutDatum,
  type WaterfallDatum,
} from '../lib/chartTemplates';

// ── Données de démonstration (statiques, illustratives) ──────────────────────
const pillData: PillBarDatum[] = [
  { label: '2018', value: 62 },
  { label: '2019', value: 71 },
  { label: '2020', value: 48 },
  { label: '2021', value: 83 },
  { label: '2022', value: 91 },
  { label: '2023', value: 77 },
  { label: '2024', value: 95 },
  { label: '2025', value: 68 },
];

const donutData: DonutDatum[] = [
  { name: 'Projets', value: 41.2 },
  { name: 'Centres de coût', value: 23.6 },
  { name: 'Frais généraux', value: 17.9 },
  { name: 'Refacturations', value: 11.4 },
  { name: 'Non ventilé', value: 5.9 },
];

const waterfallData: WaterfallDatum[] = [
  { label: "Chiffre d'affaires", value: 1000, isTotal: true },
  { label: 'Achats', value: -420 },
  { label: 'Services ext.', value: -180 },
  { label: 'Charges pers.', value: -240 },
  { label: 'Amortissements', value: -60 },
  { label: 'Produits fin.', value: 35 },
  { label: 'Résultat net', value: 135, isTotal: true },
];

export default function ChartGallery() {
  const colors = useChartColors();
  const dark = useApp((s) => s.theme) === 'dark';

  const text = dark ? '#d4d4d4' : '#525252';
  const track = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const surface = dark ? '#202020' : '#ffffff';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Galerie de graphiques"
        subtitle="3 modèles réutilisables, branchés sur la palette de marque et le mode sombre — données illustratives"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Barres « pilule » + timeline"
          subtitle="Taux d'exécution budgétaire par exercice — pillBarOption()"
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={300}
              option={pillBarOption(pillData, { colors, textColor: text, trackColor: track, unit: '%', max: 110 })}
            />
          </div>
        </Card>

        <Card
          title="Donut « explosé » + libellé central"
          subtitle="Couverture analytique par axe — explodedDonutOption()"
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={300}
              option={explodedDonutOption(donutData, {
                colors,
                textColor: text,
                trackColor: surface,
                unit: '%',
                explodeIndex: 0,
                centerTitle: '94,1%',
                centerSubtitle: 'COUVERTURE',
              })}
            />
          </div>
        </Card>

        <Card
          title="Waterfall « pilule »"
          subtitle="Passage du CA au Résultat Net (SIG) — waterfallOption()"
          className="lg:col-span-2"
          padded={false}
        >
          <div className="px-5 pb-5">
            <Chart
              height={320}
              option={waterfallOption(waterfallData, { colors, textColor: text, unit: ' M' })}
            />
          </div>
        </Card>
      </div>

      <Card variant="ghost">
        <p className="text-xs text-primary-500 leading-relaxed">
          <span className="font-semibold text-primary-700 dark:text-primary-300">Réutilisation —</span>{' '}
          importez les builders depuis <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">src/lib/chartTemplates.ts</code>,
          passez vos données + <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">colors=useChartColors()</code>,
          et rendez le résultat avec <code className="px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-800 font-mono text-[11px]">&lt;Chart option=&#123;...&#125; /&gt;</code>.
          Les couleurs suivent automatiquement la palette active et le thème.
        </p>
      </Card>
    </div>
  );
}
