import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Home, LayoutDashboard, FileSpreadsheet, BookOpen, Calculator, Wallet, FolderTree, Bell, Target, FileText, PieChart, Sparkles, ClipboardList, Settings, Upload, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  to: string;
  icon: typeof Home;
  keywords?: string[];
  group: 'Pages' | 'Imports' | 'Admin';
}

const COMMANDS: CommandItem[] = [
  // Pilotage
  { id: 'home',      label: 'Accueil',         hint: 'Vue de bienvenue',      to: '/home',           icon: Home,            group: 'Pages', keywords: ['accueil', 'home'] },
  { id: 'dash',      label: 'Synthèse',        hint: 'Dashboard principal',   to: '/dashboard/home', icon: LayoutDashboard, group: 'Pages', keywords: ['dashboard', 'synthese'] },
  { id: 'catalog',   label: 'Catalogue',       hint: '20 dashboards prêts',   to: '/dashboards',     icon: BarChart3,       group: 'Pages', keywords: ['dashboards', 'catalogue'] },
  { id: 'alerts',    label: 'Alertes',         hint: 'Ratios hors seuil',     to: '/alerts',         icon: Bell,            group: 'Pages' },
  { id: 'actions',   label: "Plan d'action",   hint: 'Tâches à mener',        to: '/actions',        icon: Target,          group: 'Pages' },
  // Données
  { id: 'coa',       label: 'Plan comptable',  hint: 'SYSCOHADA',             to: '/coa',            icon: FolderTree,      group: 'Pages' },
  { id: 'budget',    label: 'Budget',          hint: 'Saisie + écarts',       to: '/budget',         icon: Wallet,          group: 'Pages' },
  { id: 'gl',        label: 'Grand Livre',     hint: 'Écritures comptables',  to: '/grand-livre',    icon: BookOpen,        group: 'Pages' },
  // Restitution
  { id: 'states',    label: 'États financiers',hint: 'Bilan · CR · TFT',      to: '/states',         icon: FileSpreadsheet, group: 'Pages' },
  { id: 'ratios',    label: 'Ratios',          hint: 'Analyse financière',    to: '/ratios',         icon: Calculator,      group: 'Pages' },
  { id: 'reports',   label: 'Rapports',        hint: 'Reporting auto',        to: '/reports',        icon: FileText,        group: 'Pages' },
  { id: 'analytical',label: 'Analytique',      hint: 'Multi-axes',            to: '/analytical',     icon: PieChart,        group: 'Pages' },
  { id: 'ai',        label: 'Proph3t',         hint: 'Assistant IA',          to: '/ai',             icon: Sparkles,        group: 'Pages' },
  // Imports
  { id: 'imp',       label: 'Importer Grand Livre', hint: 'CSV / Excel',      to: '/imports',        icon: Upload,          group: 'Imports' },
  // Admin
  { id: 'settings',  label: 'Paramètres',      hint: 'Configuration',         to: '/settings',       icon: Settings,        group: 'Admin' },
  { id: 'audit',     label: 'Audit trail',     hint: 'Journal des actions',   to: '/audit',          icon: ClipboardList,   group: 'Admin' },
];

/**
 * Command palette premium — Cmd+K / Ctrl+K
 *
 * Inspiré Linear / Vercel / Raycast :
 * - fuzzy search sur label + keywords
 * - groupes (Pages / Imports / Admin)
 * - keyboard nav (↑↓ Enter Esc)
 * - focus trap + auto-focus input
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K pour ouvrir
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setActiveIndex(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-focus input
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Filtre fuzzy
  const q = query.toLowerCase().trim();
  const filtered = q
    ? COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(q)
        || c.hint?.toLowerCase().includes(q)
        || c.keywords?.some((k) => k.toLowerCase().includes(q)))
    : COMMANDS;

  // Group by section
  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {});

  const flat = filtered;

  const onSelect = (item: CommandItem) => {
    navigate(item.to);
    setOpen(false);
    setQuery('');
  };

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flat.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); if (flat[activeIndex]) onSelect(flat[activeIndex]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 animate-fade-in" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl card-glass shadow-xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-primary-200/60 dark:border-primary-800">
          <Search className="w-4 h-4 text-primary-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Rechercher une page, une action…"
            className="flex-1 bg-transparent outline-none text-sm text-primary-900 dark:text-primary-50 placeholder:text-primary-400"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary-200 dark:border-primary-700 text-primary-500">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {Object.entries(groups).length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-primary-500">Aucun résultat pour "{query}"</p>
            </div>
          ) : (
            Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName} className="mb-2 last:mb-0">
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-primary-400 font-semibold">{groupName}</p>
                {items.map((item) => {
                  const flatIdx = flat.indexOf(item);
                  const isActive = flatIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelect(item)}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-100',
                        isActive
                          ? 'bg-primary-200/60 dark:bg-primary-800 text-primary-900 dark:text-primary-50'
                          : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100/60 dark:hover:bg-primary-800/60',
                      )}
                    >
                      <item.icon className="w-4 h-4 text-primary-500 shrink-0" strokeWidth={2} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {item.hint && <p className="text-xs text-primary-500 truncate mt-0.5">{item.hint}</p>}
                      </div>
                      {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-primary-200/60 dark:border-primary-800 text-[10px] text-primary-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono px-1 py-0.5 rounded bg-primary-200/40 dark:bg-primary-800/60">↑↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono px-1 py-0.5 rounded bg-primary-200/40 dark:bg-primary-800/60">↵</kbd>
              sélectionner
            </span>
          </div>
          <span className="font-mono">⌘K</span>
        </div>
      </div>
    </div>
  );
}
