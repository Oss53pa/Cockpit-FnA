import { NavLink } from 'react-router-dom';
import {
  Home, LayoutDashboard, FileSpreadsheet, Calculator, BarChart3,
  FileText, Wallet, Settings, Sparkles, Bell, FolderTree, Target, BookOpen,
  X, ChevronsLeft, ChevronsRight, PieChart, ClipboardList, Search, Users, FileEdit,
  HelpCircle,
} from 'lucide-react';
import clsx from 'clsx';

const sections = [
  {
    label: 'Pilotage',
    items: [
      { to: '/home', icon: Home, label: 'Accueil' },
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
      { to: '/import-tiers', icon: Users, label: 'GL Tiers' },
    ],
  },
  {
    label: 'Restitution',
    items: [
      { to: '/states', icon: FileSpreadsheet, label: 'États financiers' },
      { to: '/ratios', icon: Calculator, label: 'Ratios' },
      { to: '/reports', icon: FileText, label: 'Reporting' },
      { to: '/analytical', icon: PieChart, label: 'Analytique' },
      { to: '/cr-editor', icon: FileEdit, label: 'Personnaliser CR' },
      { to: '/ai', icon: Sparkles, label: 'Proph3t' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings', icon: Settings, label: 'Paramètres' },
      { to: '/audit', icon: ClipboardList, label: 'Audit trail' },
      { to: '/guide', icon: HelpCircle, label: "Guide d'utilisation" },
    ],
  },
];

type Props = {
  open?: boolean;       // mobile drawer open
  onClose?: () => void; // close mobile drawer
  collapsed?: boolean;  // desktop collapsed (icons only)
  onToggleCollapse?: () => void;
};

/**
 * Sidebar premium — niveau international (Linear / Vercel / Notion).
 *
 * - Logo Cockpit en haut avec point accent (signature visuelle)
 * - Sections avec libelle uppercase tracking-widest discret
 * - NavLink active : pill arrondie pleine, accent indicator a gauche
 * - Collapsed mode : icones centrees, tooltip implicite via title
 * - Footer minimal (version)
 */
export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: Props) {

  const fullNav = (showClose: boolean) => (
    <>
      {/* Header — wordmark Grand Hotel (signature unique de l'app) */}
      <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none text-primary-900 dark:text-primary-50 truncate">CockPit</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary-400 mt-1.5 font-medium">SYSCOHADA 2017</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="btn-icon w-7 h-7"
              title="Replier la sidebar"
              aria-label="Replier"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
          {showClose && onClose && (
            <button onClick={onClose} className="btn-icon w-7 h-7" aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Recherche rapide ⌘K */}
      <div className="px-3 pb-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-100/50 dark:bg-primary-800/40 hover:bg-primary-200/60 dark:hover:bg-primary-800 text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 text-xs transition-colors duration-150 group"
          aria-label="Recherche rapide"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface dark:bg-primary-900 text-primary-600 group-hover:text-primary-900 dark:group-hover:text-primary-100">⌘K</kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
        {sections.map((sec) => (
          <div key={sec.label}>
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.14em] text-primary-400 font-semibold">
              {sec.label}
            </p>
            <div className="space-y-0.5">
              {sec.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all duration-150',
                      isActive
                        ? 'bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 font-semibold shadow-sm'
                        : 'text-primary-700 dark:text-primary-400 hover:bg-primary-200/60 dark:hover:bg-primary-800 hover:text-primary-900 dark:hover:text-primary-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Indicator accent vertical pour l'item actif */}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent"
                        />
                      )}
                      <it.icon
                        className={clsx('w-4 h-4 shrink-0', isActive ? 'text-primary-50 dark:text-primary-900' : 'text-primary-500 group-hover:text-primary-900 dark:group-hover:text-primary-100')}
                        strokeWidth={isActive ? 2.4 : 2}
                      />
                      <span className="truncate">{it.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer minimal */}
      <div className="px-5 py-3 border-t border-primary-200/60 dark:border-primary-800">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-primary-400 tracking-tight">v0.3.0</p>
            <p className="text-[10px] text-primary-400 tracking-tight">
              by <a href="https://atlas-studio.app" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent transition-colors">Atlas Studio</a>
            </p>
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="btn-icon w-6 h-6 text-primary-400 hover:text-primary-700"
              title="Replier"
              aria-label="Replier la sidebar"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );

  // Collapsed nav (icones seules)
  const collapsedNav = (
    <>
      <div className="pt-5 pb-3 flex justify-center">
        <p className="font-display text-xl leading-none text-primary-900 dark:text-primary-50">C</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-1.5 space-y-1">
        {sections.flatMap((sec) => sec.items).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            title={it.label}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-150',
                isActive
                  ? 'bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 shadow-sm'
                  : 'text-primary-500 hover:bg-primary-200/60 dark:hover:bg-primary-800 hover:text-primary-900 dark:hover:text-primary-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span aria-hidden className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />
                )}
                <it.icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.4 : 2} />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-primary-200/60 dark:border-primary-800 py-2 flex justify-center">
        <button
          onClick={onToggleCollapse}
          title="Déplier"
          aria-label="Déplier la sidebar"
          className="btn-icon"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      {collapsed ? (
        <aside className="hidden lg:flex w-14 shrink-0 h-[calc(100vh-2rem)] sticky top-4 bg-shell dark:bg-primary-900 rounded-shell flex-col transition-all duration-200 shadow-sm">
          {collapsedNav}
        </aside>
      ) : (
        <aside className="hidden lg:flex w-60 shrink-0 h-[calc(100vh-2rem)] sticky top-4 bg-shell dark:bg-primary-900 rounded-shell flex-col transition-all duration-200 shadow-sm">
          {fullNav(false)}
        </aside>
      )}

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in" onClick={onClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-shell dark:bg-primary-900 shadow-2xl flex flex-col lg:hidden animate-slide-in-right">
            {fullNav(true)}
          </aside>
        </>
      )}
    </>
  );
}
