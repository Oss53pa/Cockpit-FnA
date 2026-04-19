import { create } from 'zustand';

/**
 * Mode d'affichage des montants dans l'app.
 * - 'full'     : valeur entière avec séparateur de milliers (ex : 1 234 567 890)
 * - 'short'    : abrégée type K/M/Md (ex : 1,2 Md)
 */
export type AmountDisplayMode = 'full' | 'short';

/**
 * Mode de sélection de l'import GL à utiliser pour les calculs.
 * - 'latest' : (défaut) n'utilise QUE le dernier import du GL — évite le
 *   double-comptage quand plusieurs imports existent pour la même période.
 * - 'all'    : cumule tous les imports (comportement legacy).
 * - une string : l'id d'un ImportLog spécifique (pour consulter une version
 *   historique).
 */
export type ImportSelection = 'latest' | 'all' | string;

type AppState = {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentOrgId: string;
  setCurrentOrg: (id: string) => void;
  currentPeriodId: string;     // '' = cumul YTD année courante
  setCurrentPeriod: (id: string) => void;
  currentYear: number;
  setCurrentYear: (y: number) => void;
  amountMode: AmountDisplayMode;
  setAmountMode: (m: AmountDisplayMode) => void;
  currentImport: ImportSelection;
  setCurrentImport: (s: ImportSelection) => void;
};

const DEFAULT_CURRENT_YEAR = (() => {
  const stored = localStorage.getItem('current-year');
  const n = stored ? parseInt(stored, 10) : NaN;
  if (!isNaN(n) && n > 1990 && n < 2100) return n;
  return new Date().getFullYear();
})();

const DEFAULT_AMOUNT_MODE: AmountDisplayMode = (localStorage.getItem('amount-mode') as AmountDisplayMode) || 'full';

export const useApp = create<AppState>((set) => ({
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
  currentOrgId: localStorage.getItem('current-org') || 'sa-001',
  setCurrentOrg: (id) => {
    localStorage.setItem('current-org', id);
    set({ currentOrgId: id });
  },
  currentPeriodId: '',
  setCurrentPeriod: (id) => set({ currentPeriodId: id }),
  currentYear: DEFAULT_CURRENT_YEAR,
  setCurrentYear: (y) => {
    localStorage.setItem('current-year', String(y));
    set({ currentYear: y });
  },
  amountMode: DEFAULT_AMOUNT_MODE,
  setAmountMode: (m) => {
    localStorage.setItem('amount-mode', m);
    set({ amountMode: m });
  },
  currentImport: (localStorage.getItem('current-import') as ImportSelection) || 'latest',
  setCurrentImport: (s) => {
    localStorage.setItem('current-import', s);
    set({ currentImport: s });
  },
}));

if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
