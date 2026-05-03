/**
 * DashboardNav — navigation Précédent / Suivant entre les dashboards du catalogue.
 *
 * À placer en bas de chaque dashboard pour permettre à l'utilisateur de
 * parcourir le catalogue séquentiellement sans revenir au menu.
 *
 * Usage :
 *   <DashboardNav currentRoute="/dashboard/pareto" />
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LayoutDashboard } from 'lucide-react';

// Mini liste partagée — duplique l'ordre du catalogue (src/pages/Dashboards.tsx)
// Cette liste réduite ne contient que (id, route, name, cat) — l'icône et la
// description complète restent dans Dashboards.tsx.
type DashItem = { id: string; route: string; name: string; cat: string };

// Liste extraite — synchroniser avec Dashboards.tsx au besoin
const NAV_LIST: DashItem[] = [
  { id: 'exec',         route: '/dashboard/exec',                    name: 'Executive Summary',                cat: 'Standard' },
  { id: 'compliance',   route: '/dashboard/compliance',              name: 'Compliance SYSCOHADA',             cat: 'Standard' },
  { id: 'breakeven',    route: '/dashboard/breakeven',               name: 'Seuil de rentabilité',             cat: 'Standard' },
  { id: 'pareto',       route: '/dashboard/pareto',                  name: 'Analyse ABC (Pareto)',             cat: 'Standard' },
  { id: 'cashforecast', route: '/dashboard/cashforecast',            name: 'Cashflow prévisionnel 13s',        cat: 'Standard' },
  { id: 'waterfall',    route: '/dashboard/waterfall',               name: 'Waterfall',                        cat: 'Standard' },
  { id: 'home',         route: '/dashboard/home',                    name: 'Synthèse de gestion',              cat: 'Standard' },
  { id: 'cp',           route: '/dashboard/cp',                      name: 'Charges & Produits',               cat: 'Standard' },
  { id: 'crblock',      route: '/dashboard/crblock',                 name: 'CR par bloc',                      cat: 'Standard' },
  { id: 'is_bvsa',      route: '/dashboard/is_bvsa',                 name: 'IS — Budget vs Actual',            cat: 'Reporting' },
  { id: 'cashflow',     route: '/dashboard/cashflow',                name: 'Cashflow Statement',               cat: 'Reporting' },
  { id: 'receivables',  route: '/dashboard/receivables',             name: 'Receivables & Payables',           cat: 'Reporting' },
  { id: 'client',       route: '/dashboard/client',                  name: 'Cycle Client',                     cat: 'Standard' },
  { id: 'fr',           route: '/dashboard/fr',                      name: 'Cycle Fournisseur',                cat: 'Standard' },
  { id: 'stk',          route: '/dashboard/stk',                     name: 'Stocks',                           cat: 'Standard' },
  { id: 'immo',         route: '/dashboard/immo',                    name: 'Immobilisations',                  cat: 'Standard' },
  { id: 'tre',          route: '/dashboard/tre',                     name: 'Trésorerie',                       cat: 'Standard' },
  { id: 'bfr',          route: '/dashboard/bfr',                     name: 'BFR',                              cat: 'Standard' },
  { id: 'sal',          route: '/dashboard/sal',                     name: 'Masse salariale',                  cat: 'Standard' },
  { id: 'fis',          route: '/dashboard/fis',                     name: 'Fiscalité',                        cat: 'Standard' },
  { id: 'tft_monthly',  route: '/dashboard/tft-monthly',             name: 'TFT mensuel',                      cat: 'Reporting' },
  { id: 'cap_var',      route: '/dashboard/capital-variation',       name: 'Variation capitaux propres',       cat: 'Reporting' },
  { id: 'closing_pack', route: '/dashboard/closing-pack',            name: 'Closing Pack',                     cat: 'Reporting' },
  { id: 'zscore',       route: '/dashboard/zscore',                  name: 'Score de santé financière',        cat: 'Standard' },
  { id: 'forecast',     route: '/dashboard/forecast',                name: 'Rolling Forecast 90j',             cat: 'Standard' },
  { id: 'wcd',          route: '/dashboard/wcd',                     name: 'Working Capital Days',             cat: 'Standard' },
  { id: 'tafire',       route: '/dashboard/tafire',                  name: 'TAFIRE',                           cat: 'Reporting' },
  { id: 'bilan_monthly',route: '/dashboard/bilan-monthly',           name: 'Bilan mensuel',                    cat: 'Reporting' },
  { id: 'caf',          route: '/dashboard/caf',                     name: 'CAF mensuelle',                    cat: 'Reporting' },
  { id: 'multi_year',   route: '/dashboard/multi-year',              name: 'Comparaison N / N-1 / N-2',        cat: 'Reporting' },
  { id: 'bank_recon',   route: '/dashboard/bank-reconciliation',     name: 'Rapprochement bancaire',           cat: 'Reporting' },
  { id: 'closing_just', route: '/dashboard/closing-justification',   name: 'Justification de clôture',         cat: 'Reporting' },
  { id: 'audit_visu',   route: '/dashboard/audit-trail',             name: 'Audit Trail visualizer',           cat: 'Audit' },
  { id: 'anomalies',    route: '/dashboard/anomalies',               name: 'Carte des anomalies',              cat: 'Audit' },
  { id: 'lettrage',     route: '/dashboard/lettrage',                name: 'Lettrage tiers',                   cat: 'Audit' },
  { id: 'seasonality',  route: '/dashboard/seasonality',             name: 'Saisonnalité',                     cat: 'Pilotage' },
  { id: 'whatif',       route: '/dashboard/whatif',                  name: 'What-If / Sensibilité',            cat: 'Pilotage' },
  { id: 'provisions',   route: '/dashboard/provisions',              name: 'Provisions tracking',              cat: 'Pilotage' },
  { id: 'intercos',     route: '/dashboard/intercos',                name: 'Intercos / CCA',                   cat: 'Pilotage' },
  { id: 'weekly',       route: '/dashboard/weekly',                  name: 'Flash hebdo',                      cat: 'Direction' },
  { id: 'mda',          route: '/dashboard/mda',                     name: 'MD&A auto-généré',                 cat: 'Direction' },
  { id: 'board_pack',   route: '/dashboard/board-pack',              name: 'Board Pack',                       cat: 'Direction' },
  { id: 'sector_bench', route: '/dashboard/sector-benchmark',        name: 'Comparatif sectoriel',             cat: 'Direction' },
  { id: 'proph3t',      route: '/dashboard/proph3t',                 name: 'Proph3t · Intelligence',           cat: 'Direction' },
];

interface Props {
  /** Route courante — ex '/dashboard/pareto' */
  currentRoute: string;
  /** Affiche le bouton retour Catalogue (default: true) */
  showCatalog?: boolean;
}

