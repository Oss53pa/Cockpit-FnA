/**
 * OrgSwitcher — sélecteur d'organisation pour le header.
 *
 * Comportement :
 *   - 0 org : rien affiché (OnboardingModal prend le relais ailleurs)
 *   - 1 org : badge non cliquable avec le nom de la société
 *   - 2+ orgs : dropdown avec rôle + devise par société, indicateur de l'org active
 *
 * Source des données : `useOrganizations()` (JOIN fna_user_orgs côté SupabaseProvider).
 * Sélection persistée : `useApp.currentOrgId` (localStorage `current-org`).
 */
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '../../store/app';
import { useOrganizations } from '../../hooks/useFinancials';

export function OrgSwitcher() {
  const orgs = useOrganizations();
  const currentOrgId = useApp((s) => s.currentOrgId);
  const setCurrentOrg = useApp((s) => s.setCurrentOrg);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Pas d'org : laisse OnboardingModal gérer
  if (orgs.length === 0 || !currentOrg) return null;

  // 1 seule org : badge non cliquable
  if (orgs.length === 1) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-xs">
        <Building2 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="font-semibold text-primary-900 dark:text-primary-100 truncate max-w-[180px]">
          {currentOrg.name}
        </span>
        {currentOrg.role && (
          <span className="text-[10px] uppercase tracking-wider text-primary-500">
            {currentOrg.role}
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 hover:border-accent transition text-xs"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="font-semibold text-primary-900 dark:text-primary-100 truncate max-w-[160px]">
          {currentOrg.name}
        </span>
        <ChevronDown className={clsx('w-3 h-3 text-primary-500 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] min-w-[280px] max-w-[360px] bg-white dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
            Changer de société · {orgs.length} disponibles
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {orgs.map((org) => {
              const active = org.id === currentOrgId;
              return (
                <button
                  key={org.id}
                  onClick={() => {
                    setCurrentOrg(org.id);
                    setOpen(false);
                    // Reload pour purger les caches React Query liés à l'ancienne org
                    setTimeout(() => window.location.reload(), 50);
                  }}
                  role="option"
                  aria-selected={active}
                  className={clsx(
                    'w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left transition',
                    active
                      ? 'bg-success/10 hover:bg-success/15'
                      : 'hover:bg-primary-50 dark:hover:bg-primary-900/40',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary-900 dark:text-primary-100 truncate">
                      {org.name}
                    </div>
                    <div className="text-[10px] text-primary-500 mt-0.5 flex items-center gap-1.5">
                      {org.role && (
                        <span className="uppercase tracking-wider">{org.role}</span>
                      )}
                      {org.role && <span>·</span>}
                      <span>{org.currency || 'XOF'}</span>
                      {org.sector && <span>· {org.sector}</span>}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
