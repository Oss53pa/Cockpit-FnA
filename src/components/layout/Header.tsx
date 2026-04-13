import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Settings } from 'lucide-react';
import { useApp } from '../../store/app';
import { useBalance, useOrganizations, usePeriods, useRatios } from '../../hooks/useFinancials';

export function Header() {
  const { currentOrgId, setCurrentOrg, currentPeriodId, setCurrentPeriod, currentYear, setCurrentYear } = useApp();
  const orgs = useOrganizations();
  const allPeriods = usePeriods(currentOrgId);
  const periods = allPeriods.filter((p) => p.year === currentYear && p.month >= 1);
  const years = Array.from(new Set(allPeriods.map((p) => p.year))).sort((a, b) => b - a);

  const balance = useBalance();
  const ratios = useRatios();
  const alertCount = ratios.filter((r) => r.status !== 'good').length
    + balance.filter((r) => r.account.startsWith('6') && r.soldeC > 1000).length
    + balance.filter((r) => r.account.startsWith('7') && r.soldeD > 1000).length;

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
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
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="text-sm font-medium text-primary-400 tracking-wide">
          {currentOrg?.name ?? '---'}
          <span className="text-primary-600 mx-2">|</span>
          <span className="num">{currentYear}</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currentOrgId}
            onChange={(e) => setCurrentOrg(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white font-medium focus:outline-none focus:bg-white/20 cursor-pointer [&>option]:text-primary-900"
          >
            {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white focus:outline-none cursor-pointer [&>option]:text-primary-900"
          >
            {(years.length ? years : [2025]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={currentPeriodId}
            onChange={(e) => setCurrentPeriod(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[12px] bg-white/15 border border-white/20 text-white focus:outline-none cursor-pointer [&>option]:text-primary-900"
          >
            <option value="">YTD — Cumul année</option>
            {periods.map((p) => (<option key={p.id} value={p.id}>{p.label} {p.closed ? '*' : ''}</option>))}
          </select>

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
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl overflow-hidden text-primary-900 dark:text-primary-100">
                <div className="px-4 py-3 border-b border-primary-200 dark:border-primary-800">
                  <p className="font-semibold text-sm">Notifications</p>
                  <p className="text-xs text-primary-500">{alertCount} alerte(s) active(s)</p>
                </div>
                {alertCount === 0 ? (
                  <div className="p-6 text-center text-xs text-primary-500">Aucune notification</div>
                ) : (
                  <button className="w-full text-left px-4 py-3 hover:bg-primary-100 dark:hover:bg-primary-800 text-sm"
                    onClick={() => { setNotifOpen(false); navigate('/alerts'); }}>
                    Voir toutes les alertes →
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
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-xl shadow-xl overflow-hidden text-primary-900 dark:text-primary-100">
                <div className="px-4 py-3 border-b border-primary-200 dark:border-primary-800">
                  <p className="font-semibold text-sm">Utilisateur local</p>
                  <p className="text-xs text-primary-500">mode hors-ligne · IndexedDB</p>
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
