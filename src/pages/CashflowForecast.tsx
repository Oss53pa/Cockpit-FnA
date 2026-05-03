// Cashflow prévisionnel 13 semaines
// Classique treasurer view : projection semaine par semaine de la trésorerie
// à partir des échéances clients, fournisseurs, salaires, impôts.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useBalance, useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';
import { agedBalance, AgedTier } from '../engine/analytics';
import { SEMANTIC } from '../lib/semantic';

type Week = {
  label: string;
  weekNum: number;
  encaissementsClients: number;
  decaissementsFourn: number;
  salaires: number;
  impots: number;
  autres: number;
  netCashflow: number;
  cumulatedCash: number;
};

export default function CashflowForecast() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const balance = useBalance();
  const { sig, movements } = useStatements();
  const ct = useChartTheme();

  const [clients, setClients] = useState<AgedTier[]>([]);
  const [fournisseurs, setFournisseurs] = useState<AgedTier[]>([]);
  const [criticalThreshold, setCriticalThreshold] = useState(0);

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'client').then((r) => setClients(r.rows));
    agedBalance(currentOrgId, currentYear, 'fournisseur').then((r) => setFournisseurs(r.rows));
  }, [currentOrgId, currentYear]);

  // Trésorerie de départ = solde D 50-58 − solde C 56
  const tresoStart = useMemo(() => {
    const actif = balance.filter((r) => r.account.match(/^5[0-4578]/) && !r.account.startsWith('56')).reduce((s, r) => s + r.soldeD, 0);
    const passif = balance.filter((r) => r.account.startsWith('56')).reduce((s, r) => s + r.soldeC, 0);
    return actif - passif;
  }, [balance]);

  // Salaires mensuels moyens depuis mouvements classe 66 / 12 mois
  const salairesMensuel = useMemo(() => {
    const src = movements.length > 0 ? movements : balance;
    const personnel = src.filter((r) => r.account.startsWith('66')).reduce((s, r) => s + r.debit - r.credit, 0);
    return Math.max(0, personnel / 12);
  }, [movements, balance]);

  // Impôts / taxes mensuels moyens : classe 64 / 12
  const impotsMensuel = useMemo(() => {
    const src = movements.length > 0 ? movements : balance;
    const taxes = src.filter((r) => r.account.startsWith('64')).reduce((s, r) => s + r.debit - r.credit, 0);
    return Math.max(0, taxes / 12);
  }, [movements, balance]);

  // CA moyen / semaine pour estimer les entrées futures au-delà des créances actuelles
  const caHebdoEstime = useMemo(() => (sig?.ca ?? 0) / 52, [sig]);

  // Projection 13 semaines — basée sur les BUCKETS RÉELS de la balance âgée
  const weeks = useMemo<Week[]>(() => {
    const out: Week[] = [];
    let cumul = tresoStart;

    // Agrégation des buckets clients & fournisseurs
    // index : 0=Non échu, 1=0-30j, 2=31-60j, 3=61-90j, 4=> 90j
    // On ne compte que les soldes positifs (créances/dettes ouvertes), les soldes
    // négatifs (avoirs) ne sont pas des encaissements/décaissements à venir.
    const arBuckets = [0, 0, 0, 0, 0];
    for (const r of clients) {
      if (r.total <= 0) continue;
      for (let i = 0; i < 5; i++) arBuckets[i] += Math.max(0, r.buckets[i] || 0);
    }
    const apBuckets = [0, 0, 0, 0, 0];
    for (const r of fournisseurs) {
      if (r.total <= 0) continue;
      for (let i = 0; i < 5; i++) apBuckets[i] += Math.max(0, r.buckets[i] || 0);
    }

    // Hypothèse de timing d'encaissement réaliste :
    //  - Non échu (B0)   → encaissé entre S5 et S8 (4 semaines)
    //  - 0-30j (B1)      → encaissé entre S1 et S4 (4 semaines)
    //  - 31-60j (B2)     → encaissé entre S1 et S2 (échus, à recouvrer vite)
    //  - 61-90j (B3)     → 70 % entre S1-S4 (recouvrement actif), 30 % perdu
    //  - > 90j (B4)      → 40 % entre S5-S13 (recouvrement difficile), 60 % considéré douteux
    // Pour les paiements fournisseurs, hypothèse symétrique mais l'entreprise
    // paye les échus en priorité (B2/B3 en S1-S4), les non-échus à terme.
    const arWeekly: number[] = Array(13).fill(0);
    const apWeekly: number[] = Array(13).fill(0);
    const distribute = (amount: number, fromWeek: number, toWeek: number, target: number[]) => {
      const span = toWeek - fromWeek + 1;
      if (span <= 0 || amount <= 0) return;
      const per = amount / span;
      for (let w = fromWeek; w <= toWeek; w++) target[w - 1] += per;
    };

    // Encaissements clients
    distribute(arBuckets[2], 1, 2, arWeekly);          // 31-60j → S1-S2
    distribute(arBuckets[3] * 0.7, 1, 4, arWeekly);    // 61-90j → S1-S4 (70 %)
    distribute(arBuckets[1], 1, 4, arWeekly);          // 0-30j → S1-S4
    distribute(arBuckets[0], 5, 8, arWeekly);          // Non échu → S5-S8
    distribute(arBuckets[4] * 0.4, 5, 13, arWeekly);   // > 90j → S5-S13 (40 %)

    // Décaissements fournisseurs
    distribute(apBuckets[2], 1, 2, apWeekly);
    distribute(apBuckets[3], 1, 4, apWeekly);
    distribute(apBuckets[4], 1, 4, apWeekly);          // payer les très en retard d'abord
    distribute(apBuckets[1], 1, 4, apWeekly);
    distribute(apBuckets[0], 5, 8, apWeekly);

    const impotsHebdo = impotsMensuel / 4.33;
    const autresHebdo = caHebdoEstime * 0.05;

    for (let w = 1; w <= 13; w++) {
      // Encaissements = recouvrement des créances + nouvelles ventes (CA hebdo)
      const enc = arWeekly[w - 1] + caHebdoEstime;
      // Décaissements fournisseurs = paiement échéancier + nouveaux achats (≈ 60 % CA)
      const dec = apWeekly[w - 1] + caHebdoEstime * 0.60;
      // Salaires payés en S4, S8, S13 (fin de mois)
      const sal = (w === 4 || w === 8 || w === 13) ? salairesMensuel : 0;
      // Impôts trimestriels en S13
      const imp = (w === 13) ? impotsMensuel * 3 : impotsHebdo;
      const autres = autresHebdo;

      const net = enc - dec - sal - imp - autres;
      cumul += net;

      out.push({
        label: `S${w}`,
        weekNum: w,
        encaissementsClients: Math.round(enc),
        decaissementsFourn: Math.round(dec),
        salaires: Math.round(sal),
        impots: Math.round(imp),
        autres: Math.round(autres),
        netCashflow: Math.round(net),
        cumulatedCash: Math.round(cumul),
      });
    }
    return out;
  }, [tresoStart, clients, fournisseurs, salairesMensuel, impotsMensuel, caHebdoEstime]);

  const minCash = useMemo(() => Math.min(...weeks.map((w) => w.cumulatedCash)), [weeks]);
  const minWeek = useMemo(() => weeks.find((w) => w.cumulatedCash === minCash)?.label ?? '—', [weeks, minCash]);
  const finalCash = weeks[weeks.length - 1]?.cumulatedCash ?? 0;
  const totalEnc = weeks.reduce((s, w) => s + w.encaissementsClients, 0);
  const totalDec = weeks.reduce((s, w) => s + w.decaissementsFourn + w.salaires + w.impots + w.autres, 0);

  const isCritical = minCash < criticalThreshold;

  const nivoTheme = {
    background: 'transparent',
    text: { fontSize: 10, fill: 'rgb(var(--p-600))' },
    axis: {
      ticks: { text: { fontSize: 9, fill: 'rgb(var(--p-500))' } },
      legend: { text: { fontSize: 10, fill: 'rgb(var(--p-600))' } },
      domain: { line: { stroke: 'rgb(var(--p-300))', strokeWidth: 1 } },
    },
    grid: { line: { stroke: 'rgb(var(--p-200))', strokeDasharray: '3 3' } },
    legends: { text: { fontSize: 10, fill: 'rgb(var(--p-600))' } },
    tooltip: {
      container: { background: 'rgb(var(--p-900))', color: 'rgb(var(--p-50))', fontSize: 11, borderRadius: 8, padding: '8px 12px' },
    },
  };

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/cashforecast" />

      <DashHeader
        icon="CF"
        title="Cashflow prévisionnel 13 semaines"
        subtitle={`Projection hebdomadaire basée sur les échéanciers AR/AP — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Trésorerie actuelle" value={fmtK(tresoStart)} unit="XOF" icon={<Wallet className="w-4 h-4" />} color={tresoStart >= 0 ? ct.at(0) : SEMANTIC.danger} />
        <KPICard title="Trésorerie à S+13" value={fmtK(finalCash)} unit="XOF" subValue={finalCash >= tresoStart ? 'En amélioration' : 'En dégradation'} icon={finalCash >= tresoStart ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} color={finalCash >= 0 ? ct.at(3) : SEMANTIC.danger} />
        <KPICard title="Trésorerie minimale" value={fmtK(minCash)} unit="XOF" subValue={`atteinte en ${minWeek}`} icon={<AlertTriangle className="w-4 h-4" />} color={minCash >= 0 ? SEMANTIC.success : SEMANTIC.danger} />
        <KPICard title="Flux net cumulé" value={fmtK(totalEnc - totalDec)} unit="XOF" subValue={`${fmtK(totalEnc)} encaissés · ${fmtK(totalDec)} décaissés`} icon={<Wallet className="w-4 h-4" />} color={ct.at(4)} />
      </div>

      {isCritical && (
        <div className="mb-4 p-3 rounded-lg bg-error/10 border-l-4 border-error flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-error">Alerte trésorerie critique</p>
            <p className="text-[12px] text-primary-700 dark:text-primary-200 mt-0.5">
              Le solde prévisionnel passe sous le seuil critique de {fmtFull(criticalThreshold)} XOF en {minWeek} ({fmtFull(minCash)} XOF). Actions recommandées : accélérer le recouvrement clients, négocier des délais fournisseurs, activer la ligne de découvert.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <ChartCard title="Position prévisionnelle" subtitle="Solde de trésorerie cumulé S1 → S13" accent={ct.at(0)} className="lg:col-span-2">
          <div style={{ height: 260 }}>
            <ResponsiveLine
              data={[{ id: 'Trésorerie cumulée', data: weeks.map((w) => ({ x: w.label, y: w.cumulatedCash })) }]}
              margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
              curve="monotoneX"
              colors={[ct.at(0)]}
              lineWidth={2.5}
              enablePoints
              pointSize={5}
              pointBorderWidth={2}
              pointBorderColor={{ theme: 'background' }}
              enableArea
              areaOpacity={0.12}
              enableGridY
              axisLeft={{ format: (v: number) => fmtK(v) }}
              theme={nivoTheme}
              animate={false}
              markers={[
                { axis: 'y', value: criticalThreshold, lineStyle: { stroke: SEMANTIC.danger, strokeWidth: 1.5, strokeDasharray: '5 5' }, legend: `Seuil critique`, legendOrientation: 'horizontal', textStyle: { fill: SEMANTIC.danger, fontSize: 9 } },
                { axis: 'y', value: 0, lineStyle: { stroke: 'rgb(var(--p-400))', strokeWidth: 1 } },
              ]}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <label className="text-primary-500 font-semibold uppercase tracking-wider">Seuil critique :</label>
            <input
              type="number"
              className="input !py-1 !text-[11px] !w-32 num"
              value={criticalThreshold}
              onChange={(e) => setCriticalThreshold(Number(e.target.value) || 0)}
            />
            <span className="text-primary-400">XOF — niveau en dessous duquel vous voulez être alerté</span>
          </div>
        </ChartCard>

        <ChartCard title="Flux net hebdo" subtitle="Encaissements − décaissements" accent={ct.at(1)} className="lg:col-span-1">
          <div style={{ height: 260 }}>
            <ResponsiveBar
              data={weeks.map((w) => ({ week: w.label, value: w.netCashflow }))}
              keys={['value']}
              indexBy="week"
              margin={{ top: 10, right: 10, bottom: 40, left: 50 }}
              padding={0.25}
              colors={({ data }) => ((data as any).value >= 0 ? SEMANTIC.success : SEMANTIC.danger)}
              colorBy="indexValue"
              axisBottom={{ tickRotation: -45 }}
              axisLeft={{ format: (v: number) => fmtK(v) }}
              enableLabel={false}
              borderRadius={2}
              theme={nivoTheme}
              animate={false}
            />
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Détail hebdomadaire" subtitle="Encaissements et décaissements ligne par ligne" accent={ct.at(3)}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
              <tr>
                <th className="text-left py-2 px-2 sticky left-0 bg-primary-100 dark:bg-primary-900 z-10">Semaine</th>
                <th className="text-right py-2 px-2 text-success">↑ Clients</th>
                <th className="text-right py-2 px-2 text-error">↓ Fournisseurs</th>
                <th className="text-right py-2 px-2 text-error">↓ Salaires</th>
                <th className="text-right py-2 px-2 text-error">↓ Impôts</th>
                <th className="text-right py-2 px-2 text-error">↓ Autres</th>
                <th className="text-right py-2 px-2 font-bold border-l border-primary-300 dark:border-primary-700">Net</th>
                <th className="text-right py-2 px-2 font-bold">Cumul</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {weeks.map((w) => (
                <tr key={w.weekNum} className={`hover:bg-primary-100/40 dark:hover:bg-primary-900/40 ${w.cumulatedCash < criticalThreshold ? 'bg-error/5' : ''}`}>
                  <td className="py-1.5 px-2 font-semibold sticky left-0 bg-white dark:bg-primary-900">{w.label}</td>
                  <td className="py-1.5 px-2 text-right num text-success">{fmtFull(w.encaissementsClients)}</td>
                  <td className="py-1.5 px-2 text-right num">{fmtFull(w.decaissementsFourn)}</td>
                  <td className="py-1.5 px-2 text-right num">{w.salaires ? fmtFull(w.salaires) : <span className="text-primary-300">—</span>}</td>
                  <td className="py-1.5 px-2 text-right num">{fmtFull(w.impots)}</td>
                  <td className="py-1.5 px-2 text-right num">{fmtFull(w.autres)}</td>
                  <td className={`py-1.5 px-2 text-right num font-bold border-l border-primary-200 dark:border-primary-800 ${w.netCashflow >= 0 ? 'text-success' : 'text-error'}`}>{w.netCashflow >= 0 ? '+' : ''}{fmtFull(w.netCashflow)}</td>
                  <td className={`py-1.5 px-2 text-right num font-bold ${w.cumulatedCash < 0 ? 'text-error' : w.cumulatedCash < criticalThreshold ? 'text-warning' : ''}`}>{fmtFull(w.cumulatedCash)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 font-bold">
              <tr>
                <td className="py-2 px-2 sticky left-0 bg-primary-100 dark:bg-primary-900">TOTAUX</td>
                <td className="py-2 px-2 text-right num text-success">{fmtFull(weeks.reduce((s, w) => s + w.encaissementsClients, 0))}</td>
                <td className="py-2 px-2 text-right num">{fmtFull(weeks.reduce((s, w) => s + w.decaissementsFourn, 0))}</td>
                <td className="py-2 px-2 text-right num">{fmtFull(weeks.reduce((s, w) => s + w.salaires, 0))}</td>
                <td className="py-2 px-2 text-right num">{fmtFull(weeks.reduce((s, w) => s + w.impots, 0))}</td>
                <td className="py-2 px-2 text-right num">{fmtFull(weeks.reduce((s, w) => s + w.autres, 0))}</td>
                <td className={`py-2 px-2 text-right num border-l border-primary-200 dark:border-primary-800 ${finalCash >= tresoStart ? 'text-success' : 'text-error'}`}>
                  {(totalEnc - totalDec) >= 0 ? '+' : ''}{fmtFull(totalEnc - totalDec)}
                </td>
                <td className={`py-2 px-2 text-right num ${finalCash < 0 ? 'text-error' : ''}`}>{fmtFull(finalCash)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[10px] text-primary-400 italic mt-2">
          Hypothèses&nbsp;: les encaissements clients suivent un profil d'âge des créances (30 % en S1-4, 40 % en S5-8, 20 % en S9-13, 10 % considérés comme douteux). Les salaires sont versés en fin de mois (S4, S8, S13). Les impôts trimestriels passent en S13.
        </p>
      </ChartCard>
    </div>
  );
}
