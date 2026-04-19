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
  // Sélecteur de période global : intervalle de mois pour filtrer les données
  // 1..12 inclus. fromMonth=1, toMonth=12 = année complète (défaut).
  fromMonth: number;
  toMonth: number;
  setPeriodRange: (from: number, to: number) => void;
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
    // Notifier tous les composants abonnés via useAmountMode (lib/format.ts)
    // pour qu'ils ré-évaluent fmtK / fmtMoney instantanément.
    import('../lib/format').then((mod) => mod.notifyAmountModeChanged()).catch(() => {});
  },
  currentImport: (localStorage.getItem('current-import') as ImportSelection) || 'latest',
  setCurrentImport: (s) => {
    localStorage.setItem('current-import', s);
    set({ currentImport: s });
  },
  fromMonth: parseInt(localStorage.getItem('period-from') || '1', 10) || 1,
  toMonth: parseInt(localStorage.getItem('period-to') || '12', 10) || 12,
  setPeriodRange: (from, to) => {
    const f = Math.max(1, Math.min(12, from));
    const t = Math.max(f, Math.min(12, to));
    localStorage.setItem('period-from', String(f));
    localStorage.setItem('period-to', String(t));
    set({ fromMonth: f, toMonth: t });
  },
}));

if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
