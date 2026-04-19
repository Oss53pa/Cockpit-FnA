import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Bell, Hash, HelpCircle, LogOut, Menu, Settings } from 'lucide-react';
import { useApp } from '../../store/app';
import { useBalance, useOrganizations, usePeriods, useRatios } from '../../hooks/useFinancials';
import { db } from '../../db/schema';
import { HelpModal } from '../ui/HelpModal';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { currentOrgId, setCurrentOrg, currentPeriodId, setCurrentPeriod, currentYear, setCurrentYear, amountMode, setAmountMode } = useApp();
  const orgs = useOrganizations();
  const allPeriods = usePeriods(currentOrgId);
  const fiscalYears = useLiveQuery(
    () => (currentOrgId ? db.fiscalYears.where('orgId').equals(currentOrgId).toArray() : Promise.resolve([] as Array<{ year: number }>)),
    [currentOrgId], [] as Array<{ year: number }>,
  ) ?? [];
  const periods = allPeriods.filter((p) => p.year === currentYear && p.month >= 1);
  // Union des années : celles ayant des périodes + celles définies comme exercices
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
  const [helpOpen, setHelpOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentOrg = orgs.find((o) => o.id === currentOrgId);
  const initials = currentOrg?.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'AD';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-primary-900 dark:bg-primary-950 text-primary-50 border-b border-primary-800">
      <div className="px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button onClick={onMenuClick} className="lg:hidden p-1 rounded hover:bg-white/15">
            <Menu className="w-5 h-5" />
          </button>
          <div className="text-sm font-medium text-primary-400 tracking-wide truncate">
            {currentOrg?.name ?? '---'}
            <span className="text-primary-600 mx-2 hidden sm:inline">|</span>
            <span className="num hidden sm:inline">{currentYear}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <select
            value={currentOrgId}
            onChange={(e) => setCurrentOrg(e.target.value)}
            className="hidden sm:block px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white focus:outline-none cursor-pointer [&>option]:text-primary-900"
          >
            {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="px-2 sm:px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white focus:outline-none cursor-pointer [&>option]:text-primary-900"
          >
            {(years.length ? years : [2025]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={currentPeriodId}
            onChange={(e) => setCurrentPeriod(e.target.value)}
            className="hidden md:block px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white focus:outline-none cursor-pointer [&>option]:text-primary-900"
          >
            <option value="">YTD</option>
            {periods.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>

          <button
            type="button"
            title={amountMode === 'full' ? 'Montants en entier (cliquer pour passer en abrégé K/M)' : 'Montants abrégés K/M (cliquer pour passer en entier)'}
            aria-label="Mode d'affichage des montants"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition relative"
            onClick={() => setAmountMode(amountMode === 'full' ? 'short' : 'full')}
          >
            <Hash className="w-4 h-4" />
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[14px] px-1 bg-primary-100 text-primary-900 rounded-full text-[8px] font-bold flex items-center justify-center uppercase tracking-tighter">
              {amountMode === 'full' ? '123' : 'K/M'}
            </span>
          </button>

          <button
            type="button"
            title="Objet & mode d'emploi"
            aria-label="Objet & mode d'emploi"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            onClick={() => { setHelpOpen(true); setNotifOpen(false); setUserOpen(false); }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div ref={notifRef} className="relative">
            <button className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition relative"
              onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}>
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-primary-100 text-primary-900 rounded-full text-[10px] font-bold flex items-center justify-center num">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl overflow-hidden text-primary-900 dark:text-primary-100">
                <div className="px-4 py-3 border-b border-primary-200 dark:border-primary-800">
                  <p className="font-semibold text-sm">Notifications</p>
                  <p className="text-xs text-primary-500">{alertCount} alerte(s)</p>
                </div>
                {alertCount === 0 ? (
                  <div className="p-6 text-center text-xs text-primary-500">Aucune notification</div>
                ) : (
                  <button className="w-full text-left px-4 py-3 hover:bg-primary-100 dark:hover:bg-primary-800 text-sm"
                    onClick={() => { setNotifOpen(false); navigate('/alerts'); }}>
                    Voir les alertes
                  </button>
                )}
              </div>
            )}
          </div>

          <div ref={userRef} className="relative">
            <button
              className="w-9 h-9 rounded-full bg-primary-700 hover:bg-primary-600 flex items-center justify-center text-[11px] font-bold transition"
              onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
            >
              {initials}
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl overflow-hidden text-primary-900 dark:text-primary-100">
                <div className="px-4 py-3 border-b border-primary-200 dark:border-primary-800">
                  <p className="font-semibold text-sm">{currentOrg?.name ?? 'Utilisateur'}</p>
                  <p className="text-xs text-primary-500">mode hors-ligne</p>
                </div>
                <div className="py-1">
                  <MenuItem icon={<Settings className="w-4 h-4" />} label="Paramètres" onClick={() => { setUserOpen(false); navigate('/settings'); }} />
                  <MenuItem icon={<LogOut className="w-4 h-4" />} label="Déconnexion" onClick={() => alert('Auth Supabase au Sprint 5')} />
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
    <button className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-primary-100 dark:hover:bg-primary-800 text-left" onClick={onClick}>
      {icon}{label}
    </button>
  );
}
