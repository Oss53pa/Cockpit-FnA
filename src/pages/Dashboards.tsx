import * as Icons from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

const dashboards = [
  { id: 'exec', route: '/dashboard/exec', name: 'Executive Summary ★', desc: 'Vue exécutive one-pager : KPIs, radar de performance, cascade SIG, structure bilan, alertes', icon: 'Sparkles', cat: 'Standard' },
  { id: 'compliance', route: '/dashboard/compliance', name: 'Compliance SYSCOHADA ★', desc: '10 contrôles automatiques de conformité : équilibre balance, bilan, signes de classes, mapping…', icon: 'ShieldCheck', cat: 'Standard' },
  { id: 'breakeven', route: '/dashboard/breakeven', name: 'Seuil de rentabilité ★', desc: 'Point mort, marge de sécurité, décomposition coûts fixes/variables, courbe visuelle', icon: 'Target', cat: 'Standard' },
  { id: 'pareto', route: '/dashboard/pareto', name: 'Analyse ABC (Pareto) ★', desc: "Les 20 % de comptes qui font 80 % du CA / des charges, classés A/B/C avec courbe cumulée", icon: 'BarChart3', cat: 'Standard' },
  { id: 'home', route: '/dashboard/home', name: 'Synthèse de gestion', desc: "KPIs, alertes, structure financière, performance globale", icon: 'LayoutDashboard', cat: 'Standard' },
  { id: 'cp', route: '/dashboard/cp', name: 'Charges & Produits', desc: 'Répartition par nature, évolution mensuelle, top 10, concentration', icon: 'TrendingDown', cat: 'Standard' },
  { id: 'crblock', route: '/dashboard/crblock', name: 'CR par bloc', desc: 'Vue d\'ensemble : 7 sections du CR + résultats intermédiaires', icon: 'Layers', cat: 'Standard' },
  { id: 'is_bvsa', route: '/dashboard/is_bvsa', name: 'Income Statement — Budget vs Actual', desc: 'Compte de résultat : Current period / Versus N-1 / YTD avec status', icon: 'TableProperties', cat: 'Reporting' },
  { id: 'cashflow', route: '/dashboard/cashflow', name: 'Cashflow Statement', desc: 'Position trésorerie : Cash In / Out / Solde mensuel + KPIs', icon: 'Banknote', cat: 'Reporting' },
  { id: 'receivables', route: '/dashboard/receivables', name: 'Receivables & Payables Review', desc: 'Suivi créances/dettes : KPIs, donuts et évolution mensuelle', icon: 'BookCheck', cat: 'Reporting' },
  // ─── Dashboards de section CR (charts + KPIs) ───────────
  { id: 'crsec_produits_expl', route: '/dashboard/crsec_produits_expl', name: "Produits d'exploitation — Dashboard", desc: 'KPIs + graphiques · comptes 70-75', icon: 'TrendingUp', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_expl',  route: '/dashboard/crsec_charges_expl',  name: "Charges d'exploitation — Dashboard", desc: 'KPIs + graphiques · comptes 60-66', icon: 'TrendingDown', cat: 'CR — Dashboards' },
  { id: 'crsec_produits_fin',  route: '/dashboard/crsec_produits_fin',  name: 'Produits financiers — Dashboard', desc: 'KPIs + graphiques · comptes 77', icon: 'Coins', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_fin',   route: '/dashboard/crsec_charges_fin',   name: 'Charges financières — Dashboard', desc: 'KPIs + graphiques · comptes 67', icon: 'CircleDollarSign', cat: 'CR — Dashboards' },
  { id: 'crsec_produits_hao',  route: '/dashboard/crsec_produits_hao',  name: 'Produits exceptionnels — Dashboard', desc: 'KPIs + graphiques · comptes 82, 84, 86, 88', icon: 'Sparkle', cat: 'CR — Dashboards' },
  { id: 'crsec_charges_hao',   route: '/dashboard/crsec_charges_hao',   name: 'Charges exceptionnelles — Dashboard', desc: 'KPIs + graphiques · comptes 81, 83, 85', icon: 'AlertCircle', cat: 'CR — Dashboards' },
  { id: 'crsec_impots',        route: '/dashboard/crsec_impots',        name: 'Impôts sur les bénéfices — Dashboard', desc: 'KPIs + graphiques · comptes 87, 89', icon: 'Receipt', cat: 'CR — Dashboards' },
  // ─── Tables de section CR (données pures, repliables) ────
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
  // ─── Comptabilité analytique ───────────────────────────
  { id: 'ana_dashboard', route: '/analytical?tab=dashboard', name: 'Dashboard analytique', desc: 'KPIs couverture, répartition charges/produits par code, évolution mensuelle, budget vs réalisé', icon: 'PieChart', cat: 'Analytique' },
  { id: 'ana_axes', route: '/analytical?tab=axes', name: 'Plan analytique (Axes)', desc: 'Configuration des axes analytiques : projet, centre de coût, région, activité (jusqu\'à 5 axes)', icon: 'GitBranch', cat: 'Analytique' },
  { id: 'ana_codes', route: '/analytical?tab=codes', name: 'Codes analytiques', desc: 'Gestion des codes hiérarchiques par axe : création, recherche, activation', icon: 'FolderKanban', cat: 'Analytique' },
  { id: 'ana_rules', route: '/analytical?tab=rules', name: 'Règles de mapping', desc: 'Moteur d\'affectation automatique : règles par priorité, simulation, application en masse', icon: 'Wand2', cat: 'Analytique' },
  { id: 'ana_assign', route: '/analytical?tab=assign', name: 'Affectation manuelle', desc: 'Lignes non affectées : sélection multiple, affectation manuelle en masse par axe', icon: 'ListChecks', cat: 'Analytique' },
];

export default function Dashboards() {
  const [filter, setFilter] = useState<'Tous' | 'Standard' | 'Reporting' | 'CR — Dashboards' | 'CR — Tables' | 'Sectoriel' | 'Analytique'>('Tous');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const list = dashboards.filter((d) => filter === 'Tous' || d.cat === filter);

  return (
    <div>
      <PageHeader
        title="Catalogue"
        subtitle="Standards & sectoriels — drill-down jusqu'à l'écriture"
        action={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Icons.Plus className="w-4 h-4" /> Créer un dashboard</button>}
      />

      <div className="flex gap-2 mb-6">
        {(['Tous', 'Standard', 'Reporting', 'CR — Dashboards', 'CR — Tables', 'Sectoriel', 'Analytique'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('btn !py-1.5 text-xs',
              filter === f ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline')}>
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((d) => {
          const Icon = (Icons as any)[d.icon] ?? Icons.LayoutDashboard;
          return (
            <button key={d.id} onClick={() => navigate(d.route)}
              className="group relative text-left card-premium p-5 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary-400 dark:hover:border-primary-600">
              {/* Accent lumineux au survol */}
              <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary-900/40 dark:via-primary-100/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-200/70 to-primary-300/40 dark:from-primary-800/70 dark:to-primary-700/40 flex items-center justify-center ring-1 ring-inset ring-primary-300/30 dark:ring-primary-700/30 text-primary-800 dark:text-primary-200 group-hover:from-primary-900 group-hover:to-primary-800 dark:group-hover:from-primary-100 dark:group-hover:to-primary-200 group-hover:text-primary-50 dark:group-hover:text-primary-900 transition-all duration-300">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <Badge>{d.cat}</Badge>
              </div>
              <p className="font-semibold text-[13px] text-primary-900 dark:text-primary-100 tracking-tight leading-snug">{d.name}</p>
              <p className="text-[11px] text-primary-500 mt-1.5 leading-relaxed">{d.desc}</p>

              {/* Chevron discret au survol */}
              <span aria-hidden className="absolute bottom-4 right-4 text-primary-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                <Icons.ArrowUpRight className="w-4 h-4" strokeWidth={2} />
              </span>
            </button>
          );
        })}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Créer un dashboard personnalisé"
        subtitle="Éditeur drag & drop — Sprint 4"
        footer={<>
          <button className="btn-outline" onClick={() => setCreateOpen(false)}>Annuler</button>
          <button className="btn-primary" disabled>Bientôt disponible</button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-primary-500 font-medium block mb-1">Nom du dashboard</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Suivi hebdo Direction" />
          </div>
          <div className="card p-3 bg-primary-200/30 dark:bg-primary-800/30 text-xs text-primary-500">
            <p className="font-semibold text-primary-700 dark:text-primary-300 mb-1">Éditeur visuel disponible au Sprint 4</p>
            <p>Il permettra de composer un dashboard par drag &amp; drop de widgets (KPIs, graphiques, tableaux), avec filtres globaux et partage.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