export function DashboardNav({ currentRoute, showCatalog = true }: Props) {
  const navigate = useNavigate();
  const idx = NAV_LIST.findIndex((d) => d.route === currentRoute);
  const prev = idx > 0 ? NAV_LIST[idx - 1] : null;
  const next = idx >= 0 && idx < NAV_LIST.length - 1 ? NAV_LIST[idx + 1] : null;

  if (idx < 0) return null;

  return (
    <div className="mt-6 pt-5 border-t border-primary-200/60 dark:border-primary-800/60">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Précédent */}
        {prev ? (
          <button
            onClick={() => navigate(prev.route)}
            className="group flex items-center gap-3 p-3 rounded-xl
                     border border-primary-200 dark:border-primary-800
                     bg-surface dark:bg-primary-900
                     hover:border-accent hover:bg-accent/5
                     transition-all duration-200 ease-spring
                     min-w-0 flex-1 max-w-[280px] text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-800
                          group-hover:bg-accent/10 transition-colors
                          flex items-center justify-center shrink-0">
              <ArrowLeft className="w-4 h-4 text-primary-500 group-hover:text-accent
                                  transition-all group-hover:-translate-x-0.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-400 mb-0.5">
                Précédent · {prev.cat}
              </p>
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 truncate">
                {prev.name}
              </p>
            </div>
          </button>
        ) : (
          <div className="flex-1 max-w-[280px]" />
        )}

        {/* Bouton catalogue centre */}
        {showCatalog && (
          <button
            onClick={() => navigate('/dashboards')}
            className="btn-outline shrink-0"
            title="Retour au catalogue"
          >
            <LayoutDashboard className="w-4 h-4" /> Catalogue
            <span className="text-[10px] text-primary-400 ml-1 num">{idx + 1} / {NAV_LIST.length}</span>
          </button>
        )}

        {/* Suivant */}
        {next ? (
          <button
            onClick={() => navigate(next.route)}
            className="group flex items-center gap-3 p-3 rounded-xl
                     border border-primary-200 dark:border-primary-800
                     bg-surface dark:bg-primary-900
                     hover:border-accent hover:bg-accent/5
                     transition-all duration-200 ease-spring
                     min-w-0 flex-1 max-w-[280px] text-right"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-400 mb-0.5">
                Suivant · {next.cat}
              </p>
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-50 truncate">
                {next.name}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-800
                          group-hover:bg-accent/10 transition-colors
                          flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-primary-500 group-hover:text-accent
                                   transition-all group-hover:translate-x-0.5" strokeWidth={2.2} />
            </div>
          </button>
        ) : (
          <div className="flex-1 max-w-[280px]" />
        )}
      </div>
    </div>
  );
}
