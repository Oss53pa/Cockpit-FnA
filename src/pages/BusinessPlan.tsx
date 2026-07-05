// Business Plan — prévisionnel pluriannuel (3 ans)
// Projette CA, EBE, résultat net et trésorerie cumulée sur 3 exercices à partir
// des états courants, selon 3 scénarios de croissance. Complète multi_year
// (rétrospectif) et forecast 90 j (court terme) par une vision forward moyen terme.
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { TrendingUp, Target, LineChart as LineIcon, Wallet } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);
type Scenario = 'prudent' | 'central' | 'optimiste';
const SCENARIOS: Record<Scenario, { g: number; label: string; margeGain: number }> = {
  prudent: { g: 0.03, label: 'Prudent (+3 %/an)', margeGain: 0 },
  central: { g: 0.08, label: 'Central (+8 %/an)', margeGain: 0.005 },
  optimiste: { g: 0.15, label: 'Optimiste (+15 %/an)', margeGain: 0.01 },
};

export default function BusinessPlan() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  const [scenario, setScenario] = useState<Scenario>('central');

  const model = useMemo(() => {
    if (!sig) return null;
    const ca0 = n(sig.ca);
    const ebe0 = n(sig.ebe);
    const rn0 = n(sig.resultat);
    const amort = balance.filter((r) => /^68/.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
    const ebeMarge = ca0 > 0 ? ebe0 / ca0 : 0;
    const rnMarge = ca0 > 0 ? rn0 / ca0 : 0;

    const { g, margeGain } = SCENARIOS[scenario];
    const rows = [] as Array<{ annee: string; ca: number; ebe: number; rn: number; cafCumul: number }>;
    let cafCumul = 0;
    for (let i = 0; i <= 3; i++) {
      const ca = ca0 * Math.pow(1 + g, i);
      const ebeM = Math.min(0.6, ebeMarge + margeGain * i);   // léger gain de marge (effet volume)
      const rnM = rnMarge + margeGain * i;
      const ebe = ca * ebeM;
      const rn = ca * rnM;
      const caf = rn + n(amort);                                // CAF ≈ RN + amortissements
      cafCumul += i === 0 ? 0 : caf;                            // cumul à partir de N+1
      rows.push({ annee: i === 0 ? `${currentYear} (réel)` : `${currentYear + i}`, ca, ebe, rn, cafCumul });
    }
    const last = rows[rows.length - 1];
    const tcam = ca0 > 0 ? (Math.pow(last.ca / ca0, 1 / 3) - 1) * 100 : 0;
    return { rows, ca0, last, tcam, ebeMarge, rnMarge };
  }, [sig, balance, scenario, currentYear]);

  if (!sig) {
    return (
      <div>
        <DashboardTopBar currentRoute="/dashboard/business-plan" />
        <DashHeader icon="BP" title="Business Plan — prévisionnel 3 ans" subtitle="Chargement des états financiers…" />
      </div>
    );
  }

  const m = model!;

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/business-plan" />
      <div className="flex justify-end mb-3">
        <TabSwitch
          tabs={[
            { key: 'prudent', label: 'Prudent' },
            { key: 'central', label: 'Central' },
            { key: 'optimiste', label: 'Optimiste' },
          ]}
          value={scenario}
          onChange={(k) => setScenario(k as Scenario)}
        />
      </div>
      <DashHeader
        icon="BP"
        title="Business Plan — prévisionnel pluriannuel"
        subtitle={`Projection ${currentYear}→${currentYear + 3} · scénario ${SCENARIOS[scenario].label} — ${org?.name ?? '—'}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title={`CA ${currentYear + 3}`} value={fmtK(m.last.ca)} unit="XOF" subValue={`TCAM +${m.tcam.toFixed(1)} %`} icon={<TrendingUp className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title={`EBE ${currentYear + 3}`} value={fmtK(m.last.ebe)} unit="XOF" subValue={`Marge ${(m.ebeMarge * 100).toFixed(1)} %`} icon={<Target className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title={`Résultat net ${currentYear + 3}`} value={fmtK(m.last.rn)} unit="XOF" subValue={`Marge ${(m.rnMarge * 100).toFixed(1)} %`} icon={<LineIcon className="w-4 h-4" />} color={m.last.rn >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title="Cash cumulé 3 ans" value={fmtK(m.last.cafCumul)} unit="XOF" subValue="CAF cumulée N+1→N+3" icon={<Wallet className="w-4 h-4" />} color={ct.at(2)} />
      </div>

      <ChartCard title="Trajectoire prévisionnelle" subtitle="CA & EBE (barres) · Résultat net (courbe) — 3 exercices projetés" accent={ct.at(0)}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={m.rows} margin={{ left: 10, right: 10 }}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="annee" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} iconType="circle" iconSize={8} />
            <Bar dataKey="ca" name="Chiffre d'affaires" fill={ct.at(0)} radius={[6, 6, 0, 0]} />
            <Bar dataKey="ebe" name="EBE" fill={ct.at(3)} radius={[6, 6, 0, 0]} />
            <Line type="monotone" dataKey="rn" name="Résultat net" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Détail de la projection" subtitle="Hypothèses : croissance appliquée au CA, structure de coûts stable + léger effet volume" accent={ct.at(3)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                <th className="text-left py-2 px-3">Exercice</th>
                <th className="text-right py-2 px-3">Chiffre d'affaires</th>
                <th className="text-right py-2 px-3">EBE</th>
                <th className="text-right py-2 px-3">Résultat net</th>
                <th className="text-right py-2 px-3 hidden md:table-cell">CAF cumulée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {m.rows.map((r, i) => (
                <tr key={i} className={i === 0 ? 'bg-primary-50/60 dark:bg-primary-900/40' : 'hover:bg-primary-50/60 dark:hover:bg-primary-900/40'}>
                  <td className="py-2.5 px-3 font-medium">{r.annee}</td>
                  <td className="py-2.5 px-3 text-right num">{fmtFull(r.ca)}</td>
                  <td className="py-2.5 px-3 text-right num">{fmtFull(r.ebe)}</td>
                  <td className={`py-2.5 px-3 text-right num font-semibold ${r.rn >= 0 ? 'text-success' : 'text-error'}`}>{fmtFull(r.rn)}</td>
                  <td className="py-2.5 px-3 text-right num hidden md:table-cell">{fmtFull(r.cafCumul)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-primary-400 mt-3 leading-relaxed">
          Modèle déterministe simple : le CA croît au taux du scénario, la structure de coûts reste stable avec un léger gain de marge par effet volume. Projection indicative — à affiner avec vos hypothèses commerciales et d'investissement (module What-If pour la sensibilité).
        </p>
      </ChartCard>
    </div>
  );
}
