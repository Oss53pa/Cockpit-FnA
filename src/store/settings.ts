// Paramètres personnalisables persistés en localStorage (par société)
import { create } from 'zustand';

export type RatioTarget = {
  code: string;
  label: string;
  target: number;
  warnThreshold: number;  // % de la cible pour passer en vigilance
  alertThreshold: number; // % de la cible pour passer en alerte
  inverse?: boolean;
  unit: '%' | 'x' | 'j' | 'ratio';
};

// Cibles par défaut (copie des valeurs actuelles de l'engine)
export const DEFAULT_RATIO_TARGETS: RatioTarget[] = [
  { code: 'MB',       label: 'Taux de marge brute',          target: 30,  warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'TVA',      label: 'Taux de valeur ajoutée',       target: 35,  warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'EBE',      label: "Taux d'EBE",                    target: 15,  warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'TRE',      label: "Rentabilité d'exploitation",   target: 10,  warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'TRN',      label: 'Rentabilité nette',             target: 8,   warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'ROE',      label: 'ROE',                            target: 12,  warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'ROA',      label: 'ROA',                            target: 6,   warnThreshold: 80, alertThreshold: 60, unit: '%' },
  { code: 'LG',       label: 'Liquidité générale',            target: 1.5, warnThreshold: 80, alertThreshold: 60, unit: 'x' },
  { code: 'LR',       label: 'Liquidité réduite',             target: 1.0, warnThreshold: 80, alertThreshold: 60, unit: 'x' },
  { code: 'LI',       label: 'Liquidité immédiate',           target: 0.3, warnThreshold: 80, alertThreshold: 60, unit: 'x' },
  { code: 'AF',       label: 'Autonomie financière',          target: 0.5, warnThreshold: 80, alertThreshold: 60, unit: 'ratio' },
  { code: 'END',      label: 'Endettement',                   target: 1.0, warnThreshold: 120, alertThreshold: 150, unit: 'ratio', inverse: true },
  { code: 'CAP_REMB', label: 'Capacité de remboursement',     target: 4,   warnThreshold: 120, alertThreshold: 150, unit: 'x', inverse: true },
  { code: 'DSO',      label: 'DSO (jours)',                    target: 60,  warnThreshold: 120, alertThreshold: 150, unit: 'j', inverse: true },
  { code: 'DPO',      label: 'DPO (jours)',                    target: 60,  warnThreshold: 80, alertThreshold: 60, unit: 'j' },
];

type SettingsState = {
  ratioTargets: Record<string, RatioTarget>; // clé = code
  setRatioTarget: (code: string, patch: Partial<RatioTarget>) => void;
  resetRatioTargets: () => void;
};

const KEY = 'settings-ratio-targets';

function load(): Record<string, RatioTarget> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error();
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(DEFAULT_RATIO_TARGETS.map((r) => [r.code, r]));
  }
}

function persist(state: Record<string, RatioTarget>) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export const useSettings = create<SettingsState>((set) => ({
  ratioTargets: load(),
  setRatioTarget: (code, patch) => set((s) => {
    const next = { ...s.ratioTargets, [code]: { ...s.ratioTargets[code], ...patch } };
    persist(next);
    return { ratioTargets: next };
  }),
  resetRatioTargets: () => {
    const fresh = Object.fromEntries(DEFAULT_RATIO_TARGETS.map((r) => [r.code, r]));
    persist(fresh);
    set({ ratioTargets: fresh });
  },
}));
