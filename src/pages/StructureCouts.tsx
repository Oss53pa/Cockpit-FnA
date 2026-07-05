// Structure des coûts & coût de revient
// Décompose les charges par nature (classe 6 SYSCOHADA), les classe en
// variables / fixes, et rapporte chaque poste au CA. Complète le Seuil de
// rentabilité (courbe CVP) par le détail de la structure de coûts.
import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Layers, Percent, Anchor, Waves } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);

// Nature des charges SYSCOHADA (classe 6) + tendance coût (variable / fixe).
const NATURES: { prefix: string; nom: string; type: 'variable' | 'fixe' }[] = [
  { prefix: '60', nom: 'Achats & variations de stocks', type: 'variable' },
  { prefix: '61', nom: 'Transports', type: 'variable' },
  { prefix: '62', nom: 'Services extérieurs A', type: 'fixe' },
  { prefix: '63', nom: 'Services extérieurs B', type: 'fixe' },
  { prefix: '64', nom: 'Impôts & taxes', type: 'fixe' },
  { prefix: '65', nom: 'Autres charges', type: 'fixe' },
  { prefix: '66', nom: 'Charges de personnel', type: 'fixe' },
  { prefix: '67', nom: 'Frais financiers', type: 'fixe' },
  { prefix: '68', nom: 'Dotations aux amort. & prov.', type: 'fixe' },
];

export default function StructureCouts() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, balance } = useStatements();
  const ct = useChartTheme();

  const model = useMemo(() => {
    if (!sig) return null;
    const ca = n(sig.ca);
    // Solde débiteur net d'un préfixe (charge = débit), hors comptes de contrepartie 603/609…
    const chargeOf = (prefix: string) => balance
      .filter((r) => r.account.startsWith(prefix))
      .reduce((s, r) => s + (r.soldeD - r.soldeC), 0);

    const postes = NATURES.map((nat) => {
      const montant = Math.max(0, chargeOf(nat.prefix));
      return { ...nat, montant, pctCA: ca > 0 ? (montant / ca) * 100 : 0 };
    }).filter((p) => p.montant > 0).sort((a, b) => b.montant - a.montant);

    const total = postes.reduce((s, p) => s + p.montant, 0);
    const variables = postes.filter((p) => p.type === 'variable').reduce((s, p) => s + p.montant, 0);
    const fixes = postes.filter((p) => p.type === 'fixe').reduce((s, p) => s + p.montant, 0);
    const tauxCharges = ca > 0 ? (total / ca) * 100 : 0;
    const tauxMarge = ca > 0 ? ((ca - total) / ca) * 100 : 0;
    const partVariable = total > 0 ? (variables / total) * 100 : 0;
    // Point mort (CA critique) = charges fixes / taux de marge sur coûts variables.
    const margeCoutsVar = ca > 0 ? (ca - variables) / ca : 0;
    const pointMort = margeCoutsVar > 0 ? fixes / margeCoutsVar : 0;

    return { ca, postes, total, variables, fixes, tauxCharges, tauxMarge, partVariable, pointMort };
  }, [sig, balance]);

  if (!sig) {
    return (
      <div>
        <DashboardTopBar currentRoute="/dashboard/structure-couts" />
        <DashHeader icon="SC" title="Structure des coûts & coût de revient" subtitle="Chargement des états financiers…" />
      </div>
    );
  }

  const m = model!;

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/structure-couts" />
      <DashHeader
        icon="SC"
        title="Structure des coûts & coût de revient"
        subtitle={`Charges par nature, variables vs fixes, poids sur le CA — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Coût de revient total" value={fmtK(m.total)} unit="XOF" subValue={`${m.tauxCharges.toFixed(1)} % du CA`} icon={<Layers className="w-4 h-4" />} color={ct.at(1)} />
        <KPICard title="Taux de marge" value={`${m.tauxMarge.toFixed(1)} %`} subValue="(CA − charges) / CA" icon={<Percent className="w-4 h-4" />} color={m.tauxMarge >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title="Charges variables" value={fmtK(m.variables)} unit="XOF" subValue={`${m.partVariable.toFixed(0)} % des charges`} icon={<Waves className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title="Charges fixes" value={fmtK(m.fixes)} unit="XOF" subValue={`Point mort ≈ ${fmtK(m.pointMort)}`} icon={<Anchor className="w-4 h-4" />} color={ct.at(3)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Charges par nature" subtitle="Classe 6 SYSCOHADA — montant et poids sur le CA" accent={ct.at(1)} className="lg:col-span-2">
          {m.postes.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-primary-400">Aucune charge à afficher</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={m.postes} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid {...ct.gridProps} horizontal={false} />
                <XAxis type="number" {...ct.axisProps} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="nom" {...ct.axisProps} width={170} />
                <Tooltip formatter={(v: any, _k, p: any) => [`${fmtFull(v)} (${p?.payload?.pctCA?.toFixed(1)} % du CA)`, 'Montant']} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="montant" radius={[0, 6, 6, 0]}>
                  {m.postes.map((p, i) => <Cell key={i} fill={p.type === 'variable' ? ct.at(4) : ct.at(1)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Variable vs Fixe" subtitle="Structure du levier opérationnel" accent={ct.at(3)}>
          <div className="space-y-3 py-2">
            <SplitBar label="Charges variables" value={m.variables} total={m.total} color={ct.at(4)} />
            <SplitBar label="Charges fixes" value={m.fixes} total={m.total} color={ct.at(1)} />
          </div>
          <div className="mt-4 rounded-lg bg-primary-50 dark:bg-primary-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-primary-500">Point mort (CA critique)</p>
            <p className="num text-lg font-bold mt-0.5">{fmtFull(m.pointMort)}</p>
            <p className="text-[10px] text-primary-400 mt-1">
              CA à atteindre pour couvrir les charges fixes. {m.ca >= m.pointMort ? '✓ Franchi' : '⚠ Non atteint'}
            </p>
          </div>
          <p className="text-[10px] text-primary-400 mt-3 leading-relaxed">
            Classification variable/fixe indicative (60-61 variables ; 62-68 fixes). Affinez selon votre activité pour un point mort précis.
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

function SplitBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="font-medium">{label}</span>
        <span className="num text-primary-500">{fmtK(value)} · {pct.toFixed(0)} %</span>
      </div>
      <div className="h-2.5 rounded-full bg-primary-100 dark:bg-primary-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}
