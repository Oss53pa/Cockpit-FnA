import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FileSpreadsheet, Calculator, BarChart3,
  FileText, Wallet, Settings, Sparkles, Bell, FolderTree, Target, BookOpen,
} from 'lucide-react';
import clsx from 'clsx';

const sections = [
  {
    label: 'Pilotage',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Accueil' },
      { to: '/dashboard/home', icon: LayoutDashboard, label: 'Synthèse de gestion' },
      { to: '/dashboards', icon: BarChart3, label: 'Catalogue' },
      { to: '/alerts', icon: Bell, label: 'Alertes' },
      { to: '/actions', icon: Target, label: "Plan d'action" },
    ],
  },
  {
    label: 'Données',
    items: [
      { to: '/grand-livre', icon: BookOpen, label: 'Grand Livre & Balances' },
      { to: '/budget', icon: Wallet, label: 'Budget' },
      { to: '/coa', icon: FolderTree, label: 'Plan comptable' },
    ],
  },
  {
    label: 'Restitution',
    items: [
      { to: '/states', icon: FileSpreadsheet, label: 'États financiers' },
      { to: '/ratios', icon: Calculator, label: 'Ratios & analyse' },
      { to: '/reports', icon: FileText, label: 'Reporting' },
      { to: '/ai', icon: Sparkles, label: 'Proph3t' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/settings', icon: Settings, label: 'Paramètres' },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-900 flex flex-col">
      <div className="px-5 py-5 border-b border-primary-200 dark:border-primary-800">
        <p className="font-display text-2xl leading-none text-primary-900 dark:text-primary-50">CockPit F&amp;A</p>
        <p className="text-[10px] uppercase tracking-[0.15em] text-primary-400 mt-1.5">SYSCOHADA 2017</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {sections.map((sec) => (
          <div key={sec.label}>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-primary-400 font-semibold">{sec.label}</p>
            <div className="space-y-0.5">
              {sec.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors',
                      isActive
                        ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-semibold'
                        : 'text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-800'
                    )
                  }
                >
                  <it.icon className="w-4 h-4" />
                  <span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-primary-200 dark:border-primary-800 text-[10px] text-primary-500">
        v0.2.0 · OHADA révisé 2017
      </div>
    </aside>
  );
}
