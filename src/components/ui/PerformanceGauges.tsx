import { ChartCard } from './ChartCard';
import { Gauge } from './Gauge';

type Ratio = { code: string; value: number };

export function PerformanceGauges({ budgetExec, marge, ratios }: { budgetExec: number; marge: number; ratios: Ratio[] }) {
  const lg = ratios.find((r) => r.code === 'LG')?.value ?? 0;
  const dso = ratios.find((r) => r.code === 'DSO')?.value ?? 0;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return (
    <ChartCard title="🎯 Indicateurs de Performance">
      <div className="grid grid-cols-2 gap-3 py-2">
        <Gauge value={Math.min(budgetExec, 100)} label="Exécution Budget CA" />
        <Gauge value={clamp(100 - Math.abs(marge - 10) * 5)} label="Marge nette" />
        <Gauge value={Math.min(lg * 50, 100)} label="Liquidité générale" />
        <Gauge value={clamp(100 - dso)} label="Recouvrement" />
      </div>
    </ChartCard>
  );
}
