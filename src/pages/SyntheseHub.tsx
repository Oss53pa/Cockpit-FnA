/**
 * SyntheseHub — page principale de la section Synthèse, regroupant 3 vues
 * dans un système d'onglets unifié :
 *
 *   1. Vue d'ensemble (anciennement /dashboard/home)
 *   2. Santé entreprise (anciennement /diagnostic)
 *   3. Alertes (anciennement /alerts)
 *
 * Rationale : ces 3 vues sont des facettes du pilotage stratégique court-terme
 * (KPIs / score / risques). Les regrouper dans une seule entrée Sidebar
 * "Synthèse" simplifie la navigation.
 *
 * Deeplink : ?tab=vue|sante|alertes (défaut : vue).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, Stethoscope, Bell } from 'lucide-react';
import DashboardHome from './DashboardHome';
import CompanyDiagnostic from './CompanyDiagnostic';
import Alerts from './Alerts';

type View = 'vue' | 'sante' | 'alertes';
const VALID: View[] = ['vue', 'sante', 'alertes'];

export default function SyntheseHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const view: View = useMemo(
    () => (VALID.includes(raw as View) ? (raw as View) : 'vue'),
    [raw],
  );

  const setView = (v: View) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'vue') next.delete('tab');
    else next.set('tab', v);
    setSearchParams(next, { replace: true });
  };

  const tabs: { key: View; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'vue', label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { key: 'sante', label: 'Santé entreprise', icon: Stethoscope },
    { key: 'alertes', label: 'Alertes', icon: Bell },
  ];

  return (
    <div className="w-full">
      {/* Tab navigation persistante */}
      <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap inline-flex items-center gap-2',
                active
                  ? 'border-primary-900 dark:border-primary-100 text-primary-900 dark:text-primary-100'
                  : 'border-transparent text-primary-500 hover:text-primary-900 dark:hover:text-primary-100',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet sélectionné */}
      {view === 'vue' && <DashboardHome />}
      {view === 'sante' && <CompanyDiagnostic />}
      {view === 'alertes' && <Alerts />}
    </div>
  );
}
