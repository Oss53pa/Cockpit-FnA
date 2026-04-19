import { NavLink } from 'react-router-dom';
import {
  Home, LayoutDashboard, FileSpreadsheet, Calculator, BarChart3,
  FileText, Wallet, Settings, Sparkles, Bell, FolderTree, Target, BookOpen,
  X, ChevronsLeft, ChevronsRight, PieChart, ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';

const sections = [
  {
    label: 'Pilotage',
    items: [
      { to: '/', icon: Home, label: 'Accueil' },
      { to: '/dashboard/home', icon: LayoutDashboard, label: 'Synthèse' },
      { to: '/dashboards', icon: BarChart3, label: 'Catalogue' },
      { to: '/alerts', icon: Bell, label: 'Alertes' },
      { to: '/actions', icon: Target, label: "Plan d'action" },
    ],
  },
  {
    label: 'Données',
    items: [
      { to: '/coa', icon: FolderTree, label: 'Plan comptable' },
      { to: '/budget', icon: Wallet, label: 'Budget' },
      { to: '/grand-livre', icon: BookOpen, label: 'Grand Livre' },
    ],
  },
  {
    label: 'Restitution',
    items: [
      { to: '/states', icon: FileSpreadsheet, label: 'États financiers' },
      { to: '/ratios', icon: Calculator, label: 'Ratios' },
      { to: '/reports', icon: FileText, label: 'Reporting' },
      { to: '/analytical', icon: PieChart, label: 'Analytique' },
      { to: '/ai', icon: Sparkles, label: 'Proph3t' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings', icon: Settings, label: 'Paramètres' },
      { to: '/audit', icon: ClipboardList, label: 'Audit trail' },
    ],
  },
];

type Props = {
  open?: boolean;       // mobile drawer open
  onClose?: () => void; // close mobile drawer
  collapsed?: boolean;  // desktop collapsed (icons only)
  onToggleCollapse?: () => void;
};

export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: Props) {

  // Full nav content (used by desktop expanded + mobile drawer)
  const fullNav = (showClose: boolean) => (
    <>
      <div className="px-5 py-5 border-b border-primary-200 dark:border-primary-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none text-primary-900 dark:text-primary-50 truncate">CockPit F&amp;A</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary-400 mt-1.5">SYSCOHADA 2017</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="p-1.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800 text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 transition" title="Replier la sidebar">
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
          {showClose && onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-primary-200 dark:hover:bg-primary-800">
              <X className="w-5 h-5 text-primary-500" />
            </button>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {sections.map((sec) => (
          <div key={sec.label}>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-primary-400 font-semibold">{sec.label}</p>
            <div className="space-y-0.5">
              {sec.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onClose}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors',
                    isActive
                      ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-semibold'
                      : 'text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-800'
                  )}>
                  <it.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-primary-200 dark:border-primary-800">
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="w-full flex items-center gap-2 px-5 py-2.5 text-[11px] text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800 transition">
            <ChevronsLeft className="w-3.5 h-3.5" /> Replier
          </button>
        )}
        <p className="px-5 py-2 text-[10px] text-primary-400">v0.3.0</p>
      </div>
    </>
  );

  // Collapsed nav (icons only, tooltips)
  const collapsedNav = (
    <>
      <div className="py-4 flex justify-center border-b border-primary-200 dark:border-primary-800">
        <span className="text-xs font-bold text-primary-900 dark:text-primary-50">F&A</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-1.5 space-y-1">
        {sections.flatMap((sec) => sec.items).map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'} title={it.label}
            className={({ isActive }) => clsx(
              'flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors',
              isActive
                ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900'
                : 'text-primary-500 hover:bg-primary-200 dark:hover:bg-primary-800 hover:text-primary-900 dark:hover:text-primary-100'
            )}>
            <it.icon className="w-[18px] h-[18px]" />
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-primary-200 dark:border-primary-800 py-2 flex justify-center">
        <button onClick={onToggleCollapse} title="Déplier" className="p-2 rounded-lg text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800 transition">
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — expanded or collapsed */}
      {collapsed ? (
        <aside className="hidden lg:flex w-14 shrink-0 h-screen sticky top-0 border-r border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-900 flex-col transition-all duration-200">
          {collapsedNav}
        </aside>
      ) : (
        <aside className="hidden lg:flex w-60 shrink-0 h-screen sticky top-0 border-r border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-900 flex-col transition-all duration-200">
          {fullNav(false)}
        </aside>
      )}

      {/* Mobile drawer overlay */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-primary-900 shadow-2xl flex flex-col lg:hidden">
            {fullNav(true)}
          </aside>
        </>
      )}
    </>
  );
}
