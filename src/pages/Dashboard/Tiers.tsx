/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── CycleClient + CycleFournisseur ───────────────────────────────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useBalance, useRatios } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId, areaGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { useCloudData } from '../../hooks/useCloudData';
import { fmtFull, fmtK } from '../../lib/format';
import { agedBalance, monthlyByPrefix, AgedTier } from '../../engine/analytics';

// ── CycleClient ───────────────────────────────────────────────────────
export function CycleClient() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const ratios = useRatios();
  const balance = useBalance();
  const [aged, setAged] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  const [ca, setCA] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'client').then(setAged);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setCA);
  }, [currentOrgId, currentYear]);

  const creances = balance.filter((r) => r.account.startsWith('41')).reduce((s, r) => s + r.soldeD, 0);
  const douteuses = balance.filter((r) => r.account.startsWith('416')).reduce((s, r) => s + r.soldeD, 0);
  const dso = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const bucketTotals = aged.buckets.map((b, i) => ({ tranche: b, montant: aged.rows.reduce((s, r) => s + r.buckets[i], 0),
    color: [ct.at(4), ct.at(0), ct.at(3), ct.at(5), ct.at(1)][i] }));
  const top90 = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);

  const dsoEvol = ca.labels.map((m, i) => {
    const caM = ca.values[i] || 0;
    const vatR = 0.18;
    const caTTC = caM * (1 + vatR);
    const totalCa = ca.values.reduce((s, v) => s + v, 0) || 1;
    const creancesEstFinMois = creances * ((ca.values[i] || 0) / totalCa) * 12;
    const dsoM = caTTC > 0 ? Math.round((creancesEstFinMois / caTTC) * 30) : 0;
    return { mois: m, dso: Math.max(0, dsoM), objectif: 60 };
  });
  const cumulCa: number[] = [];
  ca.values.reduce((acc, v, i) => { cumulCa[i] = acc + v; return cumulCa[i]; }, 0);
  const totalCaY = cumulCa[cumulCa.length - 1] || 1;
  const creancesEvol = ca.labels.map((m, i) => ({
    mois: m,
    total: Math.round(creances * ((cumulCa[i] || 0) / totalCaY)),
    douteuses: Math.round(douteuses * ((cumulCa[i] || 0) / totalCaY)),
  }));
  const tauxBase = creances > 0 ? Math.round(((creances - douteuses) / creances) * 100) : 0;
  const recouv = ca.labels.map((m) => ({ mois: m, taux: tauxBase, objectif: 90 }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = creances - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 clients', value: creances ? Math.round((top3 / creances) * 100) : 0, color: ct.at(0) },
    { name: 'Clients 4-10', value: creances ? Math.round((top10sans3 / creances) * 100) : 0, color: ct.at(1) },
    { name: 'Autres', value: creances ? Math.round((autres / creances) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Créances totales" value={fmtK(creances)} unit="XOF" color={ct.at(0)} icon="CL" />
        <KPICard title="DSO" value={`${Math.round(dso)} j`} color={dso > 60 ? ct.at(3) : ct.at(4)} icon="DS" inverse subValue="Objectif : 60 jours" />
        <KPICard title="Taux recouvrement" value={creances > 0 ? `${Math.round(((creances - douteuses) / creances) * 100)} %` : '—'} color={ct.at(0)} icon="TR" subValue="Objectif : 90 %" />
        <KPICard title="Créances douteuses" value={fmtK(douteuses)} unit="XOF" color={ct.at(1)} icon="CD" inverse />
        <KPICard title="Créances > 90j" value={fmtK(top90)} unit="XOF" color={ct.at(1)} icon="90" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Balance âgée clients">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution du DSO (jours)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dsoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[30, 80]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dso" name="DSO réel" stroke={ct.at(0)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Objectif" stroke={ct.at(1)} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution des créances">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={creancesEvol}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Créances totales" fill={`url(#${areaGradId(0)})`} stroke={ct.at(0)} strokeWidth={2} />
              <Area type="monotone" dataKey="douteuses" name="Douteuses" fill={`url(#${areaGradId(1)})`} stroke={ct.at(1)} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taux de recouvrement mensuel (%)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={recouv}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[60, 100]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="taux" name="Taux recouvrement" radius={[6, 6, 0, 0]}>
                {recouv.map((e, i) => <Cell key={i} fill={e.taux >= 90 ? ct.at(4) : e.taux >= 80 ? ct.at(3) : ct.at(1)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Top 10 clients — Encours et Risque" className="lg:col-span-2">
          <div className="text-xs max-h-[280px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                  <th className="text-left py-1.5 px-1 text-primary-500">#</th>
                  <th className="text-left py-1.5 px-1 text-primary-500">Client</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">Encours</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">&gt; 90j</th>
                  <th className="text-center py-1.5 px-1 text-primary-500">Risque</th>
                </tr>
              </thead>
              <tbody>
                {aged.rows.slice(0, 10).map((r, i) => {
                  const retard = r.buckets[4] > 0;
                  const risque: 'low'|'medium'|'high' = r.buckets[4] > r.total * 0.3 ? 'high' : retard ? 'medium' : 'low';
                  const bg = risque === 'high' ? '#fee2e2' : risque === 'medium' ? '#fef3c7' : '#dcfce7';
                  const fg = risque === 'high' ? '#dc2626' : risque === 'medium' ? '#d97706' : '#16a34a';
                  return (
                    <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="py-1.5 px-1 text-primary-400 font-bold">{i + 1}</td>
                      <td className="py-1.5 px-1 font-mono">{r.tier}</td>
                      <td className="py-1.5 px-1 text-right num font-semibold">{fmtFull(r.total)}</td>
                      <td className="py-1.5 px-1 text-right num" style={{ color: r.buckets[4] > 0 ? ct.at(1) : undefined }}>
                        {r.buckets[4] > 0 ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {risque === 'high' ? '!! Élevé' : risque === 'medium' ? 'Moyen' : 'Faible'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Concentration clients">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={concentration} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value"
                label={(p: any) => `${p.value}%`}>
                {concentration.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="py-2">
            {concentration.map((e, i) => (
              <div key={i} className="flex justify-between py-1 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: e.color }} />{e.name}</span>
                <span className="num font-semibold">{e.value}%</span>
              </div>
            ))}
          </div>
          {concentration[0].value > 50 && (
            <div className="mt-2 p-2.5 rounded-lg text-[10px]" style={{ background: '#fef3c7', color: '#92400e' }}>
              !! <strong>Concentration :</strong> Top 3 clients &gt; 50 % du CA. Risque de dépendance.
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}

// ── CycleFournisseur ──────────────────────────────────────────────────
export function CycleFournisseur() {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const ratios = useRatios();
  const balance = useBalance();
  const [aged, setAged] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  const [ca, setCA] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    agedBalance(currentOrgId, currentYear, 'fournisseur').then(setAged);
    monthlyByPrefix(currentOrgId, currentYear, ['7']).then(setCA);
  }, [currentOrgId, currentYear]);

  const { data: nbFournisseurs = 0 } = useCloudData<number>(async () => {
    if (!currentOrgId) return 0;
    const [periods, entries] = await Promise.all([
      dataProvider.getPeriods(currentOrgId),
      dataProvider.getGLEntries({ orgId: currentOrgId }),
    ]);
    const ids = new Set(periods.filter((p) => p.year === currentYear).map((p) => p.id));
    const keys = new Set<string>();
    for (const e of entries) {
      if (!ids.has(e.periodId)) continue;
      if (!(e.account.startsWith('401') || e.account.startsWith('402') || e.account.startsWith('408'))) continue;
      if (e.tiers && e.tiers.trim()) keys.add(e.tiers.trim());
      else if (e.account.length > 3) keys.add(e.account);
    }
    return keys.size;
  }, [currentOrgId, currentYear], { initial: 0, tag: 'gl' });

  const { data: dettesMonthly = { total: Array(12).fill(0), echues: Array(12).fill(0) } } = useCloudData<{ total: number[]; echues: number[] }>(
    async () => {
      if (!currentOrgId) return { total: Array(12).fill(0), echues: Array(12).fill(0) };
      const [periods, entries] = await Promise.all([
        dataProvider.getPeriods(currentOrgId),
        dataProvider.getGLEntries({ orgId: currentOrgId }),
      ]);
      const openingPeriod = periods.find((p) => p.year === currentYear && p.month === 0);
      let running = 0;
      if (openingPeriod) {
        for (const e of entries) {
          if (e.periodId !== openingPeriod.id) continue;
          if (!e.account.startsWith('40')) continue;
          running += (e.credit - e.debit);
        }
      }

      const total: number[] = Array(12).fill(0);
      for (let m = 1; m <= 12; m++) {
        const p = periods.find((x) => x.year === currentYear && x.month === m);
        if (!p) { total[m - 1] = running; continue; }
        for (const e of entries) {
          if (e.periodId !== p.id) continue;
          if (!e.account.startsWith('40')) continue;
          running += (e.credit - e.debit);
        }
        total[m - 1] = running;
      }
      const { agedBalanceMonthly } = await import('../../engine/analytics');
      const monthly = await agedBalanceMonthly(currentOrgId, currentYear, 'fournisseur');
      const echues = monthly.map((s) => s.echusJusqu30 + s.echus3160 + s.echus6190 + s.echusPlus90);
      return { total, echues };
    },
    [currentOrgId, currentYear],
    { initial: { total: Array(12).fill(0), echues: Array(12).fill(0) }, tag: 'gl' },
  );

  const dettes = balance.filter((r) => r.account.startsWith('40')).reduce((s, r) => s + r.soldeC, 0);
  const dpo = ratios.find((r) => r.code === 'DPO')?.value ?? 0;
  const dsoRatio = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const echues = aged.rows.reduce((s, r) => s + (r.buckets[4] ?? 0), 0);
  const bucketTotals = aged.buckets.map((b, i) => ({ tranche: b, montant: aged.rows.reduce((s, r) => s + r.buckets[i], 0),
    color: [ct.at(4), ct.at(0), ct.at(3), ct.at(5), ct.at(1)][i] }));

  const dpoEvol = ca.labels.map((m) => ({ mois: m, dpo: Math.round(dpo), dso: Math.round(dsoRatio), objectif: 60 }));
  const dettesEvol = ca.labels.map((m, i) => ({ mois: m, total: dettesMonthly.total[i] ?? 0, echues: dettesMonthly.echues[i] ?? 0 }));
  const echeancier = Array.from({ length: 8 }, (_, i) => ({
    periode: ['S1 Jan','S2 Jan','S1 Fév','S2 Fév','S1 Mar','S2 Mar','S1 Avr','S2 Avr'][i],
    montant: Math.round(dettes / 8),
  }));

  const top3 = aged.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const top10sans3 = aged.rows.slice(3, 10).reduce((s, r) => s + r.total, 0);
  const autres = dettes - top3 - top10sans3;
  const concentration = [
    { name: 'Top 3 fournisseurs', value: dettes ? Math.round((top3 / dettes) * 100) : 0, color: ct.at(0) },
    { name: 'Fournisseurs 4-10', value: dettes ? Math.round((top10sans3 / dettes) * 100) : 0, color: ct.at(1) },
    { name: 'Autres', value: dettes ? Math.round((autres / dettes) * 100) : 0, color: '#cbd5e1' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Dettes fournisseurs" value={fmtK(dettes)} unit="XOF" color={ct.at(0)} icon="FO" subValue="Total encours" />
        <KPICard title="DPO" value={`${Math.round(dpo)} j`} color={ct.at(0)} icon="DP" subValue="Objectif : 60 jours" />
        <KPICard title="Dettes échues" value={fmtK(echues)} unit="XOF" color={ct.at(1)} icon="90" inverse />
        <KPICard title="Nb fournisseurs" value={String(nbFournisseurs)} color={ct.at(2)} icon="NB" subValue="distincts par tiers / sous-compte" />
        <KPICard title="Cycle conversion" value={`${Math.round(dsoRatio + 35 - dpo)} j`} color={ct.at(3)} icon="CY" subValue="DSO + Stocks − DPO" inverse />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Balance âgée fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketTotals}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" radius={[6,6,0,0]}>
                {bucketTotals.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="DPO vs DSO — évolution comparée">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dpoEvol}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[20, 90]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="dpo" name="DPO (fournisseurs)" stroke={ct.at(5)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="dso" name="DSO (clients)" stroke={ct.at(0)} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="objectif" name="Cible DPO" stroke={ct.at(1)} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Évolution des dettes fournisseurs">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dettesEvol}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="total" name="Total dettes" fill={`url(#${areaGradId(5)})`} stroke={ct.at(5)} strokeWidth={2} />
              <Area type="monotone" dataKey="echues" name="Échues" fill={`url(#${areaGradId(1)})`} stroke={ct.at(1)} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Échéancier de paiement (prévisionnel)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={echeancier}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="periode" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" name="Décaissements prévus" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Top 10 fournisseurs — Encours et Échéances" className="lg:col-span-2">
          <div className="text-xs max-h-[280px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                  <th className="text-left py-1.5 px-1 text-primary-500">#</th>
                  <th className="text-left py-1.5 px-1 text-primary-500">Fournisseur</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">Encours</th>
                  <th className="text-right py-1.5 px-1 text-primary-500">&gt; 90j</th>
                  <th className="text-center py-1.5 px-1 text-primary-500">Statut</th>
                </tr>
              </thead>
              <tbody>
                {aged.rows.slice(0, 10).map((r, i) => {
                  const retard = r.buckets[4] > 0;
                  const statut = retard ? 'retard' : r.buckets[3] > 0 ? 'urgent' : 'normal';
                  const bg = statut === 'retard' ? '#fee2e2' : statut === 'urgent' ? '#fef3c7' : '#dcfce7';
                  const fg = statut === 'retard' ? '#dc2626' : statut === 'urgent' ? '#d97706' : '#16a34a';
                  return (
                    <tr key={i} className="border-b border-primary-100 dark:border-primary-800">
                      <td className="py-1.5 px-1 text-primary-400 font-bold">{i + 1}</td>
                      <td className="py-1.5 px-1 font-mono">{r.tier}</td>
                      <td className="py-1.5 px-1 text-right num font-semibold">{fmtFull(r.total)}</td>
                      <td className="py-1.5 px-1 text-right num" style={{ color: retard ? ct.at(1) : undefined }}>
                        {retard ? fmtFull(r.buckets[4]) : '—'}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: bg, color: fg }}>
                          {statut === 'retard' ? '!! Retard' : statut === 'urgent' ? '-- Urgent' : 'OK Normal'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Concentration fournisseurs">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={concentration} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value"
                label={(p: any) => `${p.value}%`}>
                {concentration.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="py-2">
            {concentration.map((e, i) => (
              <div key={i} className="flex justify-between py-1 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: e.color }} />{e.name}</span>
                <span className="num font-semibold">{e.value}%</span>
              </div>
            ))}
          </div>
          {concentration[0].value > 50 && (
            <div className="mt-2 p-2.5 rounded-lg text-[10px]" style={{ background: '#fee2e2', color: '#991b1b' }}>
              !! <strong>Alerte :</strong> Top 3 = {concentration[0].value}% des achats. Diversifier les sources.
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
