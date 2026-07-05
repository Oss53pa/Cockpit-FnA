// Endettement & Dette financière
// Structure de la dette financière SYSCOHADA : gearing, capacité de
// remboursement, couverture du service de la dette (ICR/DSCR), composition
// LT/CT et coût de la dette. Comble le trou « dette bancaire » du catalogue.
import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Landmark, Scale, Gauge, ShieldAlert, Percent, TrendingDown } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);

export default function Endettement() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan, balance } = useStatements();
  const ct = useChartTheme();

  const model = useMemo(() => {
    if (!sig || !bilan) return null;
    const g = (lines: { code: string; value: number }[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
    const cp = n(g(bilan.passif, '_CP'));
    const totalBilan = n(g(bilan.actif, '_BZ'));

    // Solde net créditeur d'un ensemble de comptes (dette = crédit > débit).
    const netC = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
    const netD = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);

    // Dette financière : emprunts 16/17/18 (LT) + banques créditrices / découverts (52,561,565) (CT).
    const empruntsLT = Math.max(0, netC(/^(16|17|18)/));
    const decouverts = Math.max(0, netC(/^(52|561|565|566)/));
    const dettesFinBilan = n(g(bilan.passif, 'DA'));
    const dettesFin = dettesFinBilan > 0 ? dettesFinBilan : (empruntsLT + decouverts);

    // Flux & couverture
    const interets = Math.max(0, netD(/^67/));                 // frais financiers
    const dotations = netD(/^(68|69)/);
    const reprises = netC(/^(78|79)/);
    const cafg = n(sig.resultat) + dotations - reprises;        // capacité d'autofinancement globale
    const ebe = n(sig.ebe);

    // Ratios
    const gearing = cp > 0 ? (dettesFin / cp) * 100 : 0;        // dettes fin / CP (%)
    const tauxEndett = totalBilan > 0 ? (dettesFin / totalBilan) * 100 : 0;
    const capaRembours = cafg > 0 ? dettesFin / cafg : 0;       // en années
    const icr = interets > 0 ? ebe / interets : 0;             // interest coverage ratio
    const dscr = interets + empruntsLT > 0 ? cafg / (interets + empruntsLT * 0.2) : 0; // approx (20% amortissement/an)
    const coutDette = dettesFin > 0 ? (interets / dettesFin) * 100 : 0;
    const levier = cp > 0 ? totalBilan / cp : 0;
    const autonomie = totalBilan > 0 ? (cp / totalBilan) * 100 : 0;

    const composition = [
      { nom: 'Emprunts LT (16-18)', value: empruntsLT, terme: 'LT' },
      { nom: 'Découverts / banques (52,56)', value: decouverts, terme: 'CT' },
    ].filter((d) => d.value > 0);

    return {
      cp, totalBilan, dettesFin, empruntsLT, decouverts, interets, cafg, ebe,
      gearing, tauxEndett, capaRembours, icr, dscr, coutDette, levier, autonomie, composition,
    };
  }, [sig, bilan, balance]);

  if (!sig || !bilan) {
    return (
      <div>
        <DashboardTopBar currentRoute="/dashboard/endettement" />
        <DashHeader icon="EN" title="Endettement & Dette financière" subtitle="Chargement des états financiers…" />
      </div>
    );
  }

  const m = model!;
  // Seuils de référence (UEMOA / bonne pratique bancaire)
  const gearingTone = m.gearing <= 100 ? ct.at(0) : m.gearing <= 200 ? ct.at(3) : ct.at(1);
  const capaTone = m.capaRembours > 0 && m.capaRembours <= 4 ? ct.at(0) : m.capaRembours <= 7 ? ct.at(3) : ct.at(1);
  const icrTone = m.icr >= 3 ? ct.at(0) : m.icr >= 1.5 ? ct.at(3) : ct.at(1);

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/endettement" />
      <DashHeader
        icon="EN"
        title="Endettement & Dette financière"
        subtitle={`Structure de la dette, gearing et capacité de remboursement — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Dette financière totale" value={fmtK(m.dettesFin)} unit="XOF" subValue={`${m.tauxEndett.toFixed(1)} % du bilan`} icon={<Landmark className="w-4 h-4" />} color={ct.at(1)} />
        <KPICard title="Gearing (dette / CP)" value={`${m.gearing.toFixed(0)} %`} subValue={m.gearing <= 100 ? 'Sain (< 100 %)' : m.gearing <= 200 ? 'À surveiller' : 'Élevé (> 200 %)'} icon={<Scale className="w-4 h-4" />} color={gearingTone} />
        <KPICard title="Capacité de remboursement" value={m.capaRembours > 0 ? `${m.capaRembours.toFixed(1)} ans` : '—'} subValue={m.capaRembours > 0 && m.capaRembours <= 4 ? 'Confortable (< 4 ans)' : m.capaRembours <= 7 ? 'Acceptable' : 'Tendu / CAFG faible'} icon={<Gauge className="w-4 h-4" />} color={capaTone} />
        <KPICard title="Couverture des intérêts (ICR)" value={m.icr > 0 ? `${m.icr.toFixed(1)}×` : '—'} subValue={m.icr >= 3 ? 'Solide (≥ 3×)' : m.icr >= 1.5 ? 'Limite' : 'Risque'} icon={<ShieldAlert className="w-4 h-4" />} color={icrTone} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Autonomie financière" value={`${m.autonomie.toFixed(1)} %`} subValue="Capitaux propres / bilan" icon={<Percent className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title="Levier financier" value={m.levier > 0 ? `${m.levier.toFixed(2)}×` : '—'} subValue="Actif / capitaux propres" icon={<Scale className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Coût moyen de la dette" value={`${m.coutDette.toFixed(1)} %`} subValue={`Intérêts ${fmtK(m.interets)}`} icon={<TrendingDown className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title="CAFG" value={fmtK(m.cafg)} unit="XOF" subValue="Capacité d'autofinancement" icon={<Gauge className="w-4 h-4" />} color={ct.at(2)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Composition de la dette financière" subtitle="Long terme (emprunts) vs court terme (trésorerie passive)" accent={ct.at(1)}>
          {m.composition.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-primary-400">Aucune dette financière détectée</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.composition} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid {...ct.gridProps} horizontal={false} />
                <XAxis type="number" {...ct.axisProps} tickFormatter={fmtK} />
                <YAxis type="category" dataKey="nom" {...ct.axisProps} width={160} />
                <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {m.composition.map((d, i) => (
                    <Cell key={i} fill={d.terme === 'LT' ? ct.at(1) : ct.at(4)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Diagnostic d'endettement" subtitle="Lecture des ratios face aux normes bancaires UEMOA" accent={ct.at(0)}>
          <div className="space-y-2.5 text-[12px]">
            <DiagRow label="Gearing (dette / capitaux propres)" value={`${m.gearing.toFixed(0)} %`} verdict={m.gearing <= 100 ? 'ok' : m.gearing <= 200 ? 'warn' : 'bad'} norme="Cible < 100 % · alerte > 200 %" />
            <DiagRow label="Capacité de remboursement" value={m.capaRembours > 0 ? `${m.capaRembours.toFixed(1)} ans` : 'n/a'} verdict={m.capaRembours > 0 && m.capaRembours <= 4 ? 'ok' : m.capaRembours <= 7 ? 'warn' : 'bad'} norme="Dette / CAFG · cible < 4 ans" />
            <DiagRow label="Couverture des intérêts (ICR)" value={m.icr > 0 ? `${m.icr.toFixed(1)}×` : 'n/a'} verdict={m.icr >= 3 ? 'ok' : m.icr >= 1.5 ? 'warn' : 'bad'} norme="EBE / intérêts · cible ≥ 3×" />
            <DiagRow label="Service de la dette (DSCR approx.)" value={m.dscr > 0 ? `${m.dscr.toFixed(2)}×` : 'n/a'} verdict={m.dscr >= 1.2 ? 'ok' : m.dscr >= 1 ? 'warn' : 'bad'} norme="CAFG / service · cible ≥ 1,2×" />
            <DiagRow label="Autonomie financière" value={`${m.autonomie.toFixed(1)} %`} verdict={m.autonomie >= 30 ? 'ok' : m.autonomie >= 20 ? 'warn' : 'bad'} norme="CP / bilan · cible > 30 %" />
          </div>
          <p className="text-[10px] text-primary-400 mt-3 leading-relaxed">
            DSCR estimé (amortissement annuel supposé ≈ 20 % de la dette LT, faute d'échéancier détaillé dans le GL).
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

function DiagRow({ label, value, verdict, norme }: { label: string; value: string; verdict: 'ok' | 'warn' | 'bad'; norme: string }) {
  const color = verdict === 'ok' ? 'text-success' : verdict === 'warn' ? 'text-warning' : 'text-error';
  const dot = verdict === 'ok' ? 'bg-success' : verdict === 'warn' ? 'bg-warning' : 'bg-error';
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{label}</p>
        <p className="text-[10px] text-primary-400">{norme}</p>
      </div>
      <span className={`num font-semibold ${color}`}>{value}</span>
    </div>
  );
}
