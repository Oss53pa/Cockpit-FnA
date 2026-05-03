/**
 * DashboardTopBar — barre de navigation premium en haut des dashboards.
 *
 * Pattern UX :
 *  ┌──────────────────────────────────────────────────────┐
 *  │ ← Catalogue · 4 / 43          ← Précédent  Suivant → │
 *  └──────────────────────────────────────────────────────┘
 *
 * - Gauche  : retour catalogue + indicateur position
 * - Droite  : navigation Précédent / Suivant entre dashboards
 *
 * À placer EN PREMIER dans chaque dashboard, avant DashHeader / PageHeader.
 *
 * Usage :
 *   <DashboardTopBar currentRoute="/dashboard/pareto" />
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, LayoutDashboard } from 'lucide-react';

// Liste partagée — duplique l'ordre du catalogue (src/pages/Dashboards.tsx).
// Synchroniser avec DashboardNav.tsx.
type DashItem = { id: string; route: string; name: string; cat: string };

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
  currentRoute: string;
}

export function DashboardTopBar({ currentRoute }: Props) {
  const navigate = useNavigate();
  const idx = NAV_LIST.findIndex((d) => d.route === currentRoute);
  const prev = idx > 0 ? NAV_LIST[idx - 1] : null;
  const next = idx >= 0 && idx < NAV_LIST.length - 1 ? NAV_LIST[idx + 1] : null;

  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      {/* GAUCHE : retour catalogue + position */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/dashboards')}
          className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                   text-xs font-medium text-primary-600 dark:text-primary-300
                   hover:bg-primary-100 dark:hover:bg-primary-800
                   transition-colors duration-150"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" strokeWidth={2.2} />
          <span>Catalogue</span>
          {idx >= 0 && (
            <span className="text-primary-400 num text-[11px] tabular-nums">
              · {idx + 1} / {NAV_LIST.length}
            </span>
          )}
        </button>
      </div>

      {/* DROITE : Précédent / Suivant */}
      <div className="flex items-center gap-1.5">
        {prev && (
          <button
            onClick={() => navigate(prev.route)}
            className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                     text-xs font-medium text-primary-600 dark:text-primary-300
                     hover:bg-primary-100 dark:hover:bg-primary-800
                     transition-colors duration-150 max-w-[200px]"
            title={`Précédent : ${prev.name}`}
          >
            <ChevronLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5 shrink-0" strokeWidth={2.2} />
            <span className="truncate hidden sm:inline">{prev.name}</span>
            <span className="sm:hidden">Préc.</span>
          </button>
        )}
        {next && (
          <button
            onClick={() => navigate(next.route)}
            className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                     text-xs font-semibold text-primary-50
                     bg-primary-900 dark:bg-primary-100 dark:text-primary-900
                     hover:bg-primary-800 dark:hover:bg-primary-200
                     transition-colors duration-150 max-w-[220px] shadow-sm"
            title={`Suivant : ${next.name}`}
          >
            <span className="truncate">
              <span className="opacity-60 mr-1.5 text-[10px] uppercase tracking-wider hidden sm:inline">Suivant</span>
              <span className="hidden sm:inline">{next.name}</span>
              <span className="sm:hidden">Suivant</span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5 shrink-0" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}
