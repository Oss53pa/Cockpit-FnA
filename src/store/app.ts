import { create } from 'zustand';

type AppState = {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentOrgId: string;
  setCurrentOrg: (id: string) => void;
  currentPeriodId: string;     // '' = cumul YTD année courante
  setCurrentPeriod: (id: string) => void;
  currentYear: number;
  setCurrentYear: (y: number) => void;
};

export const useApp = create<AppState>((set) => ({
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
  currentOrgId: 'sa-001',
  setCurrentOrg: (id) => set({ currentOrgId: id }),
  currentPeriodId: '',
  setCurrentPeriod: (id) => set({ currentPeriodId: id }),
  currentYear: 2025,
  setCurrentYear: (y) => set({ currentYear: y }),
}));

if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
