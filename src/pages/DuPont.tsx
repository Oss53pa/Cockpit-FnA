// Analyse DuPont — décomposition de la rentabilité des capitaux propres (ROE)
// ROE = Marge nette × Rotation de l'actif × Levier financier
//     = (RN/CA)     × (CA/Actif)        × (Actif/CP)
// Isole les 3 leviers de la performance : rentabilité, efficience, structure.
import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Percent, Activity, Scale, Award, TrendingUp } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);

export default function DuPont() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ct = useChartTheme();

  const model = useMemo(() => {
    if (!sig || !bilan) return null;
    const g = (lines: { code: string; value: number }[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
    const rn = n(sig.resultat);
    const ca = n(sig.ca);
    const actif = n(g(bilan.actif, '_BZ'));
    const cp = n(g(bilan.passif, '_CP'));

    const margeNette = ca > 0 ? rn / ca : 0;              // rentabilité commerciale
    const rotation = actif > 0 ? ca / actif : 0;          // efficience des actifs
    const levier = cp > 0 ? actif / cp : 0;               // structure financière
    const roe = margeNette * rotation * levier;           // = RN / CP
    const roa = actif > 0 ? rn / actif : 0;               // rentabilité économique
    const roeDirect = cp > 0 ? rn / cp : 0;

    return { rn, ca, actif, cp, margeNette, rotation, levier, roe, roa, roeDirect };
  }, [sig, bilan]);

  if (!sig || !bilan) {
    return (
      <div>
        <DashboardTopBar currentRoute="/dashboard/dupont" />
        <DashHeader icon="DP" title="Analyse DuPont — ROE" subtitle="Chargement des états financiers…" />
      </div>
    );
  }

  const m = model!;
  // Normalisation visuelle des 3 facteurs (chacun ramené à un index lisible).
  const factors = [
    { nom: 'Marge nette', value: m.margeNette * 100, unite: '%', aff: `${(m.margeNette * 100).toFixed(1)} %`, sens: 'Rentabilité commerciale (RN / CA)' },
    { nom: "Rotation de l'actif", value: m.rotation, unite: '×', aff: `${m.rotation.toFixed(2)}×`, sens: 'Efficience des actifs (CA / Actif)' },
    { nom: 'Levier financier', value: m.levier, unite: '×', aff: `${m.levier.toFixed(2)}×`, sens: 'Structure (Actif / Capitaux propres)' },
  ];

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/dupont" />
      <DashHeader
        icon="DP"
        title="Analyse DuPont — Rentabilité des capitaux propres"
        subtitle={`ROE décomposé en marge × rotation × levier — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="ROE (rentabilité financière)" value={`${(m.roe * 100).toFixed(1)} %`} subValue="Résultat net / capitaux propres" icon={<Award className="w-4 h-4" />} color={m.roe >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title="Marge nette" value={`${(m.margeNette * 100).toFixed(1)} %`} subValue="RN / CA" icon={<Percent className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Rotation de l'actif" value={`${m.rotation.toFixed(2)}×`} subValue="CA / Actif" icon={<Activity className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title="Levier financier" value={`${m.levier.toFixed(2)}×`} subValue="Actif / CP" icon={<Scale className="w-4 h-4" />} color={ct.at(2)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Équation DuPont" subtitle="ROE = Marge nette × Rotation × Levier" accent={ct.at(0)}>
          <div className="flex items-center justify-center gap-2 md:gap-4 py-6 flex-wrap">
            <FactorCard label="Marge nette" value={`${(m.margeNette * 100).toFixed(1)} %`} color={ct.at(3)} />
            <Op>×</Op>
            <FactorCard label="Rotation" value={`${m.rotation.toFixed(2)}×`} color={ct.at(4)} />
            <Op>×</Op>
            <FactorCard label="Levier" value={`${m.levier.toFixed(2)}×`} color={ct.at(2)} />
            <Op>=</Op>
            <FactorCard label="ROE" value={`${(m.roe * 100).toFixed(1)} %`} color={m.roe >= 0 ? ct.at(0) : ct.at(1)} big />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 text-center">
            <MiniStat label="ROA (éco.)" value={`${(m.roa * 100).toFixed(1)} %`} />
            <MiniStat label="Chiffre d'affaires" value={fmtK(m.ca)} />
            <MiniStat label="Capitaux propres" value={fmtK(m.cp)} />
          </div>
        </ChartCard>

        <ChartCard title="Contribution des leviers" subtitle="Les 3 facteurs de la rentabilité financière" accent={ct.at(3)}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={factors} margin={{ left: 10, right: 10 }}>
              <CartesianGrid {...ct.gridProps} />
              <XAxis dataKey="nom" {...ct.axisProps} />
              <YAxis {...ct.axisProps} />
              <Tooltip formatter={(v: any, _k, p: any) => p?.payload?.aff ?? v} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {factors.map((_, i) => <Cell key={i} fill={ct.at([3, 4, 2][i])} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ul className="text-[11px] text-primary-500 dark:text-primary-400 space-y-1.5 mt-3 leading-relaxed">
            {factors.map((f, i) => (
              <li key={i}><strong className="text-primary-700 dark:text-primary-200">{f.nom} ({f.aff})</strong> — {f.sens}</li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}

function FactorCard({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className={`rounded-xl border border-primary-200 dark:border-primary-800 px-3 py-2.5 text-center ${big ? 'shadow-md' : ''}`} style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <p className={`num font-bold ${big ? 'text-2xl' : 'text-lg'}`} style={{ color }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 mt-0.5">{label}</p>
    </div>
  );
}
function Op({ children }: { children: React.ReactNode }) {
  return <span className="text-xl font-bold text-primary-400">{children}</span>;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-primary-50 dark:bg-primary-900/40 p-2">
      <p className="text-[10px] uppercase tracking-wider text-primary-500">{label}</p>
      <p className="num text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}
