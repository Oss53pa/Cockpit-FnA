import type { AccountingSystem } from '../db/schema';

export const ACCOUNTING_SYSTEMS: AccountingSystem[] = ['Normal', 'Allégé', 'SMT'];

export const SYSTEM_META: Record<AccountingSystem, { label: string; desc: string; caThreshold: string }> = {
  Normal:  { label: 'Système Normal',  desc: 'Bilan, CR, SIG, TFT, TAFIRE complets',                  caThreshold: 'CA ≥ 100 M XOF' },
  'Allégé': { label: 'Système Allégé',  desc: 'Bilan et CR simplifiés, TFT/TAFIRE non requis',         caThreshold: 'CA < 100 M XOF' },
  SMT:      { label: 'Système Minimal', desc: 'Livre recettes/dépenses, état de trésorerie',           caThreshold: 'CA < 30 M XOF' },
};

export type StatementTab = 'bilan' | 'cr' | 'tft' | 'tafire' | 'cp' | 'smt';

export function availableTabs(system: AccountingSystem): StatementTab[] {
  switch (system) {
    case 'SMT':     return ['smt'];
    case 'Allégé':  return ['bilan', 'cr'];
    case 'Normal':
    default:        return ['bilan', 'cr', 'tft', 'tafire', 'cp'];
  }
}

export const resolveSystem = (s?: AccountingSystem): AccountingSystem => s ?? 'Normal';

// ─── Agrégation Allégé ──────────────────────────────────────────────
// Ne garde que les grands totaux SYSCOHADA — bilan & CR simplifiés.

const ALLEGE_BILAN_ACTIF  = new Set(['_AZ', '_BK', '_BT', '_BZ']);
const ALLEGE_BILAN_PASSIF = new Set(['_CP', '_DF', 'DV', '_DP', '_DZ']);
const ALLEGE_CR           = new Set(['_XB', '_XC', '_XD', '_XE', '_XF', '_XG', '_XH', '_XI', '_XJ']);

export function simplifyBilanActif<T extends { code: string }>(lines: T[]): T[] {
  return lines.filter((l) => ALLEGE_BILAN_ACTIF.has(l.code));
}
export function simplifyBilanPassif<T extends { code: string }>(lines: T[]): T[] {
  return lines.filter((l) => ALLEGE_BILAN_PASSIF.has(l.code));
}
export function simplifyCR<T extends { code: string }>(lines: T[]): T[] {
  return lines.filter((l) => ALLEGE_CR.has(l.code));
}
