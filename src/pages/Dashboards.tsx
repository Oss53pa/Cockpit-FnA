import * as Icons from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';

const dashboards = [
  { id: 'exec', route: '/dashboard/exec', name: 'Executive Summary ★', desc: 'Vue exécutive one-pager : KPIs, radar de performance, cascade SIG, structure bilan, alertes', icon: 'Sparkles', cat: 'Standard' },
  { id: 'compliance', route: '/dashboard/compliance', name: 'Compliance SYSCOHADA ★', desc: '10 contrôles automatiques de conformité : équilibre balance, bilan, signes de classes, mapping…', icon: 'ShieldCheck', cat: 'Standard' },
  { id: 'breakeven', route: '/dashboard/breakeven', name: 'Seuil de rentabilité ★', desc: 'Point mort, marge de sécurité, décomposition coûts fixes/variables, courbe visuelle', icon: 'Target', cat: 'Standard' },
  { id: 'pareto', route: '/dashboard/pareto', name: 'Analyse ABC (Pareto) ★', desc: "Les 20 % de comptes qui font 80 % du CA / des charges, classés A/B/C avec courbe cumulée", icon: 'BarChart3', cat: 'Standard' },
  { id: 'cashforecast', route: '/dashboard/cashforecast', name: 'Cashflow prévisionnel 13 semaines ★', desc: 'Projection treasurer : encaissements AR, décaissements AP, salaires, impôts. Alertes seuil critique.', icon: 'Banknote', cat: 'Standard' },
  { id: 'waterfall', route: '/dashboard/waterfall', name: 'Waterfall ★', desc: 'Cascade SIG du CA au Résultat Net OU décomposition de l\'écart Budget/Réalisé par section', icon: 'Layers3', cat: 'Standard' },
  { id: 'home', route: '/dashboard/home', name: 'Synthèse de gestion', desc: "KPIs, alertes, structure financière, performance globale", icon: 'LayoutDashboard', cat: 'Standard' },
  { id: 'cp', route: '/dashboard/cp', name: 'Charges & Produits', desc: 'Répartition par nature, évolution mensuelle, top 10, concentration', icon: 'TrendingDown', cat: 'Standard' },
  { id: 'crblock', route: '/dashboard/crblock', name: 'CR par bloc', desc: 'Vue d\'ensemble : 7 sections du CR + résultats intermédiaires', icon: 'Layers', cat: 'Standard' },
  { id: 'is_bvsa', route: '/dashboard/is_bvsa', name: 'Income Statement — Budget vs Actual', desc: 'Compte de résultat : Current period / Versus N-1 / YTD avec status', icon: 'TableProperties', cat: 'Reporting' },
  { id: 'cashflow', route: '/dashboard/cashflow', name: 'Cashflow Statement', desc: 'Position trésorerie : Cash In / Out / Solde mensuel + KPIs', icon: 'Banknote', cat: 'Reporting' },
  { id: 'receivables', route: '/dashboard/receivables', name: 'Receivables & Payables Review', desc: 'Suivi créances/dettes : KPIs, donuts et évolution mensuelle', icon: 'BookCheck', cat: 'Reporting' },
  { id: 'crsec_produits_expl', route: '/dashboard/crsec_produits_expl', name: "Produits d'exploitation — Dashboard", desc: 'KPIs + graphiques · comptes 70-75', icon: 'TrendingUp', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_expl',  route: '/dashboard/crsec_charges_expl',  name: "Charges d'exploitation — Dashboard", desc: 'KPIs + graphiques · comptes 60-66', icon: 'TrendingDown', cat: 'CR — Dashboards' },
  { id: 'crsec_produits_fin',  route: '/dashboard/crsec_produits_fin',  name: 'Produits financiers — Dashboard', desc: 'KPIs + graphiques · comptes 77', icon: 'Coins', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_fin',   route: '/dashboard/crsec_charges_fin',   name: 'Charges financières — Dashboard', desc: 'KPIs + graphiques · comptes 67', icon: 'CircleDollarSign', cat: 'CR — Dashboards' },
  { id: 'crsec_produits_hao',  route: '/dashboard/crsec_produits_hao',  name: 'Produits exceptionnels — Dashboard', desc: 'KPIs + graphiques · comptes 82, 84, 86, 88', icon: 'Sparkle', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_hao',   route: '/dashboard/crsec_charges_hao',   name: 'Charges exceptionnelles — Dashboard', desc: 'KPIs + graphiques · comptes 81, 83, 85', icon: 'AlertCircle', cat: 'CR — Dashboards' },
  { id: 'crsec_impots',        route: '/dashboard/crsec_impots',        name: 'Impôts sur les bénéfices — Dashboard', desc: 'KPIs + graphiques · comptes 87, 89', icon: 'Receipt', cat: 'CR — Dashboards' },
  { id: 'crtab_produits_expl', route: '/dashboard/crtab_produits_expl', name: "Produits d'exploitation — Table", desc: 'Tableau détaillé des comptes 70-75', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_charges_expl',  route: '/dashboard/crtab_charges_expl',  name: "Charges d'exploitation — Table", desc: 'Tableau détaillé des comptes 60-66', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_produits_fin',  route: '/dashboard/crtab_produits_fin',  name: 'Produits financiers — Table', desc: 'Tableau détaillé des comptes 77', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_charges_fin',   route: '/dashboard/crtab_charges_fin',   name: 'Charges financières — Table', desc: 'Tableau détaillé des comptes 67', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_produits_hao',  route: '/dashboard/crtab_produits_hao',  name: 'Produits exceptionnels — Table', desc: 'Tableau détaillé des comptes 82, 84, 86, 88', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_charges_hao',   route: '/dashboard/crtab_charges_hao',   name: 'Charges exceptionnelles — Table', desc: 'Tableau détaillé des comptes 81, 83, 85', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'crtab_impots',        route: '/dashboard/crtab_impots',        name: 'Impôts sur les bénéfices — Table', desc: 'Tableau détaillé des comptes 87, 89', icon: 'Table2', cat: 'CR — Tables' },
  { id: 'client', route: '/dashboard/client', name: 'Cycle Client', desc: 'DSO, balance âgée, top débiteurs, créances douteuses', icon: 'Users', cat: 'Standard' },
  { id: 'fr', route: '/dashboard/fr', name: 'Cycle Fournisseur', desc: 'DPO, échéancier, concentration, dépendance', icon: 'Truck', cat: 'Standard' },
  { id: 'stk', route: '/dashboard/stk', name: 'Stocks', desc: 'Valorisation par nature, dépréciations, rotation', icon: 'Package', cat: 'Standard' },
  { id: 'immo', route: '/dashboard/immo', name: 'Immobilisations', desc: 'Valeur brute, amortissements, VNC, taux de vétusté', icon: 'Building2', cat: 'Standard' },
  { id: 'tre', route: '/dashboard/tre', name: 'Trésorerie', desc: 'Position, flux mensuels, volatilité, amplitude', icon: 'Wallet', cat: 'Standard' },
  { id: 'bfr', route: '/dashboard/bfr', name: 'BFR', desc: 'Équation FR/BFR/TN, décomposition, cycle d\'exploitation', icon: 'Activity', cat: 'Standard' },
  { id: 'sal', route: '/dashboard/sal', name: 'Masse salariale', desc: 'Salaires directs, charges, ratio masse/CA, évolution', icon: 'UserCog', cat: 'Standard' },
  { id: 'fis', route: '/dashboard/fis', name: 'Fiscalité', desc: 'TVA collectée/déductible/nette, IS, pression fiscale', icon: 'Receipt', cat: 'Standard' },
  { id: 'ind', route: '/dashboard/ind', name: 'Industrie', desc: 'Production, coût MP, marge industrielle, taux de marge', icon: 'Factory', cat: 'Sectoriel' },
  { id: 'btp', route: '/dashboard/btp', name: 'BTP', desc: 'Travaux facturés, achats chantier, sous-traitance, marge', icon: 'HardHat', cat: 'Sectoriel' },
  { id: 'com', route: '/dashboard/com', name: 'Commerce', desc: 'Ventes, coût d\'achat, marge commerciale, taux de marque', icon: 'ShoppingCart', cat: 'Sectoriel' },
  { id: 'mfi', route: '/dashboard/mfi', name: 'Microfinance', desc: 'Produits/charges d\'intérêts, PNB, encours clients', icon: 'Landmark', cat: 'Sectoriel' },
  { id: 'imco', route: '/dashboard/imco', name: 'Immobilier commercial', desc: 'Loyers, taux occupation, charges locatives, rentabilité m²', icon: 'Building', cat: 'Sectoriel' },
  { id: 'hot', route: '/dashboard/hot', name: 'Hôtellerie & Restauration', desc: 'RevPAR, taux occupation, ADR, GOP, F&B ratio', icon: 'Hotel', cat: 'Sectoriel' },
  { id: 'agri', route: '/dashboard/agri', name: 'Agriculture', desc: 'Production, intrants, rendement/ha, subventions, stocks', icon: 'Wheat', cat: 'Sectoriel' },
  { id: 'sante', route: '/dashboard/sante', name: 'Santé', desc: 'Actes médicaux, recettes, personnel soignant, équipements', icon: 'HeartPulse', cat: 'Sectoriel' },
  { id: 'transp', route: '/dashboard/transp', name: 'Transport & Logistique', desc: 'CA/km, flotte, carburant, maintenance, taux de remplissage', icon: 'Truck', cat: 'Sectoriel' },
  { id: 'serv', route: '/dashboard/serv', name: 'Services & Conseil', desc: 'Honoraires, taux facturable, marge projets, staffing', icon: 'Briefcase', cat: 'Sectoriel' },
  { id: 'alerts', route: '/alerts', name: 'Points d\'attention & Alertes', desc: 'Risques détectés, anomalies comptables, seuils dépassés, suivi par sévérité et statut', icon: 'AlertTriangle', cat: 'Pilotage' },
  { id: 'actions', route: '/actions', name: 'Plan d\'action', desc: 'Actions correctives, responsables, échéances, priorités, taux d\'avancement, actions en retard', icon: 'ClipboardCheck', cat: 'Pilotage' },
  { id: 'ana_dashboard', route: '/analytical?tab=dashboard', name: 'Dashboard analytique', desc: 'KPIs couverture, répartition charges/produits par code, évolution mensuelle, budget vs réalisé', icon: 'PieChart', cat: 'Analytique' },
  { id: 'ana_axes', route: '/analytical?tab=axes', name: 'Plan analytique (Axes)', desc: 'Configuration des axes analytiques : projet, centre de coût, région, activité (jusqu\'à 5 axes)', icon: 'GitBranch', cat: 'Analytique' },
  { id: 'ana_codes', route: '/analytical?tab=codes', name: 'Codes analytiques', desc: 'Gestion des codes hiérarchiques par axe : création, recherche, activation', icon: 'FolderKanban', cat: 'Analytique' },
  { id: 'ana_rules', route: '/analytical?tab=rules', name: 'Règles de mapping', desc: 'Moteur d\'affectation automatique : règles par priorité, simulation, application en masse', icon: 'Wand2', cat: 'Analytique' },
  { id: 'ana_assign', route: '/analytical?tab=assign', name: 'Affectation manuelle', desc: 'Lignes non affectées : sélection multiple, affectation manuelle en masse par axe', icon: 'ListChecks', cat: 'Analytique' },
  // ─── États SYSCOHADA officiels (NOUVEAUX) ─────────────────────
  { id: 'tft_monthly',  route: '/dashboard/tft-monthly',       name: 'TFT mensuel ★',                desc: 'Tableau des Flux de Trésorerie sur 12 mois — exploitation/investissement/financement (SYSCOHADA art. 38)', icon: 'GitBranch',      cat: 'Reporting' },
  { id: 'cap_var',      route: '/dashboard/capital-variation', name: 'Variation capitaux propres ★', desc: 'État SYSCOHADA obligatoire — apports, distributions, affectation résultat, mouvements bruts',                  icon: 'Layers',         cat: 'Reporting' },
  { id: 'closing_pack', route: '/dashboard/closing-pack',      name: 'Closing Pack ★',               desc: 'Synthèse 1 page A4 print-ready : KPIs, charts, alertes, faits saillants — livrable Direction',                  icon: 'FileBarChart',   cat: 'Reporting' },
  { id: 'zscore',       route: '/dashboard/zscore',            name: 'Score de santé financière ★',  desc: 'Z-Score Altman + score Cockpit 0-100 par famille (Rentabilité/Liquidité/Structure/Activité)',                     icon: 'Award',          cat: 'Standard'  },
  { id: 'forecast',     route: '/dashboard/forecast',          name: 'Rolling Forecast 90j ★',       desc: 'Projection trésorerie 30/60/90 jours, modèle Prophet-like + bandes de confiance + alerte rupture',                icon: 'TrendingUp',     cat: 'Standard'  },
  { id: 'wcd',          route: '/dashboard/wcd',               name: 'Working Capital Days ★',       desc: 'DSO + DIO + DPO + Cash Conversion Cycle — efficacité du cycle d\'exploitation',                                    icon: 'Clock',          cat: 'Standard'  },
  // ─── États SYSCOHADA + Reporting avancé (Phase 4) ──────────────
  { id: 'tafire',       route: '/dashboard/tafire',            name: 'TAFIRE ★',                     desc: 'Tableau Financier des Ressources & Emplois — état SYSCOHADA obligatoire (art. 29-37)',                            icon: 'GitMerge',       cat: 'Reporting' },
  { id: 'bilan_monthly',route: '/dashboard/bilan-monthly',     name: 'Bilan mensuel ★',              desc: 'Évolution actif/passif sur 12 mois — area chart stacked + suivi capitaux propres',                                icon: 'BarChartHorizontal', cat: 'Reporting' },
  { id: 'caf',          route: '/dashboard/caf',               name: 'CAF mensuelle ★',              desc: 'Capacité d\'autofinancement mensuelle — résultat net + dotations - reprises - cessions',                          icon: 'PiggyBank',      cat: 'Reporting' },
  { id: 'multi_year',   route: '/dashboard/multi-year',        name: 'Comparaison N / N-1 / N-2 ★',  desc: 'Évolution pluriannuelle des SIG, ratios et structure — analyse tendance',                                        icon: 'CalendarRange',  cat: 'Reporting' },
  { id: 'bank_recon',   route: '/dashboard/bank-reconciliation', name: 'Rapprochement bancaire',     desc: 'État de rapprochement GL ↔ relevé : suspens, dates de valeur, écarts à régulariser',                              icon: 'Scale',          cat: 'Reporting' },
  { id: 'closing_just', route: '/dashboard/closing-justification', name: 'Justification de clôture', desc: 'Provisions, CCA/PCA, FAE/FAP — régularisations de fin d\'exercice',                                              icon: 'ClipboardList',  cat: 'Reporting' },
  // ─── Audit, conformité & qualité ────────────────────────────────
  { id: 'audit_visu',   route: '/dashboard/audit-trail',       name: 'Audit Trail visualizer ★',     desc: 'Vérification de la chaîne de hash SHA-256 des écritures — intégrité cryptographique GL',                          icon: 'ShieldCheck',    cat: 'Audit' },
  { id: 'anomalies',    route: '/dashboard/anomalies',         name: 'Carte des anomalies ★',        desc: 'Heatmap mois × catégories d\'anomalies (déséquilibres, doublons, signes inversés)',                              icon: 'AlertOctagon',   cat: 'Audit' },
  { id: 'lettrage',     route: '/dashboard/lettrage',          name: 'Lettrage tiers',               desc: 'Taux de lettrage par tiers, vieillissement créances/dettes, top tiers non lettrés',                              icon: 'Link2',          cat: 'Audit' },
  // ─── Pilotage avancé ────────────────────────────────────────────
  { id: 'seasonality',  route: '/dashboard/seasonality',       name: 'Saisonnalité',                 desc: 'Index de saisonnalité du CA — détection des pics et creux mensuels (base 100)',                                  icon: 'CalendarClock',  cat: 'Pilotage' },
  { id: 'whatif',       route: '/dashboard/whatif',            name: 'What-If / Sensibilité',        desc: 'Simulation tarifaire : sliders CA / marge / charges — impact en temps réel sur le résultat',                     icon: 'Sliders',        cat: 'Pilotage' },
  { id: 'provisions',   route: '/dashboard/provisions',        name: 'Provisions tracking',          desc: 'Suivi des dotations / reprises de provisions et amortissements (comptes 68x/78x)',                               icon: 'Vault',          cat: 'Pilotage' },
  { id: 'intercos',     route: '/dashboard/intercos',          name: 'Intercos / CCA',               desc: 'Comptes courants associés — opérations intra-groupe (167, 267, 4561, 462, 463)',                                  icon: 'Network',        cat: 'Pilotage' },
  // ─── Direction & Board ──────────────────────────────────────────
  { id: 'weekly',       route: '/dashboard/weekly',            name: 'Flash hebdo ★',                desc: 'Tableau de bord hebdomadaire Direction — CA, cash, alertes, top points de vigilance',                            icon: 'Zap',            cat: 'Direction' },
  { id: 'mda',          route: '/dashboard/mda',               name: 'MD&A auto-généré ★',           desc: 'Management Discussion & Analysis — narratif synthétique généré par règles (Proph3t)',                              icon: 'Sparkles',       cat: 'Direction' },
  { id: 'board_pack',   route: '/dashboard/board-pack',        name: 'Board Pack ★',                 desc: 'Synthèse trimestrielle 4 slides Conseil d\'Administration — print-ready A4',                                      icon: 'Presentation',   cat: 'Direction' },
  { id: 'sector_bench', route: '/dashboard/sector-benchmark',  name: 'Comparatif sectoriel ★',       desc: 'Ratios entreprise vs normes UEMOA OHADA par secteur (Industrie, BTP, Commerce, Services…)',                       icon: 'Building2',      cat: 'Direction' },
  // ─── Proph3t Intelligence avancée ──────────────────────────────
  { id: 'proph3t',      route: '/dashboard/proph3t',           name: 'Proph3t · Intelligence ★★',    desc: 'Date-aware · Predict · Correct · Suggest · Audit · Memorize — orchestrateur d\'IA financière déterministe',           icon: 'Brain',          cat: 'Direction' },
  // ─── Builder personnalisé (Sprint 4) ──────────────────────────
  { id: 'builder',      route: '/builder',                     name: 'Mes dashboards personnalisés', desc: 'Composez vos propres dashboards par drag & drop : KPIs, charts, tables. Persistance locale.',                  icon: 'LayoutGrid',     cat: 'Custom'    },
];

type ViewMode = 'cards' | 'table' | 'kanban';
const VIEW_KEY = 'dashboards-view-mode';

const CATEGORIES = ['Tous', 'Standard', 'Reporting', 'Audit', 'Direction', 'CR — Dashboards', 'CR — Tables', 'Sectoriel', 'Pilotage', 'Analytique', 'Custom'] as const;
type Category = typeof CATEGORIES[number];

export default function Dashboards() {
  const [filter, setFilter] = useState<Category>('Tous');
  const [view, setView] = useState<ViewMode>(() => {
    const v = localStorage.getItem(VIEW_KEY);
    return (v === 'table' || v === 'kanban' || v === 'cards') ? v : 'cards';
  });
  const navigate = useNavigate();
  const list = dashboards.filter((d) => filter === 'Tous' || d.cat === filter);

  const setViewMode = (m: ViewMode) => { setView(m); localStorage.setItem(VIEW_KEY, m); };

  return (
    <div>
      <PageHeader
        title="Catalogue"
        subtitle="Standards & sectoriels — drill-down jusqu'à l'écriture"
        action={
          <div className="flex items-center gap-2">
            <ViewSwitcher view={view} onChange={setViewMode} />
            <button className="btn-primary" onClick={() => navigate('/builder')}>
              <Icons.Plus className="w-4 h-4" /> Créer un dashboard
            </button>
          </div>
        }
      />

      {/* Filtres catégorie — pills horizontales scrollables */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'btn !py-1.5 text-xs whitespace-nowrap shrink-0',
              filter === f
                ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900'
                : 'btn-outline',
            )}
          >
            {f}
            <span className={clsx('ml-1.5 text-[10px] tabular-nums opacity-70')}>
              ({f === 'Tous' ? dashboards.length : dashboards.filter((d) => d.cat === f).length})
            </span>
          </button>
        ))}
      </div>

      {/* Vue Cartes */}
      {view === 'cards' && <CardsView list={list} navigate={navigate} />}

      {/* Vue Table */}
      {view === 'table' && <TableView list={list} navigate={navigate} />}

      {/* Vue Kanban */}
      {view === 'kanban' && <KanbanView list={list} navigate={navigate} filter={filter} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// View Switcher (Cards / Table / Kanban)
// ─────────────────────────────────────────────────────────────────────
function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const buttons: { v: ViewMode; icon: React.ComponentType<any>; label: string }[] = [
    { v: 'cards',  icon: Icons.LayoutGrid,    label: 'Cartes' },
    { v: 'table',  icon: Icons.Rows3,         label: 'Table' },
    { v: 'kanban', icon: Icons.LayoutDashboard, label: 'Kanban' },
  ];
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-primary-200/40 dark:bg-primary-800/40">
      {buttons.map((b) => {
        const active = view === b.v;
        return (
          <button
            key={b.v}
            type="button"
            onClick={() => onChange(b.v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150',
              active
                ? 'bg-surface text-primary-900 shadow-sm dark:bg-primary-100 dark:text-primary-900'
                : 'text-primary-500 hover:text-primary-900 dark:hover:text-primary-100',
            )}
            aria-pressed={active}
            title={`Vue ${b.label}`}
          >
            <b.icon className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vue 1 — CARTES
// ─────────────────────────────────────────────────────────────────────
function CardsView({ list, navigate }: { list: typeof dashboards; navigate: (path: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {list.map((d) => {
        const Icon = (Icons as any)[d.icon] ?? Icons.LayoutDashboard;
        return (
          <button
            key={d.id}
            onClick={() => navigate(d.route)}
            className="group relative text-left card-premium p-5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary-400 dark:hover:border-primary-600"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary-900/40 dark:via-primary-100/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-200/70 to-primary-300/40 dark:from-primary-800/70 dark:to-primary-700/40 flex items-center justify-center ring-1 ring-inset ring-primary-300/30 dark:ring-primary-700/30 text-primary-800 dark:text-primary-200 group-hover:from-primary-900 group-hover:to-primary-800 dark:group-hover:from-primary-100 dark:group-hover:to-primary-200 group-hover:text-primary-50 dark:group-hover:text-primary-900 transition-all duration-300">
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <Badge>{d.cat}</Badge>
            </div>
            <p className="font-semibold text-[13px] text-primary-900 dark:text-primary-100 tracking-tight leading-snug">{d.name}</p>
            <p className="text-[11px] text-primary-500 mt-1.5 leading-relaxed">{d.desc}</p>
            <span aria-hidden className="absolute bottom-4 right-4 text-primary-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
              <Icons.ArrowUpRight className="w-4 h-4" strokeWidth={2} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vue 2 — TABLE
// ─────────────────────────────────────────────────────────────────────
function TableView({ list, navigate }: { list: typeof dashboards; navigate: (path: string) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-100/60 dark:bg-primary-800/60 text-primary-600 dark:text-primary-300 text-[11px] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-semibold w-10"></th>
              <th className="text-left py-2.5 px-4 font-semibold">Dashboard</th>
              <th className="text-left py-2.5 px-4 font-semibold hidden md:table-cell">Description</th>
              <th className="text-left py-2.5 px-4 font-semibold w-40">Catégorie</th>
              <th className="py-2.5 px-4 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((d, i) => {
              const Icon = (Icons as any)[d.icon] ?? Icons.LayoutDashboard;
              return (
                <tr
                  key={d.id}
                  onClick={() => navigate(d.route)}
                  className={clsx(
                    'cursor-pointer table-row-hover transition-colors',
                    i !== list.length - 1 && 'border-b border-primary-200/60 dark:border-primary-800',
                  )}
                >
                  <td className="py-3 px-4">
                    <div className="w-8 h-8 rounded-lg bg-primary-100/80 dark:bg-primary-800/80 flex items-center justify-center text-primary-700 dark:text-primary-200">
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-primary-900 dark:text-primary-100">{d.name}</td>
                  <td className="py-3 px-4 text-xs text-primary-500 hidden md:table-cell max-w-md">
                    <span className="line-clamp-2">{d.desc}</span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge>{d.cat}</Badge>
                  </td>
                  <td className="py-3 px-4 text-primary-400">
                    <Icons.ChevronRight className="w-4 h-4" strokeWidth={2} />
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-primary-400">
                  Aucun dashboard dans cette catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vue 3 — KANBAN (colonnes par catégorie)
// ─────────────────────────────────────────────────────────────────────
function KanbanView({ list, navigate, filter }: {
  list: typeof dashboards;
  navigate: (path: string) => void;
  filter: Category;
}) {
  // Groupe par catégorie. Si filtre actif (≠ Tous), on n'affiche qu'une colonne.
  const groups = filter === 'Tous'
    ? CATEGORIES.filter((c) => c !== 'Tous').map((cat) => ({
        cat,
        items: list.filter((d) => d.cat === cat),
      })).filter((g) => g.items.length > 0)
    : [{ cat: filter, items: list }];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0 snap-x snap-mandatory">
      {groups.map(({ cat, items }) => (
        <div key={cat} className="shrink-0 w-[320px] flex flex-col snap-start">
          {/* Header colonne */}
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-200 truncate">
              {cat}
            </h3>
            <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-primary-200/60 dark:bg-primary-800/60 text-primary-600 dark:text-primary-300 shrink-0">
              {items.length}
            </span>
          </div>

          {/* Cards verticales */}
          <div className="flex flex-col gap-2 bg-primary-100/30 dark:bg-primary-900/30 p-2 rounded-2xl min-h-[200px] flex-1 border border-primary-200/40 dark:border-primary-800/40">
            {items.map((d) => {
              const Icon = (Icons as any)[d.icon] ?? Icons.LayoutDashboard;
              return (
                <button
                  key={d.id}
                  onClick={() => navigate(d.route)}
                  className="group text-left card p-3 hover:shadow-md hover:-translate-y-px transition-all duration-200 w-full"
                >
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary-200/80 dark:bg-primary-800/80 flex items-center justify-center text-primary-700 dark:text-primary-200 shrink-0 group-hover:bg-primary-900 group-hover:text-primary-50 dark:group-hover:bg-primary-100 dark:group-hover:text-primary-900 transition-colors">
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </div>
                    <p className="font-semibold text-[12px] text-primary-900 dark:text-primary-100 leading-snug tracking-tight flex-1 break-words">
                      {d.name}
                    </p>
                  </div>
                  <p className="text-[10px] text-primary-500 leading-relaxed break-words">
                    {d.desc}
                  </p>
                </button>
              );
            })}
            {items.length === 0 && (
              <p className="text-[10px] text-primary-400 italic text-center py-4">
                Aucun dashboard
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
