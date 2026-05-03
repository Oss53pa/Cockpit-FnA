/**
 * Heatmap d'anomalies mensuelle — grille 12 mois × catégories d'anomalie.
 * Visualisation rapide des "mauvais mois" comptables.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { useCurrentOrg } from '../hooks/useFinancials';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

export default function AnomaliesHeatmap() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const [matrix, setMatrix] = useState<Record<string, number[]>>({});
  const [maxValue, setMaxValue] = useState(1);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then((entries) => {
      const yearEntries = entries.filter((e) => e.date.startsWith(String(currentYear)));
      const cats: Record<string, number[]> = {
        "Classe 6 en crédit (anormal)": Array(12).fill(0),
        "Classe 7 en débit (anormal)": Array(12).fill(0),
        "Pas de journal": Array(12).fill(0),
        "Pas de pièce": Array(12).fill(0),
        "Date future": Array(12).fill(0),
        "Montant > 10M XOF": Array(12).fill(0),
        "Débit ET crédit = 0": Array(12).fill(0),
      };
      const today = new Date().toISOString().substring(0, 10);
      for (const e of yearEntries) {
        const m = parseInt(e.date.substring(5, 7), 10) - 1;
        if (m < 0 || m > 11) continue;
        if (e.account?.startsWith('6') && e.credit > 1000 && e.debit === 0) cats["Classe 6 en crédit (anormal)"][m]++;
        if (e.account?.startsWith('7') && e.debit > 1000 && e.credit === 0) cats["Classe 7 en débit (anormal)"][m]++;
        if (!e.journal?.trim()) cats["Pas de journal"][m]++;
        if (!e.piece?.trim()) cats["Pas de pièce"][m]++;
        if (e.date > today) cats["Date future"][m]++;
        if (Math.max(e.debit, e.credit) > 10_000_000) cats["Montant > 10M XOF"][m]++;
        if (e.debit === 0 && e.credit === 0) cats["Débit ET crédit = 0"][m]++;
      }
      setMatrix(cats);
      const max = Math.max(...Object.values(cats).flat(), 1);
      setMaxValue(max);
    });
  }, [currentOrgId, currentYear]);

  const totalAnomalies = useMemo(() => Object.values(matrix).reduce((s, arr) => s + arr.reduce((a, b) => a + b, 0), 0), [matrix]);
  const worstMonth = useMemo(() => {
    let max = 0; let mIdx = 0;
    for (let i = 0; i < 12; i++) {
      const sum = Object.values(matrix).reduce((s, arr) => s + arr[i], 0);
      if (sum > max) { max = sum; mIdx = i; }
    }
    return { month: MONTHS[mIdx], count: max };
  }, [matrix]);

  // Couleur cellule (gradient blanc → rouge)
  const cellColor = (value: number): string => {
    if (value === 0) return 'rgb(var(--p-50))';
    const intensity = Math.min(value / maxValue, 1);
    const r = 255;
    const g = Math.round(255 - intensity * 200);
    const b = Math.round(255 - intensity * 200);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/anomalies" />
      <PageHeader
        title="Heatmap d'anomalies mensuelle"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Visualisation des mois à risque`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard variant="hero" title="Total anomalies" value={String(totalAnomalies)} icon={<AlertTriangle className="w-5 h-5" />} subValue={`${currentYear}`} inverse />
        <KPICard title="Pire mois" value={worstMonth.month} icon={<AlertTriangle className="w-4 h-4" />} subValue={`${worstMonth.count} anomalies`} inverse />
        <KPICard title="Catégories suivies" value={String(Object.keys(matrix).length)} icon={<AlertTriangle className="w-4 h-4" />} subValue="Types d'anomalie" />
      </div>

      <ChartCard title="Heatmap par mois × catégorie" subtitle="Plus rouge = plus d'anomalies sur ce mois">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 min-w-[220px]">Catégorie</th>
                {MONTHS.map((m) => <th key={m} className="text-center py-2 px-2 num font-semibold w-12">{m}</th>)}
                <th className="text-center py-2 px-2 num font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(matrix).map(([cat, values]) => {
                const total = values.reduce((s, v) => s + v, 0);
                return (
                  <tr key={cat}>
                    <td className="py-1 px-3 font-medium">{cat}</td>
                    {values.map((v, i) => (
                      <td key={i}
                        className="text-center py-3 num font-semibold rounded-md transition-all hover:scale-110 cursor-default"
                        style={{ background: cellColor(v), color: v > maxValue * 0.5 ? '#fff' : 'rgb(var(--p-700))' }}
                        title={`${v} anomalies`}
                      >
                        {v > 0 ? v : ''}
                      </td>
                    ))}
                    <td className="text-center py-1 px-2 num font-bold bg-primary-100 dark:bg-primary-800 rounded-md">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
