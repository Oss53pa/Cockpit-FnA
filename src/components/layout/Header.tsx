import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Bell, Hash, HelpCircle, Lock, LogOut, Menu, Settings, ChevronDown, Search, LogIn } from 'lucide-react';
import { useApp } from '../../store/app';
import { useBalance, useImportsHistory, useOrganizations, usePeriods, useRatios } from '../../hooks/useFinancials';
import { db } from '../../db/schema';
import { HelpModal } from '../ui/HelpModal';
import { PaletteSwitcher } from './PaletteSwitcher';
import { toast } from '../ui/Toast';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { currentOrgId, setCurrentOrg, currentPeriodId, setCurrentPeriod, currentYear, setCurrentYear, amountMode, setAmountMode, currentImport, setCurrentImport, fromMonth, toMonth, setPeriodRange } = useApp();
  const MONTH_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const glImports = useImportsHistory(currentOrgId, 'GL');
  const orgs = useOrganizations();
  const allPeriods = usePeriods(currentOrgId);
  const fiscalYears = useLiveQuery(
    () => (currentOrgId ? db.fiscalYears.where('orgId').equals(currentOrgId).toArray() : Promise.resolve([] as Array<{ year: number }>)),
    [currentOrgId], [] as Array<{ year: number }>,
  ) ?? [];
  const periods = allPeriods.filter((p) => p.year === currentYear && p.month >= 1);
  const yearsSet = new Set<number>([
    ...allPeriods.map((p) => p.year),
    ...fiscalYears.map((fy) => fy.year),
    currentYear,
  ]);
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  const balance = useBalance();
  const ratios = useRatios();
  const alertCount = ratios.filter((r) => r.status !== 'good').length
    + balance.filter((r) => r.account.startsWith('6') && r.soldeC > 1000).length
    + balance.filter((r) => r.account.startsWith('7') && r.soldeD > 1000).length;

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  // Utilisateur connecté — sync avec sessionStorage 'cockpit-current-user'
  // (rempli par useAuth.ts depuis Supabase user_metadata, ou fallback local users)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: string; avatar?: string | null } | null>(null);
  useEffect(() => {
    const refresh = () => {
      try {
        const raw = sessionStorage.getItem('cockpit-current-user');
        setCurrentUser(raw ? JSON.parse(raw) : null);
      } catch { setCurrentUser(null); }
    };
    refresh();
    // Re-lit quand sessionStorage change (multi-onglets) ou auth event
    window.addEventListener('storage', refresh);
    window.addEventListener('cockpit-auth-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('cockpit-auth-changed', refresh);
    };
  }, []);

  // Initiales : priorité au nom utilisateur, fallback société
  const initials = (currentUser?.name ?? currentOrg?.name ?? 'Atlas')
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'AD';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setContextOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Periode label compact (pour le pill principal)
  const periodLabel = (fromMonth === 1 && toMonth === 12)
    ? `Cumul ${currentYear}`
    : `${MONTH_SHORT[fromMonth - 1]} → ${MONTH_SHORT[toMonth - 1]} ${currentYear}`;

  // (UI Audit) Détecte si la période sélectionnée est verrouillée pour afficher
  // un badge "Clôturée" et alerter l'utilisateur que les écritures sont en lecture seule.
  const periodLocked = periods
    .filter((p) => p.month >= fromMonth && p.month <= toMonth)
    .some((p) => p.closed);

  return (
    // Header epure : breadcrumb + 1 pill contexte + actions a droite
    <header className="sticky top-0 z-20 bg-shell dark:bg-primary-950 text-primary-900 dark:text-primary-50">
      <div className="px-3 sm:px-6 py-3.5 flex items-center justify-between gap-3">

        {/* GAUCHE : breadcrumb societe + pill contexte (annee/periode unifiees) */}
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onMenuClick} className="lg:hidden btn-icon" aria-label="Menu">
            <Menu className="w-5 h-5" />
          </button>

          {/* Pill unifie : org + annee + periode (tous les contextes en 1 click) */}
          <div ref={contextRef} className="relative">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface/80 hover:bg-surface dark:bg-primary-900 border border-primary-200/60 dark:border-primary-800 text-sm font-medium text-primary-900 dark:text-primary-100 transition-colors duration-150"
            >
              <span className="truncate max-w-[200px]">{currentOrg?.name ?? '—'}</span>
              <span className="w-px h-3 bg-primary-300 dark:bg-primary-700" />
              <span className="num text-primary-600 dark:text-primary-400">{periodLabel}</span>
              {periodLocked && (
                <span
                  className="badge-warning inline-flex items-center gap-1"
                  title="La période sélectionnée contient au moins une période clôturée — toute écriture y est refusée"
                >
                  <Lock className="w-3 h-3" strokeWidth={2.5} />
                  Clôturée
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-primary-400 transition-transform duration-200 ${contextOpen ? 'rotate-180' : ''}`} />
            </button>

            {contextOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 card-glass shadow-xl p-4 space-y-3 animate-fade-in-up">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-1.5 block">Société</label>
                  <select className="input" value={currentOrgId} onChange={(e) => setCurrentOrg(e.target.value)}>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-1.5 block">Exercice</label>
                    <select className="input" value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))}>
                      {(years.length ? years : [2025]).map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-1.5 block">Période</label>
                    <select className="input" value={currentPeriodId} onChange={(e) => setCurrentPeriod(e.target.value)}>
                      <option value="">YTD</option>
                      {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-1.5 block">Intervalle de mois</label>
                  <div className="flex items-center gap-2">
                    <select className="input flex-1" value={fromMonth} onChange={(e) => setPeriodRange(parseInt(e.target.value), toMonth)}>
                      {MONTH_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <span className="text-primary-400 text-sm">→</span>
                    <select className="input flex-1" value={toMonth} onChange={(e) => setPeriodRange(fromMonth, parseInt(e.target.value))}>
                      {MONTH_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {glImports.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-1.5 block">Import GL utilisé</label>
                    <select className="input" value={currentImport} onChange={(e) => setCurrentImport(e.target.value)}>
                      <option value="latest">Dernier import ({glImports.length})</option>
                      <option value="all">Tous les imports (cumul)</option>
                      {glImports.map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {new Date(i.date).toLocaleDateString('fr-FR')} · {i.fileName.substring(0, 30)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* DROITE : actions */}
        <div className="flex items-center gap-1.5">
          {/* Recherche élargie premium — niveau Cockpit CR (large, centrée) */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="hidden md:flex items-center gap-2.5 px-3.5 py-2 rounded-xl
                       border border-primary-200/70 dark:border-primary-700/60
                       bg-surface/60 hover:bg-surface dark:bg-primary-900/60 dark:hover:bg-primary-900
                       text-primary-500 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-200
                       text-xs transition-all duration-150
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-shell
                       min-w-[280px] xl:min-w-[360px]"
            title="Recherche rapide"
            aria-label="Ouvrir la recherche"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left">Rechercher comptes, rapports, dashboards…</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-primary-200/60 dark:bg-primary-800 text-primary-600 dark:text-primary-300 border border-primary-300/40 dark:border-primary-700/50">⌘K</kbd>
          </button>

          {/* Toggle montants — segmented control discret */}
          <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-full bg-primary-200/40 dark:bg-primary-800/40">
            <button
              type="button"
              aria-pressed={amountMode === 'full'}
              title="Montants complets"
              onClick={() => setAmountMode('full')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150 ${amountMode === 'full' ? 'bg-surface text-primary-900 shadow-sm' : 'text-primary-500 hover:text-primary-900'}`}
            >
              <Hash className="w-3 h-3 inline -mt-0.5 mr-0.5" />Entier
            </button>
            <button
              type="button"
              aria-pressed={amountMode === 'short'}
              title="Montants abrégés (K/M/Md)"
              onClick={() => setAmountMode('short')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150 ${amountMode === 'short' ? 'bg-surface text-primary-900 shadow-sm' : 'text-primary-500 hover:text-primary-900'}`}
            >
              K/M
            </button>
          </div>

          {/* Mobile : bouton compact pour le toggle */}
          <button
            type="button"
            title={amountMode === 'full' ? 'Cliquer pour abréger' : 'Cliquer pour afficher en entier'}
            aria-label="Basculer l'affichage des montants"
            className="sm:hidden btn-icon"
            onClick={() => setAmountMode(amountMode === 'full' ? 'short' : 'full')}
          >
            <Hash className="w-4 h-4" />
          </button>

          {/* Palette switcher — bascule rapide entre les 3 directions visuelles */}
          <PaletteSwitcher />

          <button
            type="button"
            className="btn-icon"
            title="Aide & mode d'emploi"
            aria-label="Aide"
            onClick={() => { setHelpOpen(true); setNotifOpen(false); setUserOpen(false); }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              className="btn-icon relative"
              aria-label="Notifications"
              onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}
            >
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-accent text-white rounded-full text-[9px] font-bold flex items-center justify-center num ring-2 ring-shell">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 card-glass shadow-xl overflow-hidden animate-fade-in-up">
                <div className="px-4 py-3 border-b border-primary-200/60 dark:border-primary-800">
                  <p className="font-semibold text-sm text-primary-900 dark:text-primary-50">Notifications</p>
                  <p className="text-xs text-primary-500 mt-0.5">{alertCount} alerte(s) financières</p>
                </div>
                {alertCount === 0 ? (
                  <div className="p-8 text-center text-xs text-primary-500">Aucune notification active</div>
                ) : (
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-primary-100/60 dark:hover:bg-primary-800/60 text-sm font-medium text-primary-900 dark:text-primary-100 transition-colors"
                    onClick={() => { setNotifOpen(false); navigate('/alerts'); }}
                  >
                    Voir toutes les alertes
                    <span className="float-right text-primary-400 text-xs">→</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Avatar utilisateur */}
          <div ref={userRef} className="relative">
            <button
              className="w-9 h-9 rounded-full bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 hover:opacity-90 flex items-center justify-center text-[11px] font-semibold transition-opacity duration-150 shadow-sm"
              aria-label="Compte"
              onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
            >
              {initials}
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 card-glass shadow-xl overflow-hidden animate-fade-in-up">
                <div className="px-4 py-3 border-b border-primary-200/60 dark:border-primary-800">
                  {currentUser ? (
                    <>
                      <div className="flex items-center gap-2.5">
                        {currentUser.avatar ? (
                          <img src={currentUser.avatar} alt={currentUser.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-primary-900 dark:text-primary-50 truncate">{currentUser.name}</p>
                          <p className="text-[11px] text-primary-500 truncate">{currentUser.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary-500">Société</span>
                        <span className="text-[11px] text-primary-700 dark:text-primary-300 truncate">{currentOrg?.name ?? '—'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-sm text-primary-900 dark:text-primary-50">{currentOrg?.name ?? 'Utilisateur'}</p>
                      <p className="text-xs text-primary-500 mt-0.5">Mode hors-ligne · non connecté</p>
                    </>
                  )}
                </div>
                <div className="py-1">
                  {!currentUser && (
                    <MenuItem icon={<LogIn className="w-4 h-4" />} label="Se connecter" onClick={() => { setUserOpen(false); navigate('/login'); }} />
                  )}
                  <MenuItem icon={<Settings className="w-4 h-4" />} label="Paramètres" onClick={() => { setUserOpen(false); navigate('/settings'); }} />
                  <MenuItem icon={<LogOut className="w-4 h-4" />} label="Déconnexion" onClick={async () => {
                    setUserOpen(false);
                    // Si Supabase configure : signOut effectif. Sinon : clear local + redirect login.
                    try {
                      const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
                      if (isSupabaseConfigured) {
                        await supabase.auth.signOut();
                      }
                    } catch { /* ignore */ }
                    // Toujours nettoyer la session locale et rediriger
                    sessionStorage.clear();
                    toast.success('Déconnecté', 'Session fermée. À bientôt !');
                    navigate('/login');
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-primary-700 dark:text-primary-300 hover:bg-primary-100/60 dark:hover:bg-primary-800/60 hover:text-primary-900 dark:hover:text-primary-100 text-left transition-colors duration-150"
      onClick={onClick}
    >
      <span className="text-primary-400">{icon}</span>
      {label}
    </button>
  );
}
