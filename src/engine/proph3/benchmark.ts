// Benchmark sectoriel — Compare les ratios aux normes OHADA
import type { Ratio } from '../ratios';
import { getNormes } from '../../syscohada/atlas';

export type BenchmarkPosition = 'below' | 'within' | 'above';

export interface BenchmarkResult {
  code: string;
  label: string;
  family: string;
  value: number;
  unit: string;
  normMin: number;
  normMax: number;
  position: BenchmarkPosition;
  pctInRange: number; // 0-100, position dans la plage
}

const RATIO_TO_NORM: Record<string, keyof ReturnType<typeof getNormes>> = {
  MB: 'margeBrute', TVA: 'valeurAjoutee', EBE: 'ebe', TRN: 'rentabiliteNette',
  LG: 'liquiditeGenerale', AF: 'autonomieFinanciere', DSO: 'dso', DPO: 'dpo', END: 'endettement',
};

export function computeBenchmark(ratios: Ratio[], secteur?: string): BenchmarkResult[] {
  const normes = getNormes(secteur);
  const results: BenchmarkResult[] = [];

  for (const r of ratios) {
    const normKey = RATIO_TO_NORM[r.code];
    if (!normKey) continue;
    const [min, max] = normes[normKey];
    const position: BenchmarkPosition = r.value < min ? 'below' : r.value > max ? 'above' : 'within';
    const range = max - min || 1;
    const pctInRange = Math.max(0, Math.min(100, ((r.value - min) / range) * 100));

    results.push({ code: r.code, label: r.label, family: r.family, value: r.value, unit: r.unit, normMin: min, normMax: max, position, pctInRange });
  }

  return results;
}
