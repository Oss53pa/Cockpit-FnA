import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Eye, FileText, Mail, Plus, Save, Send, Settings as SettingsIcon, Sparkles, Trash2, Type, Hash, BarChart3, Table as TableIcon, MoveDown } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import clsx from 'clsx';
import { saveAs } from 'file-saver';
import { PageHeader } from '../components/layout/PageHeader';
import { Modal } from '../components/ui/Modal';
import { Collapsible } from '../components/ui/Collapsible';
import { toast } from '../components/ui/Toast';
import { useBudgetActual, useCapitalVariation, useCurrentOrg, useMonthlyCR, useMonthlyBilan, useRatios, useStatements, useTFT } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { computeRatios } from '../engine/ratios';
import { db, ReportDoc } from '../db/schema';
import { Block, buildPPTXFromBlocks, DEFAULT_CONFIG, PALETTES, PaletteKey, ReportConfig } from '../engine/reportBlocks';
import { computeBilan, computeSIG } from '../engine/statements';
import { fmtFull, fmtMoney } from '../lib/format';

const TABLE_CATALOG: Array<{ v: string; label: string; cat: string; desc: string }> = [
  { v: 'bilan_actif', label: 'Bilan — Actif', cat: 'États', desc: 'Actif immobilisé, circulant, trésorerie' },
  { v: 'bilan_passif', label: 'Bilan — Passif', cat: 'États', desc: 'Capitaux propres, ressources stables, dettes' },
  { v: 'cr', label: 'Compte de résultat', cat: 'États', desc: 'CR officiel SYSCOHADA avec SIG' },
  { v: 'sig', label: 'Soldes intermédiaires (SIG)', cat: 'États', desc: 'Marge brute, VA, EBE, RE, RN' },
  { v: 'balance', label: 'Balance générale', cat: 'États', desc: 'Tous les comptes mouvementés' },
  { v: 'tft', label: 'Tableau des flux de trésorerie', cat: 'États', desc: 'CAFG, BFR, flux op./inv./fin.' },
  { v: 'capital', label: 'Variation des capitaux propres', cat: 'États', desc: 'Mouvements par rubrique' },
  { v: 'ratios', label: 'Ratios financiers', cat: 'Analyse', desc: 'Rentabilité, liquidité, structure, activité' },
  { v: 'budget_actual', label: 'Budget vs Réalisé (annuel)', cat: 'Analyse', desc: 'Écarts annuels par compte sur tout le CR' },
  { v: 'cr_monthly', label: 'CR mensuel (Jan→Déc)', cat: 'Mensuel', desc: 'Compte de résultat mois par mois' },
  { v: 'bilan_monthly', label: 'Bilan mensuel (Jan→Déc)', cat: 'Mensuel', desc: 'Bilan actif/passif mois par mois' },
  { v: 'budget_monthly', label: 'Budget vs Réalisé (mensuel + N-1)', cat: 'Mensuel', desc: 'Réalisé / Budget / N-1 par mois et par section' },
  // ─── CR Bloc Tables : Monthly ───
  { v: 'crtab_produits_expl_m', label: "Produits expl. — Monthly", cat: 'CR Monthly', desc: '70-75 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_charges_expl_m', label: "Charges expl. — Monthly", cat: 'CR Monthly', desc: '60-66 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_produits_fin_m', label: 'Produits fin. — Monthly', cat: 'CR Monthly', desc: '77 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_charges_fin_m', label: 'Charges fin. — Monthly', cat: 'CR Monthly', desc: '67 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_produits_hao_m', label: 'Produits HAO — Monthly', cat: 'CR Monthly', desc: '82,84,86,88 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_charges_hao_m', label: 'Charges HAO — Monthly', cat: 'CR Monthly', desc: '81,83,85 : Actual / Budget / N-1 mois + YTD' },
  { v: 'crtab_impots_m', label: 'Impôts — Monthly', cat: 'CR Monthly', desc: '87,89 : Actual / Budget / N-1 mois + YTD' },
  // ─── CR Bloc Tables : Quarterly ───
  { v: 'crtab_produits_expl_q', label: "Produits expl. — Quarterly", cat: 'CR Quarterly', desc: '70-75 : Actual / Budget / N-1 trimestre + YTD' },
  { v: 'crtab_charges_expl_q', label: "Charges expl. — Quarterly", cat: 'CR Quarterly', desc: '60-66 : Actual / Budget / N-1 trimestre + YTD' },
  { v: 'crtab_produits_fin_q', label: 'Produits fin. — Quarterly', cat: 'CR Quarterly', desc: '77 : Actual / Budget / N-1 trimestre + YTD' },
  { v: 'crtab_charges_fin_q', label: 'Charges fin. — Quarterly', cat: 'CR Quarterly', desc: '67 : Actual / Budget / N-1 trimestre + YTD' },
  { v: 'crtab_impots_q', label: 'Impôts — Quarterly', cat: 'CR Quarterly', desc: '87,89 : Actual / Budget / N-1 trimestre + YTD' },
  // ─── CR Bloc Tables : Interim (S1/S2) ───
  { v: 'crtab_produits_expl_s', label: "Produits expl. — Interim", cat: 'CR Interim', desc: '70-75 : Actual / Budget / N-1 semestre + YTD' },
  { v: 'crtab_charges_expl_s', label: "Charges expl. — Interim", cat: 'CR Interim', desc: '60-66 : Actual / Budget / N-1 semestre + YTD' },
  { v: 'crtab_produits_fin_s', label: 'Produits fin. — Interim', cat: 'CR Interim', desc: '77 : Actual / Budget / N-1 semestre + YTD' },
  { v: 'crtab_charges_fin_s', label: 'Charges fin. — Interim', cat: 'CR Interim', desc: '67 : Actual / Budget / N-1 semestre + YTD' },
  { v: 'crtab_impots_s', label: 'Impôts — Interim', cat: 'CR Interim', desc: '87,89 : Actual / Budget / N-1 semestre + YTD' },
  // ─── CR Bloc Tables : Annual ───
  { v: 'crtab_produits_expl_a', label: "Produits expl. — Annual", cat: 'CR Annual', desc: '70-75 : Actual / Budget / N-1 exercice complet' },
  { v: 'crtab_charges_expl_a', label: "Charges expl. — Annual", cat: 'CR Annual', desc: '60-66 : Actual / Budget / N-1 exercice complet' },
  { v: 'crtab_produits_fin_a', label: 'Produits fin. — Annual', cat: 'CR Annual', desc: '77 : Actual / Budget / N-1 exercice complet' },
  { v: 'crtab_charges_fin_a', label: 'Charges fin. — Annual', cat: 'CR Annual', desc: '67 : Actual / Budget / N-1 exercice complet' },
  { v: 'crtab_impots_a', label: 'Impôts — Annual', cat: 'CR Annual', desc: '87,89 : Actual / Budget / N-1 exercice complet' },
];

// Synchronisé avec le catalogue Dashboards
const DASHBOARD_CATALOG: Array<{ id: string; name: string; cat: string; desc: string }> = [
  // ─── Dashboards Premium ★ ───
  { id: 'struct_actif', name: 'Structure de l\'Actif ★', cat: 'Premium', desc: 'Donut + table : immo / circulant / trésorerie' },
  { id: 'struct_passif', name: 'Structure du Passif ★', cat: 'Premium', desc: 'Donut + table : CP / dettes financières / circulantes' },
  { id: 'pyramide_perf', name: 'Pyramide des performances ★', cat: 'Premium', desc: 'ROE = Marge × Rotation × Levier (analyse Du Pont)' },
  { id: 'ratios_table', name: 'Table des Ratios financiers ★', cat: 'Premium', desc: 'Tous ratios + cibles + statut + benchmark' },
  { id: 'exec', name: 'Executive Summary ★', cat: 'Premium', desc: 'Vue exécutive : KPIs, radar, cascade SIG, alertes' },
  { id: 'compliance', name: 'Compliance SYSCOHADA ★', cat: 'Premium', desc: '10 contrôles automatiques de conformité' },
  { id: 'breakeven', name: 'Seuil de rentabilité ★', cat: 'Premium', desc: 'Point mort, marge de sécurité, coûts fixes/variables' },
  { id: 'pareto', name: 'Analyse ABC (Pareto) ★', cat: 'Premium', desc: 'Top 20% des comptes qui font 80% du CA / charges' },
  { id: 'cashforecast', name: 'Cashflow prévisionnel 13 sem ★', cat: 'Premium', desc: 'Projection 13 semaines + alertes' },
  { id: 'waterfall', name: 'Waterfall — Cascade SIG ★', cat: 'Premium', desc: 'Cascade visuelle CA → Résultat Net' },
  // ─── Standards ───
  { id: 'home', name: 'Synthèse de gestion', cat: 'Standard', desc: "KPIs, alertes, structure financière" },
  { id: 'cp', name: 'Charges & Produits', cat: 'Standard', desc: 'Répartition par nature, top 10' },
  { id: 'crblock', name: 'CR par bloc', cat: 'Standard', desc: '7 sections + résultats intermédiaires' },
  { id: 'client', name: 'Cycle Client', cat: 'Standard', desc: 'DSO, balance âgée, top débiteurs' },
  { id: 'fr', name: 'Cycle Fournisseur', cat: 'Standard', desc: 'DPO, échéancier, concentration' },
  { id: 'stk', name: 'Stocks', cat: 'Standard', desc: 'Valorisation, dépréciations, rotation' },
  { id: 'immo', name: 'Immobilisations', cat: 'Standard', desc: 'VNC, amortissements, vétusté' },
  { id: 'tre', name: 'Trésorerie', cat: 'Standard', desc: 'Position, flux, volatilité' },
  { id: 'bfr', name: 'BFR', cat: 'Standard', desc: 'FR, BFR, TN, équation' },
  { id: 'sal', name: 'Masse salariale', cat: 'Standard', desc: 'Charges, ratio, évolution' },
  { id: 'fis', name: 'Fiscalité', cat: 'Standard', desc: 'TVA, IS, pression fiscale' },
  { id: 'is_bvsa', name: 'Budget vs Actual (annuel)', cat: 'Reporting', desc: 'Réalisé vs Budget annuel par section' },
  { id: 'is_bvsa_monthly', name: 'Budget vs Actual (mensuel + N-1)', cat: 'Reporting', desc: 'Comparaison mensuelle Réalisé / Budget / N-1' },
  { id: 'cashflow', name: 'Cashflow Statement', cat: 'Reporting', desc: 'KPIs + Cash In/Out + Solde' },
  { id: 'receivables', name: 'Receivables & Payables Review', cat: 'Reporting', desc: 'Donuts + évolution mensuelle' },
  { id: 'crsec_produits_expl', name: "CR — Produits d'exploitation", cat: 'CR détaillé', desc: 'Comptes 70-75' },
  { id: 'crsec_charges_expl', name: "CR — Charges d'exploitation", cat: 'CR détaillé', desc: 'Comptes 60-66' },
  { id: 'crsec_produits_fin', name: 'CR — Produits financiers', cat: 'CR détaillé', desc: 'Comptes 77' },
  { id: 'crsec_charges_fin', name: 'CR — Charges financières', cat: 'CR détaillé', desc: 'Comptes 67' },
  { id: 'crsec_produits_hao', name: 'CR — Produits exceptionnels', cat: 'CR détaillé', desc: 'Comptes 82, 84, 86, 88' },
  { id: 'crsec_charges_hao', name: 'CR — Charges exceptionnelles', cat: 'CR détaillé', desc: 'Comptes 81, 83, 85' },
  { id: 'crsec_impots', name: 'CR — Impôts sur bénéfices', cat: 'CR détaillé', desc: 'Comptes 87, 89' },
  // CR Bloc Dashboards par période
  { id: 'crblock_monthly', name: 'CR Bloc — Monthly', cat: 'CR Monthly', desc: 'Toutes sections CR : Actual/Budget/N-1 mois + YTD' },
  { id: 'crblock_quarterly', name: 'CR Bloc — Quarterly', cat: 'CR Quarterly', desc: 'Toutes sections CR : trimestre + YTD' },
  { id: 'crblock_interim', name: 'CR Bloc — Interim', cat: 'CR Interim', desc: 'Toutes sections CR : semestre + YTD' },
  { id: 'crblock_annual', name: 'CR Bloc — Annual', cat: 'CR Annual', desc: 'Toutes sections CR : exercice complet vs Budget vs N-1' },
  { id: 'ind', name: 'Industrie', cat: 'Sectoriel', desc: 'Production, MP, marge industrielle' },
  { id: 'btp', name: 'BTP', cat: 'Sectoriel', desc: 'Travaux, sous-traitance, chantiers' },
  { id: 'com', name: 'Commerce', cat: 'Sectoriel', desc: 'Marge commerciale, taux de marque' },
  { id: 'mfi', name: 'Microfinance', cat: 'Sectoriel', desc: 'PNB, encours, PAR' },
  { id: 'imco', name: 'Immobilier commercial', cat: 'Sectoriel', desc: 'Loyers, taux occupation, rentabilité m²' },
  { id: 'hot', name: 'Hôtellerie & Restauration', cat: 'Sectoriel', desc: 'RevPAR, ADR, GOP, F&B ratio' },
  { id: 'agri', name: 'Agriculture', cat: 'Sectoriel', desc: 'Production, intrants, rendement' },
  { id: 'sante', name: 'Santé', cat: 'Sectoriel', desc: 'Actes, recettes, personnel soignant' },
  { id: 'transp', name: 'Transport & Logistique', cat: 'Sectoriel', desc: 'CA/km, flotte, carburant' },
  { id: 'serv', name: 'Services & Conseil', cat: 'Sectoriel', desc: 'Honoraires, taux facturable, marge projets' },
  { id: 'ana_centres', name: 'Centres de coûts / profit', cat: 'Analytique', desc: 'Charges & produits par centre' },
  { id: 'ana_projets', name: 'Suivi par projet', cat: 'Analytique', desc: 'Rentabilité, marge, avancement' },
  { id: 'ana_axes', name: 'Axes analytiques', cat: 'Analytique', desc: 'Analyse multi-axes' },
  // ─── États SYSCOHADA + Reporting avancé (Phase 4) ───
  { id: 'tft_monthly', name: 'TFT mensuel ★', cat: 'SYSCOHADA', desc: 'Tableau Flux Trésorerie 12 mois — exploitation/investissement/financement' },
  { id: 'cap_var', name: 'Variation capitaux propres ★', cat: 'SYSCOHADA', desc: 'État obligatoire — apports, distributions, affectation résultat' },
  { id: 'closing_pack', name: 'Closing Pack ★', cat: 'SYSCOHADA', desc: 'Synthèse 1 page A4 — KPIs, charts, alertes' },
  { id: 'tafire', name: 'TAFIRE ★', cat: 'SYSCOHADA', desc: 'Tableau Financier Ressources & Emplois (art. 29-37)' },
  { id: 'bilan_monthly', name: 'Bilan mensuel ★', cat: 'SYSCOHADA', desc: 'Évolution actif/passif sur 12 mois' },
  { id: 'caf', name: 'CAF mensuelle ★', cat: 'SYSCOHADA', desc: 'Capacité d\'autofinancement mensuelle' },
  { id: 'multi_year', name: 'Comparaison N / N-1 / N-2 ★', cat: 'SYSCOHADA', desc: 'Évolution pluriannuelle SIG, ratios et structure' },
  { id: 'bank_recon', name: 'Rapprochement bancaire', cat: 'Audit', desc: 'État de rapprochement GL ↔ relevé' },
  { id: 'closing_just', name: 'Justification de clôture', cat: 'Audit', desc: 'Provisions, CCA/PCA, FAE/FAP' },
  { id: 'audit_visu', name: 'Audit Trail visualizer ★', cat: 'Audit', desc: 'Vérification chaîne de hash SHA-256 du GL' },
  { id: 'anomalies', name: 'Carte des anomalies ★', cat: 'Audit', desc: 'Heatmap mois × catégories d\'anomalies' },
  { id: 'lettrage', name: 'Lettrage tiers', cat: 'Audit', desc: 'Taux de lettrage et vieillissement par tiers' },
  { id: 'zscore', name: 'Score de santé financière ★', cat: 'Premium', desc: 'Z-Score Altman + score Cockpit 0-100' },
  { id: 'forecast', name: 'Rolling Forecast 90j ★', cat: 'Premium', desc: 'Projection trésorerie 30/60/90 jours' },
  { id: 'wcd', name: 'Working Capital Days ★', cat: 'Premium', desc: 'DSO + DIO + DPO + Cash Conversion Cycle' },
  { id: 'seasonality', name: 'Saisonnalité', cat: 'Pilotage', desc: 'Index de saisonnalité du CA — base 100' },
  { id: 'whatif', name: 'What-If / Sensibilité', cat: 'Pilotage', desc: 'Simulation tarifaire — sliders CA/marge/charges' },
  { id: 'provisions', name: 'Provisions tracking', cat: 'Pilotage', desc: 'Suivi dotations / reprises (68x/78x)' },
  { id: 'intercos', name: 'Intercos / CCA', cat: 'Pilotage', desc: 'Comptes courants associés intra-groupe' },
  { id: 'weekly', name: 'Flash hebdo ★', cat: 'Direction', desc: 'Tableau bord hebdomadaire Direction' },
  { id: 'mda', name: 'MD&A auto-généré ★', cat: 'Direction', desc: 'Management Discussion & Analysis — narratif Proph3t' },
  { id: 'board_pack', name: 'Board Pack ★', cat: 'Direction', desc: 'Synthèse 4 slides Conseil d\'Administration' },
  { id: 'sector_bench', name: 'Comparatif sectoriel ★', cat: 'Direction', desc: 'Ratios vs normes UEMOA OHADA par secteur' },
];

// Helper pour KPIs calculés
const computeKPIs = (data: any) => {
  const sig = data?.sig;
  const bilan = data;
  if (!sig) return {
    ca: '—', rn: '—', ebe: '—', va: '—', mb: '—',
    treso: '—', bfr: '—', actif: '—', capPropres: '—', dso: '—',
  };
  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const treso = get(bilan?.bilanActif, '_BT') - get(bilan?.bilanPassif, 'DV');
  const stocks = get(bilan?.bilanActif, 'BB');
  const creances = get(bilan?.bilanActif, 'BH');
  const autresC = get(bilan?.bilanActif, 'BI');
  const passifCirc = get(bilan?.bilanPassif, '_DP');
  const bfr = stocks + creances + autresC - passifCirc;
  return {
    ca: fmtMoney(sig.ca ?? 0),
    rn: fmtMoney(sig.resultat ?? 0),
    ebe: fmtMoney(sig.ebe ?? 0),
    va: fmtMoney(sig.valeurAjoutee ?? 0),
    mb: fmtMoney(sig.margeBrute ?? 0),
    treso: fmtMoney(treso),
    bfr: fmtMoney(bfr),
    actif: fmtMoney(get(bilan?.bilanActif, '_BZ')),
    capPropres: fmtMoney(get(bilan?.bilanPassif, '_CP')),
    dso: data?.ratios?.find((r: any) => r.code === 'DSO')?.value ? `${Math.round(data.ratios.find((r: any) => r.code === 'DSO').value)} j` : '—',
    margePct: sig.ca ? `${((sig.resultat / sig.ca) * 100).toFixed(1)} %` : '—',
    ebePct: sig.ca ? `${((sig.ebe / sig.ca) * 100).toFixed(1)} %` : '—',
  } as Record<string, string>;
};

const QUICK_TEMPLATES: Record<string, (data?: any) => Block[]> = {
  weekly: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Synthèse hebdomadaire', inToc: true },
      { id: uid(), type: 'paragraph', text: "Flash de la semaine : indicateurs clés, position de trésorerie, alertes et suivi des créances." },
      { id: uid(), type: 'kpi', items: [
        { label: "Chiffre d'affaires", value: k.ca, subValue: 'Cumul YTD' },
        { label: 'Résultat net', value: k.rn, subValue: `Marge ${k.margePct}` },
        { label: 'Trésorerie nette', value: k.treso },
        { label: 'BFR', value: k.bfr },
      ]},
      { id: uid(), type: 'kpi', items: [
        { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` },
        { label: 'DSO', value: k.dso, subValue: 'Délai clients' },
        { label: 'Total Actif', value: k.actif },
        { label: 'Capitaux propres', value: k.capPropres },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. Ratios et alertes', inToc: true },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios financiers' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Position de trésorerie', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Cashflow Statement' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Suivi des créances et dettes', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'receivables', title: 'Receivables & Payables' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Stocks', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Stocks — valorisation et rotation' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Points d\'attention', inToc: true },
      { id: uid(), type: 'paragraph', text: "Synthèse des alertes et actions de la semaine. À compléter par le contrôle de gestion." },
    ];
  },

  monthly: (data) => {
    const k = computeKPIs(data);
    return [
      // ═══ I. SYNTHÈSE ═══
      { id: uid(), type: 'h1', text: '1. Synthèse exécutive', inToc: true },
      { id: uid(), type: 'paragraph', text: "Le présent rapport présente la performance financière de la société sur la période. Il analyse les principaux indicateurs de gestion, l'évolution de la trésorerie et les écarts par rapport au budget." },
      { id: uid(), type: 'kpi', items: [
        { label: "Chiffre d'affaires", value: k.ca, subValue: 'Cumul de la période' },
        { label: 'Résultat net', value: k.rn, subValue: `Marge ${k.margePct}` },
        { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` },
        { label: 'Trésorerie nette', value: k.treso },
      ]},
      { id: uid(), type: 'dashboard', dashboardId: 'exec', title: 'Vue exécutive — KPIs, radar, alertes' },
      { id: uid(), type: 'h2', text: '1.1 Faits marquants', inToc: true },
      { id: uid(), type: 'paragraph', text: "Éléments significatifs de la période : variations notables, événements exceptionnels, décisions structurantes. À compléter." },
      { id: uid(), type: 'pageBreak' },

      // ═══ II. PERFORMANCE — Compte de Résultat ═══
      { id: uid(), type: 'h1', text: '2. Compte de résultat', inToc: true },
      { id: uid(), type: 'paragraph', text: "Présentation du compte de résultat SYSCOHADA et des soldes intermédiaires de gestion." },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat — par nature' },
      { id: uid(), type: 'table', source: 'sig', title: 'SIG — formation du résultat' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Waterfall — Cascade SIG', inToc: true },
      { id: uid(), type: 'paragraph', text: "Cascade visuelle du chiffre d'affaires au résultat net via les soldes intermédiaires." },
      { id: uid(), type: 'dashboard', dashboardId: 'waterfall', title: 'Waterfall — du CA au RN' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Analyse du CR par bloc', inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition du compte de résultat par section. Format : Actual / Budget / N-1 (mois + YTD)." },
      { id: uid(), type: 'dashboard', dashboardId: 'crblock', title: 'CR — Analyse par bloc' },
      { id: uid(), type: 'pageBreak' },
      // Section 4.1-4.2 : Produits & Charges d'exploitation (les plus volumineuses)
      { id: uid(), type: 'h2', text: "4.1 Produits d'exploitation — Mensuel", inToc: true },
      { id: uid(), type: 'table', source: 'crtab_produits_expl_m', title: "Produits d'exploitation (70-75) — Month + YTD" },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h2', text: "4.2 Charges d'exploitation — Mensuel", inToc: true },
      { id: uid(), type: 'table', source: 'crtab_charges_expl_m', title: "Charges d'exploitation (60-66) — Month + YTD" },
      { id: uid(), type: 'pageBreak' },
      // Section 4.3-4.4 : Financières (généralement courtes, peuvent tenir ensemble)
      { id: uid(), type: 'h2', text: '4.3 Produits financiers — Mensuel', inToc: true },
      { id: uid(), type: 'table', source: 'crtab_produits_fin_m', title: 'Produits financiers (77) — Month + YTD' },
      { id: uid(), type: 'h2', text: '4.4 Charges financières — Mensuel', inToc: true },
      { id: uid(), type: 'table', source: 'crtab_charges_fin_m', title: 'Charges financières (67) — Month + YTD' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Seuil de rentabilité', inToc: true },
      { id: uid(), type: 'paragraph', text: "Point mort, marge de sécurité et structure des coûts fixes/variables." },
      { id: uid(), type: 'dashboard', dashboardId: 'breakeven', title: 'Seuil de rentabilité' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Pareto des comptes (ABC)', inToc: true },
      { id: uid(), type: 'paragraph', text: "Top 20 % des comptes qui pèsent 80 % du CA et des charges (loi de Pareto)." },
      { id: uid(), type: 'dashboard', dashboardId: 'pareto', title: 'Analyse ABC — Pareto' },
      { id: uid(), type: 'pageBreak' },

      // ═══ III. STRUCTURE — Bilan ═══
      { id: uid(), type: 'h1', text: '7. Position financière — Bilan', inToc: true },
      { id: uid(), type: 'paragraph', text: "Bilan SYSCOHADA — Actif et Passif aux normes OHADA révisé 2017. Tous les montants sont exprimés en franc CFA (XOF)." },
      { id: uid(), type: 'table', source: 'bilan_actif', title: 'Bilan — Actif' },
      { id: uid(), type: 'table', source: 'bilan_passif', title: 'Bilan — Passif' },
      { id: uid(), type: 'kpi', items: [
        { label: 'Total Actif', value: k.actif }, { label: 'Capitaux propres', value: k.capPropres },
        { label: 'BFR', value: k.bfr, subValue: "d'exploitation" }, { label: 'Trésorerie nette', value: k.treso },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: "7.1 Structure de l'Actif", inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition graphique du patrimoine de l'entreprise par grande masse." },
      { id: uid(), type: 'dashboard', dashboardId: 'struct_actif', title: "Structure de l'Actif" },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: "7.2 Structure du Passif", inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition des sources de financement : capitaux propres, dettes financières, dettes circulantes." },
      { id: uid(), type: 'dashboard', dashboardId: 'struct_passif', title: 'Structure du Passif' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: "8. Variation des capitaux propres", inToc: true },
      { id: uid(), type: 'paragraph', text: "État obligatoire SYSCOHADA présentant l'évolution des capitaux propres : ouverture, augmentations, distributions, résultat de l'exercice et clôture." },
      { id: uid(), type: 'table', source: 'capital', title: 'Variation des capitaux propres' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: "9. Tableau des Flux de Trésorerie (TFT)", inToc: true },
      { id: uid(), type: 'paragraph', text: "TFT SYSCOHADA — méthode indirecte. Présente les flux de trésorerie liés aux opérations d'exploitation, d'investissement et de financement." },
      { id: uid(), type: 'table', source: 'tft', title: 'TFT — Flux de trésorerie' },
      { id: uid(), type: 'pageBreak' },

      // ═══ IV. SUIVI BUDGÉTAIRE ═══
      { id: uid(), type: 'h1', text: '10. Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'paragraph', text: "Analyse des écarts entre le réalisé de la période et le budget validé." },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa', title: 'Income Statement — Budget vs Actual' },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa_monthly', title: 'Budget vs Réalisé — Mensuel + N-1' },
      { id: uid(), type: 'table', source: 'budget_actual', title: 'Détail Budget vs Réalisé par compte' },
      { id: uid(), type: 'pageBreak' },

      // ═══ V. CYCLES D'EXPLOITATION ═══
      { id: uid(), type: 'h1', text: '11. BFR et fonds de roulement', inToc: true },
      { id: uid(), type: 'paragraph', text: "Équation FR / BFR / TN, décomposition par poste, cycle d'exploitation." },
      { id: uid(), type: 'dashboard', dashboardId: 'bfr', title: 'BFR — Fonds de roulement' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '12. Cycle clients', inToc: true },
      { id: uid(), type: 'paragraph', text: "Suivi des créances clients : DSO, balance âgée RÉELLE basée sur les dates des écritures, concentration, top débiteurs." },
      { id: uid(), type: 'dashboard', dashboardId: 'client', title: 'Cycle Client' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '13. Cycle fournisseurs', inToc: true },
      { id: uid(), type: 'paragraph', text: "Suivi des dettes fournisseurs : DPO calculé sur achats classes 60-63, échéancier réel, concentration, dépendance." },
      { id: uid(), type: 'dashboard', dashboardId: 'fr', title: 'Cycle Fournisseur' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '14. Stocks', inToc: true },
      { id: uid(), type: 'paragraph', text: "Valorisation par nature, dépréciations, rotation des stocks." },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Stocks — valorisation et rotation' },
      { id: uid(), type: 'pageBreak' },

      // ═══ VI. TRÉSORERIE ═══
      { id: uid(), type: 'h1', text: '15. Trésorerie — Évolution mensuelle', inToc: true },
      { id: uid(), type: 'paragraph', text: "Cash In (encaissements classes 70-77) vs Cash Out (décaissements classes 60-67) — données issues du GL réel." },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Cashflow Statement' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '16. Cashflow prévisionnel', inToc: true },
      { id: uid(), type: 'paragraph', text: "Projection de trésorerie sur 13 semaines avec alertes seuils critiques." },
      { id: uid(), type: 'dashboard', dashboardId: 'cashforecast', title: 'Cashflow prévisionnel 13 semaines' },
      { id: uid(), type: 'pageBreak' },

      // ═══ VII. RESSOURCES HUMAINES ═══
      { id: uid(), type: 'h1', text: '17. Masse salariale', inToc: true },
      { id: uid(), type: 'paragraph', text: "Évolution de la masse salariale, des charges sociales et du ratio masse / CA." },
      { id: uid(), type: 'dashboard', dashboardId: 'sal', title: 'Masse salariale' },
      { id: uid(), type: 'pageBreak' },

      // ═══ VIII. COMPTABILITÉ ANALYTIQUE (conditionnel) ═══
      { id: uid(), type: 'h1', text: '18. Comptabilité analytique', inToc: true },
      { id: uid(), type: 'paragraph', text: "Répartition des charges et produits par centre de coût / section analytique." },
      { id: uid(), type: 'dashboard', dashboardId: 'analytical', title: 'P&L par section analytique' },
      { id: uid(), type: 'pageBreak' },

      // ═══ IX. CONFORMITÉ ET RATIOS ═══
      { id: uid(), type: 'h1', text: '19. Pyramide des performances (Du Pont)', inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition multiplicative de la performance : ROE = Marge nette × Rotation actif × Levier financier. Permet d'identifier les leviers d'amélioration de la rentabilité." },
      { id: uid(), type: 'dashboard', dashboardId: 'pyramide_perf', title: 'Pyramide Du Pont' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '20. Ratios financiers', inToc: true },
      { id: uid(), type: 'paragraph', text: "Ratios de structure, liquidité, rentabilité et performance — comparés aux normes sectorielles SYSCOHADA." },
      { id: uid(), type: 'dashboard', dashboardId: 'ratios_table', title: 'Tableau complet des ratios' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '21. Compliance SYSCOHADA', inToc: true },
      { id: uid(), type: 'paragraph', text: "10 contrôles automatiques de conformité comptable SYSCOHADA révisé 2017." },
      { id: uid(), type: 'dashboard', dashboardId: 'compliance', title: 'Compliance SYSCOHADA' },
      { id: uid(), type: 'pageBreak' },

      // ═══ X. NOTES ANNEXES SYSCOHADA — 18 notes obligatoires AUDCIF Art. 33-39 ═══
      { id: uid(), type: 'h1', text: '22. Notes annexes', inToc: true },
      { id: uid(), type: 'paragraph', text: "Notes complémentaires aux états financiers, conformément aux articles 33 à 39 du règlement SYSCOHADA révisé 2017 (AUDCIF). Les 18 notes ci-dessous couvrent l'ensemble des informations obligatoires." },

      { id: uid(), type: 'h2', text: "22.1 Référentiel et méthodes comptables (Note 1)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Les états financiers sont établis conformément au Système Comptable OHADA révisé 2017. Méthodes appliquées : amortissement linéaire des immobilisations selon leur durée d'utilité économique, valorisation des stocks au CMP (Coût Moyen Pondéré), conversion des opérations en devises au cours du jour, comptabilisation des produits à l'avancement pour les contrats long terme. Continuité d'exploitation présumée." },

      { id: uid(), type: 'h2', text: "22.2 Tableau des immobilisations (Note 3)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Tableau de variation des valeurs brutes des immobilisations : ouverture, acquisitions de l'exercice, cessions, virements de poste à poste, valeur brute clôture. Détail par catégorie : incorporelles, terrains, bâtiments, matériel & outillage, mobilier, matériel de transport, immobilisations financières." },
      { id: uid(), type: 'dashboard', dashboardId: 'immo', title: 'Synthèse immobilisations' },

      { id: uid(), type: 'h2', text: "22.3 Tableau des amortissements (Note 3-bis)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Tableau des amortissements cumulés : ouverture, dotations de l'exercice (compte 681), reprises sur cessions, clôture. Calcul de la valeur nette comptable (VNC) = Valeur brute − Amortissements − Provisions." },

      { id: uid(), type: 'h2', text: "22.4 Tableau des provisions (Note 4)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Tableau de variation des provisions pour risques et charges (compte 19), provisions sur stocks (39), provisions sur tiers (49) et provisions sur trésorerie (59). Pour chaque catégorie : ouverture, dotations de l'exercice, reprises (utilisées et non utilisées), clôture. Justification des provisions significatives." },

      { id: uid(), type: 'h2', text: "22.5 État des stocks (Note 5)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition des stocks par catégorie : marchandises (31), matières premières (32), produits en cours (33-34), produits finis (35), emballages (38). Méthode de valorisation appliquée. Provisions pour dépréciation et leurs justifications." },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Synthèse stocks' },

      { id: uid(), type: 'h2', text: "22.6 État des créances et dettes par échéance (Note 6)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Ventilation des créances clients (411-418) et dettes fournisseurs (40) par échéance : à moins d'1 an, de 1 à 5 ans, à plus de 5 ans. Idem pour les emprunts (16-17), les dettes fiscales et sociales. Identification des échéances refinancées." },
      { id: uid(), type: 'dashboard', dashboardId: 'client', title: 'Cycle clients' },
      { id: uid(), type: 'dashboard', dashboardId: 'fr', title: 'Cycle fournisseurs' },

      { id: uid(), type: 'h2', text: "22.7 Détail du capital social (Note 7)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Composition du capital : nombre d'actions/parts émises, valeur nominale, catégories d'actions (ordinaires, privilégiées), droits de vote attachés. Mouvements de l'exercice (augmentation, réduction). Capital souscrit non appelé (compte 109)." },

      { id: uid(), type: 'h2', text: "22.8 Variation des capitaux propres (Note 8)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Tableau de variation des capitaux propres détaillé : capital, primes, réserves, report à nouveau, résultat. Affectation du résultat N-1, distributions de dividendes, augmentations de capital." },
      { id: uid(), type: 'table', source: 'capital', title: 'Variation capitaux propres' },

      { id: uid(), type: 'h2', text: "22.9 Dettes financières et garanties (Note 9)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Détail des emprunts (compte 16) et dettes financières assimilées (17, 18) : prêteur, montant initial, taux d'intérêt, échéance finale, garanties accordées (hypothèques, nantissements, cautions), covenants éventuels." },

      { id: uid(), type: 'h2', text: "22.10 Charges et produits constatés d'avance (Note 10)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition des charges constatées d'avance (compte 476) et produits constatés d'avance (compte 477). Charges à payer (408, 428, 438, 448) et produits à recevoir (418, 438)." },

      { id: uid(), type: 'h2', text: "22.11 Écarts de conversion (Note 11)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Écarts de conversion actif (476) et passif (477) sur les comptes en devises à la clôture. Méthode de conversion appliquée et impact sur le résultat de change." },

      { id: uid(), type: 'h2', text: "22.12 Impôts différés (Note 12)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Calcul de la charge d'impôt sur le résultat : résultat fiscal, réintégrations et déductions, base imposable, IS exigible, IMF (Impôt Minimum Forfaitaire). Différences temporaires donnant lieu à impôts différés actifs/passifs (le cas échéant)." },
      { id: uid(), type: 'dashboard', dashboardId: 'fis', title: 'Fiscalité' },

      { id: uid(), type: 'h2', text: "22.13 Effectifs et masse salariale (Note 13)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Effectif moyen de l'exercice par catégorie (cadres, agents de maîtrise, employés, ouvriers). Masse salariale brute, charges sociales patronales, taxes assises sur les salaires. Évolution vs N-1." },
      { id: uid(), type: 'dashboard', dashboardId: 'sal', title: 'Masse salariale' },

      { id: uid(), type: 'h2', text: "22.14 Rémunération des organes de direction (Note 14)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Conformément à l'article 39 AUDCIF : rémunérations brutes versées aux dirigeants (mandataires sociaux), avantages en nature, jetons de présence, indemnités de fin de fonction. Engagements de retraite des dirigeants." },

      { id: uid(), type: 'h2', text: "22.15 Honoraires des commissaires aux comptes (Note 15)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Honoraires versés au(x) commissaire(s) aux comptes : (a) certification des comptes annuels, (b) services autres que la certification (SACC). Détail par cabinet et par mission." },

      { id: uid(), type: 'h2', text: "22.16 Engagements hors bilan (Note 16)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Cautions et garanties données ou reçues, lettres de confort, contrats de location simple non capitalisés, contrats de location-financement (crédit-bail) non inscrits au bilan, options d'achat ou de vente, engagements de retraite et indemnités de fin de carrière non provisionnés." },

      { id: uid(), type: 'h2', text: "22.17 Événements postérieurs à la clôture (Note 17)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Événements significatifs survenus entre la date de clôture de l'exercice et la date d'établissement du présent rapport, qu'ils confirment ou non des situations existant à la clôture." },

      { id: uid(), type: 'h2', text: "22.18 Parties liées (Note 18)", inToc: true },
      { id: uid(), type: 'paragraph', text: "Transactions et soldes avec les parties liées (filiales, sociétés mères, dirigeants, actionnaires de référence) conformément à l'article 39 AUDCIF et IAS 24 : nature de la relation, montants des transactions, soldes en cours, conditions des opérations (de pleine concurrence ou non)." },

      { id: uid(), type: 'pageBreak' },

      // ═══ XI. RECOMMANDATIONS ═══
      { id: uid(), type: 'h1', text: '23. Recommandations et plan d\'action', inToc: true },
      { id: uid(), type: 'paragraph', text: "Synthèse des points d'attention identifiés et des actions correctives recommandées." },
      { id: uid(), type: 'h2', text: "23.1 Points d'attention", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : ratios hors seuil, écarts significatifs, alertes opérationnelles." },
      { id: uid(), type: 'h2', text: "23.2 Plan d'action", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : actions, responsables, échéances, KPIs de suivi." },
      { id: uid(), type: 'pageBreak' },

      // ═══ XII. SIGNATURES ═══
      { id: uid(), type: 'h1', text: '24. Validation et signatures', inToc: true },
      { id: uid(), type: 'paragraph', text: "Le présent rapport a été établi sous la responsabilité des signataires ci-dessous, conformément aux normes SYSCOHADA en vigueur." },
      { id: uid(), type: 'kpi', items: [
        { label: 'Préparé par', value: '________________', subValue: 'Direction Financière' },
        { label: 'Vérifié par', value: '________________', subValue: 'Contrôle de gestion' },
        { label: 'Approuvé par', value: '________________', subValue: 'Direction Générale' },
        { label: 'Date / Signature', value: '________________', subValue: '' },
      ]},
    ];
  },

  quarterly: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Synthèse trimestrielle', inToc: true },
      { id: uid(), type: 'paragraph', text: "Rapport de gestion trimestriel présenté au comité de direction. Analyse de la performance, de la structure financière, des cycles d'exploitation et des perspectives." },
      { id: uid(), type: 'kpi', items: [
        { label: 'CA', value: k.ca, subValue: 'Cumul YTD' }, { label: 'Marge nette', value: k.margePct },
        { label: 'RN', value: k.rn }, { label: 'TN', value: k.treso },
      ]},
      { id: uid(), type: 'kpi', items: [
        { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` }, { label: 'BFR', value: k.bfr },
        { label: 'Total Actif', value: k.actif }, { label: 'DSO', value: k.dso },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. Bilan', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif', title: 'Bilan — Actif' },
      { id: uid(), type: 'table', source: 'bilan_passif', title: 'Bilan — Passif' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Compte de résultat', inToc: true },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat' },
      { id: uid(), type: 'table', source: 'sig', title: 'SIG' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Analyse du CR par section — Quarterly', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'crblock_quarterly', title: 'CR Bloc — Quarterly' },
      { id: uid(), type: 'table', source: 'crtab_produits_expl_q', title: "Produits d'exploitation — Quarterly" },
      { id: uid(), type: 'table', source: 'crtab_charges_expl_q', title: "Charges d'exploitation — Quarterly" },
      { id: uid(), type: 'table', source: 'crtab_produits_fin_q', title: 'Produits financiers — Quarterly' },
      { id: uid(), type: 'table', source: 'crtab_charges_fin_q', title: 'Charges financières — Quarterly' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa', title: 'Budget vs Actual' },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa_monthly', title: 'Budget vs Réalisé — Mensuel + N-1' },
      { id: uid(), type: 'table', source: 'budget_actual', title: 'Détail par compte' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Tableau des flux de trésorerie', inToc: true },
      { id: uid(), type: 'table', source: 'tft', title: 'TFT — méthode indirecte SYSCOHADA' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '7. Trésorerie', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Position et flux de trésorerie' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '8. Cycle clients', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'client', title: 'Créances, recouvrement, concentration' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '9. Cycle fournisseurs', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'fr', title: 'Dettes, échéances, concentration' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '10. BFR', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'bfr', title: 'Fonds de roulement, BFR, trésorerie' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '11. Masse salariale', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'sal', title: 'Charges de personnel' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '12. Comptabilité analytique', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'analytical', title: 'P&L par centre de coût' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '13. Fiscalité', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'fis', title: 'TVA, IS, pression fiscale' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '13. Stocks', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Valorisation, dépréciations, rotation' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '14. Immobilisations', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'immo', title: 'VNC, amortissements, vétusté' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '15. Variation des capitaux propres', inToc: true },
      { id: uid(), type: 'table', source: 'capital', title: 'Variation des capitaux propres' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '16. Ratios financiers', inToc: true },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios financiers' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '17. Balance générale', inToc: true },
      { id: uid(), type: 'table', source: 'balance', title: 'Balance générale' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '18. Recommandations et plan d\'action', inToc: true },
      { id: uid(), type: 'paragraph', text: "Synthèse des points d'attention, actions correctives, responsables et échéances. À compléter par la Direction Financière." },
    ];
  },

  annual: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Message de la Direction', inToc: true },
      { id: uid(), type: 'paragraph', text: "Présentation de l'exercice écoulé, des principales réalisations, des défis rencontrés et des perspectives pour le prochain exercice. À compléter par la Direction Générale." },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. Indicateurs clés de l\'exercice', inToc: true },
      { id: uid(), type: 'kpi', items: [
        { label: 'CA', value: k.ca, subValue: 'Exercice complet' }, { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` },
        { label: 'RN', value: k.rn, subValue: `Marge ${k.margePct}` }, { label: 'Capitaux propres', value: k.capPropres },
      ]},
      { id: uid(), type: 'kpi', items: [
        { label: 'Total Actif', value: k.actif }, { label: 'BFR', value: k.bfr },
        { label: 'Trésorerie', value: k.treso }, { label: 'DSO', value: k.dso, subValue: 'Délai clients' },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Bilan', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif', title: 'Bilan — Actif' },
      { id: uid(), type: 'table', source: 'bilan_passif', title: 'Bilan — Passif' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Compte de résultat', inToc: true },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat par nature' },
      { id: uid(), type: 'table', source: 'sig', title: 'Soldes intermédiaires de gestion' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Analyse du CR par section — Annual', inToc: true },
      { id: uid(), type: 'paragraph', text: "Décomposition détaillée du CR : Actual / Budget / N-1 sur l'exercice complet." },
      { id: uid(), type: 'dashboard', dashboardId: 'crblock_annual', title: 'CR Bloc — Annual' },
      { id: uid(), type: 'table', source: 'crtab_produits_expl_a', title: "Produits d'exploitation — Annual" },
      { id: uid(), type: 'table', source: 'crtab_charges_expl_a', title: "Charges d'exploitation — Annual" },
      { id: uid(), type: 'table', source: 'crtab_produits_fin_a', title: 'Produits financiers — Annual' },
      { id: uid(), type: 'table', source: 'crtab_charges_fin_a', title: 'Charges financières — Annual' },
      { id: uid(), type: 'table', source: 'crtab_impots_a', title: 'Impôts — Annual' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa', title: 'Budget vs Actual' },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa_monthly', title: 'Budget vs Réalisé — Mensuel + N-1' },
      { id: uid(), type: 'table', source: 'budget_actual', title: 'Détail par compte' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '7. Tableau des flux de trésorerie', inToc: true },
      { id: uid(), type: 'table', source: 'tft', title: 'TFT — méthode indirecte SYSCOHADA' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '8. Variation des capitaux propres', inToc: true },
      { id: uid(), type: 'table', source: 'capital', title: 'Tableau de variation des capitaux propres' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '9. Trésorerie', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Position et flux de trésorerie' },
      { id: uid(), type: 'dashboard', dashboardId: 'tre', title: 'Trésorerie — position et volatilité' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '10. BFR et cycle d\'exploitation', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'bfr', title: 'FR, BFR, Trésorerie nette' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '11. Cycle clients', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'client', title: 'Créances, recouvrement, balance âgée' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '12. Cycle fournisseurs', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'fr', title: 'Dettes fournisseurs, échéances' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '13. Masse salariale et charges sociales', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'sal', title: 'Charges de personnel' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '14. Comptabilité analytique', inToc: true },
      { id: uid(), type: 'paragraph', text: "Ventilation des charges et produits par centre de coût, projet ou département." },
      { id: uid(), type: 'dashboard', dashboardId: 'analytical', title: 'P&L par section analytique' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '15. Immobilisations', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'immo', title: 'VNC, amortissements, taux de vétusté' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '15. Fiscalité', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'fis', title: 'TVA, IS, pression fiscale' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '16. Stocks', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Valorisation, dépréciations, rotation' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '17. Ratios financiers', inToc: true },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios financiers' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '18. Balance générale', inToc: true },
      { id: uid(), type: 'table', source: 'balance', title: 'Balance générale' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '19. Conclusions et recommandations', inToc: true },
      { id: uid(), type: 'paragraph', text: "Synthèse de l'exercice, points d'attention, risques identifiés et plan d'action pour le prochain exercice." },
      { id: uid(), type: 'h2', text: "Principaux risques", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : risques identifiés (liquidité, concentration tiers, fiscalité, opérationnel)." },
      { id: uid(), type: 'h2', text: "Plan d'action", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : actions correctives, responsables, échéances, indicateurs de suivi." },
      { id: uid(), type: 'h2', text: "Perspectives", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : objectifs du prochain exercice, investissements prévus, évolution du CA et de la rentabilité." },
    ];
  },

  interim: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Synthèse de la période', inToc: true },
      { id: uid(), type: 'paragraph', text: "Rapport intérimaire de la société sur la période de reporting sélectionnée. Analyse de la performance, de la position financière et des perspectives." },
      { id: uid(), type: 'kpi', items: [
        { label: 'CA période', value: k.ca, subValue: 'Cumul période' }, { label: 'RN', value: k.rn, subValue: `Marge ${k.margePct}` },
        { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` }, { label: 'Trésorerie', value: k.treso },
      ]},
      { id: uid(), type: 'kpi', items: [
        { label: 'Total Actif', value: k.actif }, { label: 'Capitaux propres', value: k.capPropres },
        { label: 'BFR', value: k.bfr }, { label: 'DSO', value: k.dso },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. Bilan intérimaire', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif', title: 'Bilan — Actif (arrêté de période)' },
      { id: uid(), type: 'table', source: 'bilan_passif', title: 'Bilan — Passif (arrêté de période)' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Compte de résultat de la période', inToc: true },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat — par nature' },
      { id: uid(), type: 'table', source: 'sig', title: 'Soldes intermédiaires de gestion' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Analyse du CR par section — Interim', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'crblock_interim', title: 'CR Bloc — Interim' },
      { id: uid(), type: 'table', source: 'crtab_produits_expl_s', title: "Produits d'exploitation — Interim" },
      { id: uid(), type: 'table', source: 'crtab_charges_expl_s', title: "Charges d'exploitation — Interim" },
      { id: uid(), type: 'table', source: 'crtab_produits_fin_s', title: 'Produits financiers — Interim' },
      { id: uid(), type: 'table', source: 'crtab_charges_fin_s', title: 'Charges financières — Interim' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Tableau des flux de trésorerie', inToc: true },
      { id: uid(), type: 'table', source: 'tft', title: 'TFT — période' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa', title: 'Budget vs Actual' },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa_monthly', title: 'Budget vs Réalisé — Mensuel + N-1' },
      { id: uid(), type: 'table', source: 'budget_actual', title: 'Détail par compte' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '7. Trésorerie et flux', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Cashflow' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '8. Cycle clients', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'client', title: 'Créances et recouvrement' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '9. Cycle fournisseurs', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'fr', title: 'Dettes fournisseurs' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '10. BFR et fonds de roulement', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'bfr', title: 'FR, BFR, TN' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '11. Stocks', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'stk', title: 'Stocks — valorisation et rotation' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '12. Ratios financiers', inToc: true },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios financiers — période' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '13. Prévisions et perspectives', inToc: true },
      { id: uid(), type: 'paragraph', text: "Projections basées sur les tendances observées sur la période. À compléter avec les hypothèses de la Direction." },
      { id: uid(), type: 'h2', text: 'Objectifs période suivante', inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : CA prévisionnel, charges cibles, investissements planifiés, recrutements." },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '14. Recommandations', inToc: true },
      { id: uid(), type: 'paragraph', text: "Points d'attention et actions correctives pour la période suivante." },
    ];
  },
};

function uid() { return Math.random().toString(36).substring(2, 11); }

// Filtre les blocs conditionnels selon les données disponibles.
// Supprime des SECTIONS COMPLÈTES (h1 + paragraphes + dashboard + pageBreak final)
// quand les données ne sont pas disponibles dans le GL.
function filterConditionalBlocks(blocks: Block[], data: any): Block[] {
  const noStocks = !data?.hasStocks;
  const noAnalytical = !data?.hasAnalytical;
  if (!noStocks && !noAnalytical) return blocks;

  // Mots-clés des sections à supprimer si la condition est remplie
  const sectionsToRemove: { keyword: RegExp; condition: boolean }[] = [];
  if (noStocks) sectionsToRemove.push({ keyword: /\bstocks?\b/i, condition: true });
  if (noAnalytical) sectionsToRemove.push({ keyword: /analytiq/i, condition: true });

  const result: Block[] = [];
  let skipUntilNextPageBreak = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    // Si on est en train de skip, on continue jusqu'au pageBreak (inclus)
    if (skipUntilNextPageBreak) {
      if (b.type === 'pageBreak') skipUntilNextPageBreak = false;
      continue;
    }

    // Détection d'un h1 qui correspond à une section conditionnelle
    if (b.type === 'h1') {
      const text = ((b as any).text || '') as string;
      const matchSection = sectionsToRemove.find((s) => s.keyword.test(text));
      if (matchSection) {
        // Skip ce h1 + tout jusqu'au prochain pageBreak
        // Aussi : si le bloc précédent dans result est un pageBreak, on le retire
        if (result.length > 0 && result[result.length - 1].type === 'pageBreak') {
          result.pop();
        }
        skipUntilNextPageBreak = true;
        continue;
      }
    }

    result.push(b);
  }
  return result;
}

export default function Reports() {
  const { bilan, cr, sig, balance } = useStatements();
  const ratios = useRatios();
  const tft = useTFT();
  const capital = useCapitalVariation();
  const budgetActual = useBudgetActual();
  const monthlyCR = useMonthlyCR();
  const monthlyBilan = useMonthlyBilan();
  const org = useCurrentOrg();
  const { currentYear, currentOrgId } = useApp();

  const [config, setConfig] = useState<ReportConfig>(() => ({ ...DEFAULT_CONFIG(`Exercice ${currentYear}`), blocks: QUICK_TEMPLATES.monthly() }));
  // Track le modèle rapide actuellement applique pour highlight visuel + toast
  const [activeTemplate, setActiveTemplate] = useState<string>('monthly');
  const [openSend, setOpenSend] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [openLoad, setOpenLoad] = useState(false);
  const [openJournal, setOpenJournal] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<number | null>(null);
  const [openCatalog, setOpenCatalog] = useState<'tables' | 'dashboards' | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [tocLabel, setTocLabel] = useState('');
  const [journal, setJournal] = useState<Array<{ date: number; title: string; format: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('report-journal') ?? '[]'); } catch { return []; }
  });

  // Journal des rapports persistés (vrais ReportDoc en DB)
  const savedReports: ReportDoc[] = useLiveQuery(
    () => (currentOrgId ? db.reports.where('orgId').equals(currentOrgId).reverse().sortBy('updatedAt') : Promise.resolve([] as ReportDoc[])),
    [currentOrgId], [] as ReportDoc[],
  ) ?? [];

  // Sauvegarder le rapport courant comme document persistant
  const saveReport = async (newSave = false) => {
    if (!currentOrgId) return;
    const now = Date.now();
    const payload = {
      orgId: currentOrgId,
      title: config.identity.title || `Rapport ${new Date(now).toLocaleDateString('fr-FR')}`,
      type: 'report',
      author: config.identity.author || 'Utilisateur local',
      status: 'draft' as const,
      content: JSON.stringify(config),
      updatedAt: now,
    };
    if (currentReportId && !newSave) {
      await db.reports.update(currentReportId, payload);
      toast.success('Rapport mis à jour', config.identity.title);
    } else {
      const id = await db.reports.add({ ...payload, createdAt: now });
      setCurrentReportId(id as number);
      toast.success('Rapport enregistré', config.identity.title);
    }
  };

  const loadReport = (rep: any) => {
    try {
      const cfg = JSON.parse(rep.content);
      setConfig(cfg);
      setCurrentReportId(rep.id);
      setOpenJournal(false);
    } catch (e: any) {
      toast.error('Chargement impossible', e.message);
    }
  };

  const deleteReport = async (id: number) => {
    if (!confirm('Supprimer ce rapport définitivement ?')) return;
    await db.reports.delete(id);
    if (currentReportId === id) setCurrentReportId(null);
  };
  // Pliage des sidebars (état persisté)
  // Migration Twisty : force les sidebars editeur+recap collapsed par defaut
  // pour donner le maximum d'espace a la preview A4 sur ecrans moyens.
  // Au premier passage on fixe la valeur, ensuite l'user peut toggle librement.
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    if (!localStorage.getItem('reports-twisty-init')) {
      localStorage.setItem('reports-left-collapsed', 'true');
      localStorage.setItem('reports-right-collapsed', 'true');
      localStorage.setItem('reports-twisty-init', '1');
      return true;
    }
    return localStorage.getItem('reports-left-collapsed') === 'true';
  });
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('reports-right-collapsed') === 'true');
  const toggleLeft = () => { const n = !leftCollapsed; setLeftCollapsed(n); localStorage.setItem('reports-left-collapsed', String(n)); };
  const toggleRight = () => { const n = !rightCollapsed; setRightCollapsed(n); localStorage.setItem('reports-right-collapsed', String(n)); };

  const templates = useLiveQuery(() => db.templates.where('orgId').equals(currentOrgId).toArray(), [currentOrgId]) ?? [];

  // Update period when year changes
  useEffect(() => { setConfig((c) => ({ ...c, identity: { ...c.identity, period: `Exercice ${currentYear}` } })); }, [currentYear]);
  const initialized = useRef(false);

  const setIdentity = (k: keyof ReportConfig['identity'], v: any) => setConfig((c) => ({ ...c, identity: { ...c.identity, [k]: v } }));
  const setOption = (k: keyof ReportConfig['options'], v: boolean) => setConfig((c) => ({ ...c, options: { ...c.options, [k]: v } }));
  const setFormat = (f: ReportConfig['format']) => setConfig((c) => ({ ...c, format: f }));
  const setPalette = (p: PaletteKey) => setConfig((c) => ({ ...c, palette: p }));

  const addBlock = (b: Block) => setConfig((c) => ({ ...c, blocks: [...c.blocks, b] }));
  const insertBlockAt = (index: number, b: Block) => setConfig((c) => {
    const arr = [...c.blocks];
    arr.splice(index, 0, b);
    return { ...c, blocks: arr };
  });
  const updateBlock = (id: string, patch: Partial<Block>) => setConfig((c) => ({ ...c, blocks: c.blocks.map((b) => b.id === id ? { ...b, ...patch } as Block : b) }));
  const removeBlock = (id: string) => setConfig((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
  const moveBlock = (id: string, dir: -1 | 1) => setConfig((c) => {
    const i = c.blocks.findIndex((b) => b.id === id); if (i < 0) return c;
    const ni = Math.max(0, Math.min(c.blocks.length - 1, i + dir));
    if (ni === i) return c;
    const arr = [...c.blocks]; [arr[i], arr[ni]] = [arr[ni], arr[i]];
    return { ...c, blocks: arr };
  });
  const moveBlockToIndex = (srcId: string, targetIndex: number) => {
    setConfig((c) => {
      const blocks = [...c.blocks];
      const srcIdx = blocks.findIndex((b) => b.id === srcId);
      if (srcIdx < 0) return c;
      const [moved] = blocks.splice(srcIdx, 1);
      const adjustedIdx = targetIndex > srcIdx ? targetIndex - 1 : targetIndex;
      blocks.splice(Math.max(0, Math.min(blocks.length, adjustedIdx)), 0, moved);
      return { ...c, blocks };
    });
  };

  const reorderBlock = (srcId: string, targetId: string, insertAfter: boolean) => {
    setConfig((c) => {
      const blocks = [...c.blocks];
      const srcIdx = blocks.findIndex((b) => b.id === srcId);
      if (srcIdx < 0) return c;
      const [moved] = blocks.splice(srcIdx, 1);
      let targetIdx = blocks.findIndex((b) => b.id === targetId);
      if (targetIdx < 0) return c;
      if (insertAfter) targetIdx++;
      blocks.splice(targetIdx, 0, moved);
      return { ...c, blocks };
    });
  };

  const applyTemplate = (k: keyof typeof QUICK_TEMPLATES) => {
    setConfig((c) => ({ ...c, blocks: filterConditionalBlocks(QUICK_TEMPLATES[k](data), data) }));
    setActiveTemplate(k as string);
    const labels: Record<string, string> = {
      weekly: 'Flash hebdomadaire', monthly: 'Rapport mensuel',
      quarterly: 'Comité trimestriel', annual: 'Rapport annuel', interim: 'Rapport intérimaire',
    };
    toast.success(`Modèle appliqué : ${labels[k as string] ?? k}`, 'Le rapport a été régénéré avec ce template.');
  };

  const palette = PALETTES[config.palette];

  // Détection données conditionnelles (analytique + stocks)
  const hasAnalytical = useLiveQuery(async () => {
    const sample = await db.gl.where('orgId').equals(currentOrgId).limit(500).toArray();
    return sample.some((e) => !!e.analyticalSection || !!e.analyticalAxis);
  }, [currentOrgId], false);
  const hasStocks = balance.some((r) => r.account.startsWith('3') && Math.abs(r.solde) > 1);

  // Recalcul des données selon l'intervalle de période du rapport
  const periodFromMonth = config.identity.periodFrom ? new Date(config.identity.periodFrom).getMonth() + 1 : undefined;
  const periodToMonth = config.identity.periodTo ? new Date(config.identity.periodTo).getMonth() + 1 : undefined;
  const hasPeriodFilter = periodFromMonth !== undefined && periodToMonth !== undefined;

  const periodBalance = useLiveQuery(async () => {
    if (!currentOrgId || !hasPeriodFilter) return null;
    const { computeBalance: cb } = await import('../engine/balance');
    return cb({ orgId: currentOrgId, year: currentYear, fromMonth: periodFromMonth, uptoMonth: periodToMonth, includeOpening: true });
  }, [currentOrgId, currentYear, periodFromMonth, periodToMonth, hasPeriodFilter], null);

  // Mouvements seuls (sans à-nouveaux) — utilisés pour calculer le résultat
  // de l'exercice et éviter le double-comptage si les AN incluent par erreur
  // des soldes sur les classes 6/7/8 (cas d'import balance N-1 incomplet).
  const periodMovements = useLiveQuery(async () => {
    if (!currentOrgId || !hasPeriodFilter) return null;
    const { computeBalance: cb } = await import('../engine/balance');
    return cb({ orgId: currentOrgId, year: currentYear, fromMonth: periodFromMonth, uptoMonth: periodToMonth, includeOpening: false });
  }, [currentOrgId, currentYear, periodFromMonth, periodToMonth, hasPeriodFilter], null);

  const periodStatements = useMemo(() => {
    if (!hasPeriodFilter || !periodBalance) return null;
    const b = computeBilan(periodBalance, periodMovements ?? undefined);
    const s = computeSIG(periodBalance);
    return { bilan: b, sig: s.sig, cr: s.cr };
  }, [periodBalance, periodMovements, hasPeriodFilter]);

  const effectiveBilan = hasPeriodFilter && periodStatements ? periodStatements.bilan : bilan;
  const effectiveSig = hasPeriodFilter && periodStatements ? periodStatements.sig : sig;
  const effectiveCR = hasPeriodFilter && periodStatements ? periodStatements.cr : cr;
  const effectiveBalance = hasPeriodFilter && periodBalance ? periodBalance : balance;

  // Ratios recalculés sur la période EFFECTIVE du rapport pour cohérence avec
  // le bilan/SIG. Sans ça, DSO/DPO du rapport étaient basés sur la période
  // globale de l'app alors que les autres sections utilisaient la période du rapport.
  const customRatioTargets = useSettings((s) => s.ratioTargets);
  const effectiveRatios = useMemo(() => {
    if (!hasPeriodFilter || !periodBalance) return ratios;
    let pd = 0;
    for (let m = (periodFromMonth ?? 1); m <= (periodToMonth ?? 12); m++) {
      pd += new Date(currentYear, m, 0).getDate();
    }
    return computeRatios(periodBalance, customRatioTargets, { periodDays: pd || 360 });
  }, [hasPeriodFilter, periodBalance, ratios, periodFromMonth, periodToMonth, currentYear, customRatioTargets]);

  // Balances auxiliaires (vraie ventilation par tier — pas de regroupement parent)
  const auxClient = useLiveQuery(async () => {
    if (!currentOrgId) return [];
    const { computeAuxBalance } = await import('../engine/balance');
    return computeAuxBalance({ orgId: currentOrgId, year: currentYear, kind: 'client' });
  }, [currentOrgId, currentYear], []);
  const auxFournisseur = useLiveQuery(async () => {
    if (!currentOrgId) return [];
    const { computeAuxBalance } = await import('../engine/balance');
    return computeAuxBalance({ orgId: currentOrgId, year: currentYear, kind: 'fournisseur' });
  }, [currentOrgId, currentYear], []);
  // Balances ÂGÉES réelles (calculées depuis les dates GL — pas de %fictifs)
  const agedClient = useLiveQuery(async () => {
    if (!currentOrgId) return null;
    const { agedBalance } = await import('../engine/analytics');
    return agedBalance(currentOrgId, currentYear, 'client');
  }, [currentOrgId, currentYear], null);
  const agedFournisseur = useLiveQuery(async () => {
    if (!currentOrgId) return null;
    const { agedBalance } = await import('../engine/analytics');
    return agedBalance(currentOrgId, currentYear, 'fournisseur');
  }, [currentOrgId, currentYear], null);

  // Vrais flux de trésorerie mensuels (mouvements classe 5) — pour Cashflow Statement
  // Distinct du CR : on prend les débits (encaissements) et crédits (décaissements)
  // sur les comptes de banque/caisse 50-58, pas les charges/produits 6/7.
  const cashflowMonthly = useLiveQuery(async () => {
    if (!currentOrgId) return null;
    const { tresorerieMonthly } = await import('../engine/analytics');
    return tresorerieMonthly(currentOrgId, currentYear);
  }, [currentOrgId, currentYear], null);

  // Nb de jours de la période sélectionnée — utilisé pour annualiser DSO/DPO
  // sans surévaluer les délais quand on regarde un trimestre ou un semestre.
  const periodDays = useMemo(() => {
    const fm = hasPeriodFilter ? periodFromMonth : 1;
    const tm = hasPeriodFilter ? periodToMonth : 12;
    let d = 0;
    for (let m = fm; m <= tm; m++) {
      d += new Date(currentYear, m, 0).getDate(); // jours du mois m
    }
    return d || 360;
  }, [hasPeriodFilter, periodFromMonth, periodToMonth, currentYear]);

  const data = useMemo(() => ({
    bilanActif: effectiveBilan?.actif ?? [],
    bilanPassif: effectiveBilan?.passif ?? [],
    cr: effectiveCR,
    sig: effectiveSig,
    balance: effectiveBalance,
    ratios: effectiveRatios,
    tft: tft?.lines,
    capital,
    budgetActual,
    monthlyCR,
    monthlyBilan,
    auxClient,
    auxFournisseur,
    agedClient,
    agedFournisseur,
    cashflowMonthly,
    hasAnalytical,
    hasStocks,
    periodDays,
  }), [effectiveBilan, effectiveCR, effectiveSig, effectiveBalance, effectiveRatios, tft, capital, budgetActual, monthlyCR, monthlyBilan, auxClient, auxFournisseur, agedClient, agedFournisseur, cashflowMonthly, hasAnalytical, hasStocks, periodDays]);

  // Rafraîchir les KPIs du rapport par défaut une fois les données chargées (1 fois)
  useEffect(() => {
    if (initialized.current || !sig) return;
    initialized.current = true;
    setConfig((c) => ({ ...c, blocks: filterConditionalBlocks(QUICK_TEMPLATES.monthly(data), data) }));
  }, [sig, data]);

  const logReport = (title: string, format: string) => {
    const entry = { date: Date.now(), title, format };
    const updated = [entry, ...journal].slice(0, 50);
    setJournal(updated);
    localStorage.setItem('report-journal', JSON.stringify(updated));
  };

  const generate = (download: boolean = true) => {
    if (!sig) return;
    const fmt = config.format === 'pptx' ? 'PPTX' : config.format === 'A4_landscape' ? 'PDF Paysage' : 'PDF Portrait';
    logReport(config.identity.title, fmt);
    if (config.format === 'pptx') {
      buildPPTXFromBlocks(config, data, org?.name ?? '—').then((blob) => {
        if (download) saveAs(blob, `${config.identity.title.replace(/\s+/g, '_')}.pptx`);
        else { window.open(URL.createObjectURL(blob), '_blank'); }
      });
    } else {
      // ✨ NOUVEAU : impression HTML/CSS WYSIWYG — le PDF correspond EXACTEMENT à
      // l'aperçu en ligne. Utilise window.print() avec un style print qui masque
      // tout sauf les pages du rapport. L'utilisateur choisit "Enregistrer en PDF"
      // dans la boîte de dialogue d'impression du navigateur.
      // Mode "download" et "preview" font la même chose : ouvrent le dialog d'impression.
      void download;
      window.print();
    }
  };

  // TOC dérivée des h1/h2/h3
  const toc = config.blocks.filter((b) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && (b as any).inToc !== false) as Array<{ id: string; type: 'h1'|'h2'|'h3'; text: string }>;

  return (
    <div>
      <div className="no-print">
      <PageHeader
        title="Reporting"
        subtitle="Éditeur par blocs · Visualiseur · Sommaire personnalisé · A4/PPTX · Palette"
        action={
          <div className="flex gap-2 flex-wrap">
            <button className="btn-primary" onClick={() => saveReport(false)} title={currentReportId ? 'Mettre à jour le rapport courant' : 'Enregistrer un nouveau rapport'}>
              <Save className="w-4 h-4" /> {currentReportId ? 'Sauvegarder' : 'Enregistrer le rapport'}
            </button>
            {currentReportId && (
              <button className="btn-outline" onClick={() => { setCurrentReportId(null); saveReport(true); }} title="Enregistrer comme nouveau rapport">
                <Save className="w-4 h-4" /> Enregistrer sous…
              </button>
            )}
            <button className="btn-outline" onClick={() => setOpenJournal(true)}>
              <FileText className="w-4 h-4" /> Journal des rapports ({savedReports.length})
            </button>
            <RouterLink to="/settings" className="btn-outline" title="Modifier les informations société (nom, RCCM, IFU, adresse, devise)">
              <SettingsIcon className="w-4 h-4" /> Paramètres société
            </RouterLink>
            <button className="btn-outline" onClick={() => setOpenLoad(true)}>Charger un modèle</button>
            <button className="btn-outline" onClick={() => setOpenSave(true)}><Save className="w-4 h-4" /> Enregistrer modèle</button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm("Auto-commenter le rapport avec Proph3t ?\nGénère un commentaire sous chaque H1, H2 et H3.\nL'analyse intègre l'historique mémorisé + connaissance SYSCOHADA + prédictions.")) return;
              const { autoCommentReport } = await import('../engine/proph3/reportCommentator');
              const dataWithOrg = { ...data, org: { name: org?.name, sector: (org as any)?.sector } } as any;
              const res = autoCommentReport(config.blocks as any, dataWithOrg, {
                orgId: currentOrgId,
                context: config.identity.period || `${currentYear}`,
              });
              setConfig((c) => ({ ...c, blocks: res.blocks as any }));
              toast.success('Proph3t a commenté le rapport', `${res.count} sections enrichies — mémoire mise à jour`);
            }}><Sparkles className="w-4 h-4" /> Commenter avec Proph3t</button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm("Effacer tous les commentaires générés par Proph3t ?\nLes paragraphes que vous avez écrits manuellement sont préservés.")) return;
              const { clearAutoComments } = await import('../engine/proph3/reportCommentator');
              const res = clearAutoComments(config.blocks as any);
              setConfig((c) => ({ ...c, blocks: res.blocks as any }));
              toast.success('Commentaires effacés', `${res.count} commentaires Proph3t supprimés`);
            }}>Effacer commentaires Proph3t</button>
            <button className="btn-outline" onClick={() => generate(false)}><Eye className="w-4 h-4" /> Aperçu</button>
            <button className="btn-outline" onClick={() => generate(true)}><Download className="w-4 h-4" /> Télécharger</button>
            <button className="btn-primary" onClick={() => setOpenSend(true)}><Send className="w-4 h-4" /> Envoyer</button>
          </div>
        }
      />
      </div>

      <div className="grid grid-cols-1 gap-4" style={{
        gridTemplateColumns: `${leftCollapsed ? '48px' : '300px'} minmax(0, 1fr) ${rightCollapsed ? '48px' : '280px'}`,
      }}>

        {/* ════════════════ SIDEBAR GAUCHE — ÉDITEUR ════════════════ */}
        {leftCollapsed ? (
          <button onClick={toggleLeft} className="self-start sticky top-20 w-10 h-12 rounded-xl bg-primary-900 dark:bg-primary-100 hover:scale-105 text-primary-50 dark:text-primary-900 shadow-sm hover:shadow flex items-center justify-center transition-all duration-200 font-semibold text-base" title="Déplier l'éditeur" aria-label="Déplier l'éditeur">
            ›
          </button>
        ) : (
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto pr-1 animate-fade-in">
          <div className="flex items-center justify-between mb-2 px-3 py-2 bg-primary-100/60 dark:bg-primary-800/60 rounded-xl border border-primary-200/40 dark:border-primary-700/40">
            <p className="text-[10px] uppercase tracking-[0.12em] text-primary-700 dark:text-primary-200 font-semibold">Éditeur</p>
            <button onClick={toggleLeft} className="btn-icon w-7 h-7" title="Replier l'éditeur" aria-label="Replier"><span className="text-base font-medium">‹</span></button>
          </div>

          <Collapsible title="Identité" defaultOpen>
            <div className="space-y-2.5">
              <Field label="Titre" v={config.identity.title} on={(v) => setIdentity('title', v)} />
              <Field label="Sous-titre" v={config.identity.subtitle} on={(v) => setIdentity('subtitle', v)} />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Période de reporting</label>
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <div>
                    <label className="text-[9px] text-primary-400 block mb-0.5">Du</label>
                    <input type="date" className="input !py-1 text-xs w-full" value={config.identity.periodFrom ?? ''} onChange={(e) => {
                      setIdentity('periodFrom', e.target.value);
                      const from = e.target.value ? new Date(e.target.value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
                      const to = config.identity.periodTo ? new Date(config.identity.periodTo).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
                      if (from && to) setIdentity('period', `Du ${from} au ${to}`);
                    }} />
                  </div>
                  <div>
                    <label className="text-[9px] text-primary-400 block mb-0.5">Au</label>
                    <input type="date" className="input !py-1 text-xs w-full" value={config.identity.periodTo ?? ''} onChange={(e) => {
                      setIdentity('periodTo', e.target.value);
                      const from = config.identity.periodFrom ? new Date(config.identity.periodFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
                      const to = e.target.value ? new Date(e.target.value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
                      if (from && to) setIdentity('period', `Du ${from} au ${to}`);
                    }} />
                  </div>
                </div>
                <input className="input !py-1 text-xs text-primary-400" value={config.identity.period} onChange={(e) => setIdentity('period', e.target.value)} placeholder="Ou saisie libre : Exercice 2025, S1 2025..." />
              </div>
              <Field label="Auteur" v={config.identity.author} on={(v) => setIdentity('author', v)} />
              <div>
                <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Confidentialité</label>
                <select className="input !py-1.5 text-xs" value={config.identity.confidentiality} onChange={(e) => setIdentity('confidentiality', e.target.value)}>
                  <option value="public">Public</option><option value="interne">Interne</option><option value="confidentiel">Confidentiel</option><option value="strict">Strict</option>
                </select>
              </div>
              <LogoUpload onLogo={(d) => setIdentity('logoDataUrl', d)} current={config.identity.logoDataUrl} />
            </div>
          </Collapsible>

          <Collapsible title="Sommaire" defaultOpen badge={<span className="badge bg-primary-200 dark:bg-primary-800 text-[10px]">{config.blocks.filter((b) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && (b as any).inToc !== false).length}</span>}>
            <p className="text-[10px] text-primary-500 mb-2">Ajoutez les titres qui composeront votre sommaire.</p>

            <div className="flex gap-1 mb-2">
              <input className="input !py-1.5 text-xs flex-1" placeholder="Titre de section…" value={tocLabel}
                onChange={(e) => setTocLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && tocLabel.trim()) { addBlock({ id: uid(), type: 'h1', text: tocLabel.trim(), inToc: true }); setTocLabel(''); } }} />
              <button className="btn-primary !px-2 !py-1.5 text-xs" disabled={!tocLabel.trim()}
                onClick={() => { if (tocLabel.trim()) { addBlock({ id: uid(), type: 'h1', text: tocLabel.trim(), inToc: true }); setTocLabel(''); } }}>+</button>
            </div>

            <div className="flex gap-1 mb-3 flex-wrap">
              <button className="btn-outline !py-1 text-[10px]"
                onClick={() => { const t = prompt('Titre H1 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h1', text: t.trim(), inToc: true }); }}>+ H1</button>
              <button className="btn-outline !py-1 text-[10px]"
                onClick={() => { const t = prompt('Titre H2 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h2', text: t.trim(), inToc: true }); }}>+ H2</button>
              <button className="btn-outline !py-1 text-[10px]"
                onClick={() => { const t = prompt('Titre H3 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h3', text: t.trim(), inToc: true }); }}>+ H3</button>
            </div>

            {config.blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3').length === 0 ? (
              <p className="text-[10px] text-primary-400 italic text-center py-3">Aucun titre — le sommaire sera vide.</p>
            ) : (
              <ol className="space-y-0.5 max-h-64 overflow-y-auto">
                {config.blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3').map((t: any) => {
                  return (
                    <li key={t.id} className={clsx('flex items-center gap-1 px-1.5 py-1 rounded hover:bg-primary-200/50 dark:hover:bg-primary-800/50',
                      t.type === 'h2' && 'pl-4', t.type === 'h3' && 'pl-7')}>
                      <input
                        className="flex-1 text-xs bg-transparent border-b border-transparent focus:border-primary-500 focus:outline-none truncate"
                        value={t.text}
                        onChange={(e) => updateBlock(t.id, { text: e.target.value })}
                      />
                      <label className="flex items-center gap-1 text-[9px] cursor-pointer" title="Inclure dans le sommaire PDF">
                        <input type="checkbox" checked={t.inToc !== false} onChange={(e) => updateBlock(t.id, { inToc: e.target.checked })} className="scale-75" />
                      </label>
                      <button className="btn-ghost !p-0.5 text-[10px]" title="Monter" onClick={() => moveBlock(t.id, -1)}>↑</button>
                      <button className="btn-ghost !p-0.5 text-[10px]" title="Descendre" onClick={() => moveBlock(t.id, 1)}>↓</button>
                      <button className="btn-ghost !p-0.5 text-[10px] text-error" title="Supprimer" onClick={() => removeBlock(t.id)}>×</button>
                    </li>
                  );
                })}
              </ol>
            )}
          </Collapsible>

          <Collapsible title="Format de sortie">
            <div className="space-y-1">
              {[
                { k: 'A4_portrait' as const, label: 'A4 Portrait (PDF)' },
                { k: 'A4_landscape' as const, label: 'A4 Paysage (PDF)' },
                { k: 'pptx' as const, label: 'PowerPoint (PPTX)' },
              ].map((o) => (
                <label key={o.k} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 hover:bg-primary-200 dark:hover:bg-primary-800 rounded">
                  <input type="radio" checked={config.format === o.k} onChange={() => setFormat(o.k)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </Collapsible>

          <Collapsible title="Palette de couleurs" defaultOpen={false}>
            <div className="space-y-1">
              {(Object.keys(PALETTES) as PaletteKey[]).map((k) => {
                const p = PALETTES[k];
                return (
                  <label key={k} className="flex items-center gap-2 text-xs cursor-pointer p-2 hover:bg-primary-200 dark:hover:bg-primary-800 rounded">
                    <input type="radio" checked={config.palette === k} onChange={() => setPalette(k)} />
                    <div className="flex gap-0.5">
                      {p.chartColors.slice(0, 5).map((c, i) => <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />)}
                    </div>
                    <span className="flex-1">{p.name}</span>
                  </label>
                );
              })}
            </div>
          </Collapsible>

          <Collapsible title="Pages spéciales" defaultOpen={false}>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-1.5"><input type="checkbox" checked={config.options.includeCover} onChange={(e) => setOption('includeCover', e.target.checked)} /> Couverture</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-1.5"><input type="checkbox" checked={config.options.includeTOC} onChange={(e) => setOption('includeTOC', e.target.checked)} /> Sommaire automatique</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-1.5"><input type="checkbox" checked={config.options.includeFooter} onChange={(e) => setOption('includeFooter', e.target.checked)} /> Pied de page</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={config.options.includePageNumbers} onChange={(e) => setOption('includePageNumbers', e.target.checked)} /> Numérotation</label>
          </Collapsible>

          <Collapsible title="Modèles rapides" defaultOpen>
            <div className="space-y-1">
              {Object.entries(QUICK_TEMPLATES).map(([k]) => {
                const isActive = activeTemplate === k;
                const label = { weekly: 'Flash hebdomadaire', monthly: 'Rapport mensuel', quarterly: 'Comité trimestriel', annual: 'Rapport annuel', interim: 'Rapport intérimaire' }[k] ?? k;
                return (
                  <button
                    key={k}
                    onClick={() => applyTemplate(k as any)}
                    className={clsx(
                      'w-full text-left px-2.5 py-2 rounded text-xs font-medium border-2 transition-all flex items-center justify-between gap-2',
                      isActive
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'border-transparent hover:bg-primary-200 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300',
                    )}
                  >
                    <span className="truncate">{label}</span>
                    {isActive && <span className="text-[9px] uppercase tracking-wider font-bold shrink-0">Actif</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-primary-400 italic mt-2 px-1">
              Cliquez sur un modèle pour régénérer le rapport.
            </p>
          </Collapsible>
        </aside>
        )}

        {/* ════════════════ CENTRE — VISUALISEUR ════════════════ */}
        <main className="space-y-1 report-print-area w-full min-w-0">
          {renderPages(config, data, palette, {
            updateBlock, removeBlock, moveBlock, insertBlockAt, reorderBlock, moveBlockToIndex,
            openTablesCatalog: (idx: number) => { setInsertAtIndex(idx); setOpenCatalog('tables'); },
            openDashCatalog: (idx: number) => { setInsertAtIndex(idx); setOpenCatalog('dashboards'); },
            org,
            setLogo: (dataUrl: string) => setIdentity('logoDataUrl', dataUrl),
            setCoverProps: (props: Record<string, any>) => {
              setConfig((c) => ({ ...c, identity: { ...c.identity, ...props } }));
            },
          })}
        </main>

        {/* ════════════════ SIDEBAR DROITE ════════════════ */}
        {rightCollapsed ? (
          <button onClick={toggleRight} className="self-start sticky top-20 w-10 h-12 rounded-xl bg-primary-900 dark:bg-primary-100 hover:scale-105 text-primary-50 dark:text-primary-900 shadow-sm hover:shadow flex items-center justify-center transition-all duration-200 font-semibold text-base" title="Déplier le récapitulatif" aria-label="Déplier">
            ‹
          </button>
        ) : (
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto pr-1 animate-fade-in">
          <div className="flex items-center justify-between mb-2 px-3 py-2 bg-primary-100/60 dark:bg-primary-800/60 rounded-xl border border-primary-200/40 dark:border-primary-700/40">
            <button onClick={toggleRight} className="btn-icon w-7 h-7" title="Replier le récapitulatif" aria-label="Replier"><span className="text-base font-medium">›</span></button>
            <p className="text-[10px] uppercase tracking-[0.12em] text-primary-700 dark:text-primary-200 font-semibold">Récapitulatif</p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold mb-3">Récapitulatif</p>
            <div className="space-y-1.5 text-xs">
              <Stat label="Société" v={org?.name ?? '—'} />
              <Stat label="Période" v={config.identity.period} />
              <Stat label="Format" v={config.format === 'A4_portrait' ? 'A4 Portrait' : config.format === 'A4_landscape' ? 'A4 Paysage' : 'PPTX'} />
              <Stat label="Palette" v={palette.name} />
              <Stat label="Blocs" v={String(config.blocks.length)} />
              <Stat label="Titres au sommaire" v={String(toc.length)} />
              <Stat label="Destinataires" v={String(config.recipients.length)} />
            </div>
          </div>

          <div className="card p-4">
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold mb-3">Données courantes</p>
            <div className="space-y-1.5 text-xs">
              <Stat label="CA" v={fmtMoney(sig?.ca ?? 0)} />
              <Stat label="Résultat net" v={fmtMoney(sig?.resultat ?? 0)} />
              <Stat label="Total Actif" v={fmtMoney(bilan?.totalActif ?? 0)} />
              <Stat label="Ratios alerte" v={String(ratios.filter((r) => r.status !== 'good').length)} />
            </div>
          </div>

          <div className="card p-4">
            <button className="btn-primary w-full mb-2" onClick={() => setOpenSend(true)}><Send className="w-4 h-4" /> Envoyer pour validation/diffusion</button>
            <button className="btn-outline w-full mb-2" onClick={() => setOpenSave(true)}><Save className="w-4 h-4" /> Enregistrer comme modèle</button>
          </div>

          {journal.length > 0 && (
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold mb-3">Journal des rapports</p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {journal.slice(0, 10).map((j, i) => (
                  <div key={i} className="flex items-start justify-between text-xs border-b border-primary-100 dark:border-primary-800 pb-1.5 last:border-0">
                    <div>
                      <p className="font-medium text-primary-800 dark:text-primary-200 truncate max-w-[180px]">{j.title}</p>
                      <p className="text-[10px] text-primary-400">{new Date(j.date).toLocaleDateString('fr-FR')} {new Date(j.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-400 shrink-0">{j.format}</span>
                  </div>
                ))}
              </div>
              {journal.length > 10 && <p className="text-[10px] text-primary-400 mt-2">+ {journal.length - 10} autres</p>}
              <button className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 mt-2 transition" onClick={() => { setJournal([]); localStorage.removeItem('report-journal'); }}>Effacer l'historique</button>
            </div>
          )}
        </aside>
        )}
      </div>

      <CatalogModal
        open={openCatalog !== null}
        onClose={() => { setOpenCatalog(null); setInsertAtIndex(null); }}
        kind={openCatalog ?? 'tables'}
        onPick={(item, withTitle) => {
          const targetIdx = insertAtIndex ?? config.blocks.length;
          let offset = 0;
          if (withTitle) {
            insertBlockAt(targetIdx, { id: uid(), type: 'h2', text: item.label ?? item.name, inToc: true });
            offset = 1;
          }
          if (openCatalog === 'tables') {
            insertBlockAt(targetIdx + offset, { id: uid(), type: 'table', source: (item as any).v, title: (item as any).label });
          } else {
            insertBlockAt(targetIdx + offset, { id: uid(), type: 'dashboard', dashboardId: (item as any).id, title: (item as any).name });
          }
          setOpenCatalog(null);
          setInsertAtIndex(null);
        }}
      />

      <SendModal open={openSend} onClose={() => setOpenSend(false)} config={config} setConfig={setConfig} onValidate={() => generate(true)} />
      <SaveModal open={openSave} onClose={() => setOpenSave(false)} config={config} orgId={currentOrgId} />
      <LoadModal open={openLoad} onClose={() => setOpenLoad(false)} templates={templates} onLoad={(t: any) => { setConfig(JSON.parse(t.config)); setOpenLoad(false); }} />
      <ReportJournalModal
        open={openJournal}
        onClose={() => setOpenJournal(false)}
        reports={savedReports as any}
        currentReportId={currentReportId}
        onLoad={loadReport}
        onDelete={deleteReport}
      />
    </div>
  );
}

// ─── RENDU DES PAGES (simulation A4) ─────────────────────────────
function renderPages(config: ReportConfig, data: any, palette: any, ops: any) {
  const isLandscape = config.format === 'A4_landscape';
  // maxH = hauteur MAX d'une page (au-delà → badge "Hors marge"). Cela respecte
  // la dimension A4 mais on n'IMPOSE plus de minHeight, donc une page courte
  // ne génère plus d'espace blanc inutile.
  const maxH = config.format === 'pptx' ? 540 : isLandscape ? 760 : 1400;
  // Pas de maxWidth en écran : la page A4 occupe toute la cellule grid centrale.
  // Le ratio A4 réel est respecté à l'impression via les CSS @page (cf. index.css).
  const pageStyle = config.format === 'pptx'
    ? { width: '100%', aspectRatio: '16/9', minHeight: 'auto' as const, maxHeight: maxH }
    : isLandscape
      ? { width: '100%', aspectRatio: '297/210', minHeight: 'auto' as const, maxHeight: maxH }
      : { width: '100%', minHeight: 'auto' as const, maxHeight: maxH };

  // Estimation de la hauteur de chaque bloc (en px) pour pagination auto.
  // Pour les tables : on utilise le NOMBRE RÉEL DE LIGNES dans `data` afin
  // d'éviter qu'une table de 30 lignes soit estimée à 320px et déborde.
  const estimateTableRows = (source: string): number => {
    const ba = data?.budgetActual ?? [];
    if (!source) return 10;
    if (source === 'budget_actual') {
      return ba.filter((r: any) => Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01).length;
    }
    if (source.startsWith('crtab_')) {
      const PFX: Record<string, string[]> = {
        produits_expl: ['70','71','72','73','74','75','781'],
        charges_expl: ['60','61','62','63','64','65','66','681','691'],
        produits_fin: ['77','786','797'],
        charges_fin: ['67','687','697'],
        produits_hao: ['82','84','86','88'],
        charges_hao: ['81','83','85'],
        impots: ['87','89'],
      };
      const parts = source.replace('crtab_', '').split('_');
      const sectionKey = parts.slice(0, -1).join('_');
      const prefixes = PFX[sectionKey] ?? [];
      return ba
        .filter((r: any) => prefixes.some((p) => r.code?.startsWith(p)))
        .filter((r: any) => Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01)
        .length;
    }
    if (source === 'balance') return (data?.balance ?? []).filter((r: any) => Math.abs(r.soldeD) > 0.01 || Math.abs(r.soldeC) > 0.01).length;
    if (source === 'bilan_actif') return (data?.bilanActif ?? []).length;
    if (source === 'bilan_passif') return (data?.bilanPassif ?? []).length;
    if (source === 'cr') return (data?.cr ?? []).length;
    if (source === 'ratios') return (data?.ratios ?? []).length;
    if (source === 'tft') return (data?.tft ?? []).length;
    if (source === 'sig') return 5;
    return 10;
  };

  const estimateHeight = (b: Block): number => {
    switch (b.type) {
      case 'h1': return 60;
      case 'h2': return 42;
      case 'h3': return 32;
      case 'paragraph': {
        const text = (b as any).text || '';
        const lines = Math.ceil(text.length / 90);
        return Math.max(40, lines * 22 + 16);
      }
      case 'kpi': {
        const items = (b as any).items?.length || 4;
        const rows = Math.ceil(items / 4);
        return rows * 80 + 40;
      }
      case 'table': {
        // Header (~50) + titre (~25) + N lignes × 24px + footer (~25)
        const rows = Math.min(estimateTableRows((b as any).source), 30);
        return Math.max(120, 100 + rows * 24);
      }
      case 'dashboard': {
        const dashId = (b as any).dashboardId;
        if (dashId === 'pareto') return 540;
        if (dashId === 'client' || dashId === 'fr') return 480;
        if (dashId === 'waterfall') return 280;
        if (dashId === 'cashflow') return 340;
        if (dashId === 'cashforecast') return 340;
        if (dashId === 'bfr') return 280;
        if (dashId === 'exec') return 340;
        if (dashId === 'struct_actif' || dashId === 'struct_passif') return 280;
        if (dashId === 'pyramide_perf') return 380;
        if (dashId === 'ratios_table') return 540;
        if (dashId === 'compliance') return 700; // KPIs + 10 contrôles + recos
        return 220;
      }
      case 'pageBreak': return 0;
      default: return 60;
    }
  };

  // Pagination AUTO uniquement (pas de pageBreak forcé) : on remplit chaque
  // page jusqu'à atteindre la limite, puis on passe à la suivante. Évite tout
  // espace vide au bas des pages courtes.
  const PAGE_BUDGET = maxH - 60; // marge de sécurité (padding p-4 = 32px + safety 28px)
  const blocksWithIndex = config.blocks
    .filter((b) => b.type !== 'pageBreak') // on IGNORE les pageBreak manuels
    .map((b, i) => ({ block: b, index: i }));
  const pages: Array<Array<{ block: Block; index: number }>> = [[]];
  let currentHeight = 0;
  for (const item of blocksWithIndex) {
    const h = estimateHeight(item.block);
    if (h > PAGE_BUDGET && pages[pages.length - 1].length > 0) {
      pages.push([item]);
      currentHeight = h;
      continue;
    }
    if (currentHeight + h > PAGE_BUDGET && pages[pages.length - 1].length > 0) {
      pages.push([item]);
      currentHeight = h;
    } else {
      pages[pages.length - 1].push(item);
      currentHeight += h;
    }
  }
  // Élimine les pages vides éventuelles
  const nonEmptyPages = pages.filter((p) => p.length > 0);

  // Calcul du nombre total de pages pour la pagination
  const coverPages = config.options.includeCover ? 1 : 0;
  const tocPages = config.options.includeTOC ? 1 : 0;
  const backCoverPages = (config.options as any).includeBackCover !== false ? 1 : 0; // activé par défaut
  const totalPages = coverPages + tocPages + nonEmptyPages.length + backCoverPages;
  let pageNum = 0;

  return (
    <>
      {config.options.includeCover && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} hideNumber pageType="cover">
          <CoverPage config={config} palette={palette} org={ops.org} setLogo={ops.setLogo} setCoverProps={ops.setCoverProps} />
        </PageA4>
      )}

      {config.options.includeTOC && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} pageType="toc">
          <TocPage config={config} palette={palette} />
        </PageA4>
      )}

      {nonEmptyPages.map((pageBlocks, pi) => (
        <PageA4 key={pi} style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} pageType="content">
          {pageBlocks.map(({ block, index }) => (
            <DraggableBlock key={block.id} block={block} index={index} ops={ops} data={data} palette={palette} />
          ))}
          {pageBlocks.length > 0 && <InsertHere index={pageBlocks[pageBlocks.length - 1].index + 1} ops={ops} />}
        </PageA4>
      ))}

      {backCoverPages > 0 && (
        <PageA4 style={pageStyle} maxH={maxH} pageNum={++pageNum} totalPages={totalPages} palette={palette} hideNumber pageType="back">
          <BackCoverPage config={config} palette={palette} org={ops.org} />
        </PageA4>
      )}
    </>
  );
}

// ─── BLOC DRAGGABLE (HTML5 DnD natif) ─────────────────────────────
function DraggableBlock({ block, index, ops, data, palette }: { block: Block; index: number; ops: any; data: any; palette: any }) {
  const [dragOver, setDragOver] = useState<'above' | 'below' | null>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', block.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOver(e.clientY < mid ? 'above' : 'below');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (!srcId || srcId === block.id) { setDragOver(null); return; }
    ops.reorderBlock(srcId, block.id, dragOver === 'below');
    setDragOver(null);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(null)}
      onDrop={handleDrop}
      className="relative"
    >
      {dragOver === 'above' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-900 dark:bg-primary-100 z-10" />}
      <InsertHere index={index} ops={ops} />
      <BlockEditor block={block} data={data} palette={palette} ops={ops} />
      {dragOver === 'below' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-900 dark:bg-primary-100 z-10" />}
    </div>
  );
}

// ─── BOUTON "+" ENTRE LES BLOCS (aussi droppable) ──────────────
function InsertHere({ index, ops, alwaysOpen }: { index: number; ops: any; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen ?? false);
  const [hover, setHover] = useState(false);
  const [dragHover, setDragHover] = useState(false);

  const ins = (b: Block) => { ops.insertBlockAt(index, b); setOpen(false); };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragHover(true); };
  const handleDragLeave = () => setDragHover(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (srcId && ops.moveBlockToIndex) ops.moveBlockToIndex(srcId, index);
    setDragHover(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={clsx('flex items-center transition-all', dragHover ? 'h-8' : open || hover ? 'h-6' : 'h-0.5')}>
        {dragHover && <div className="absolute inset-x-0 top-1/2 h-1 bg-primary-900 dark:bg-primary-100 rounded" />}
        <div className={clsx('flex-1 h-px transition-colors', hover || open ? 'bg-primary-300 dark:bg-primary-700' : 'bg-transparent')} />
        <button
          onClick={() => setOpen(!open)}
          className={clsx('mx-2 transition-all rounded-full flex items-center justify-center text-xs font-bold',
            open || hover
              ? 'w-6 h-6 bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900'
              : 'w-3 h-3 bg-primary-300 dark:bg-primary-700 text-transparent')}
          title="Insérer un bloc ici"
        >+</button>
        <div className={clsx('flex-1 h-px transition-colors', hover || open ? 'bg-primary-300 dark:bg-primary-700' : 'bg-transparent')} />
      </div>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg shadow-lg p-2 w-[420px]">
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold px-2 mb-2">Choisir le type de bloc</p>
          <div className="grid grid-cols-3 gap-1">
            <PopBtn label="Titre H1" sub="Section principale" icon={<Hash className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'h1', text: 'Nouveau titre', inToc: true })} />
            <PopBtn label="Titre H2" sub="Sous-section" icon={<Hash className="w-3.5 h-3.5 opacity-70" />}
              onClick={() => ins({ id: uid(), type: 'h2', text: 'Sous-titre', inToc: true })} />
            <PopBtn label="Titre H3" sub="Sous-rubrique" icon={<Hash className="w-3.5 h-3.5 opacity-50" />}
              onClick={() => ins({ id: uid(), type: 'h3', text: 'Sous-section', inToc: true })} />
            <PopBtn label="Paragraphe" sub="Texte libre" icon={<Type className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'paragraph', text: 'Saisissez votre texte ici…' })} />
            <PopBtn label="KPIs" sub="Indicateurs" icon={<BarChart3 className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'kpi', items: [{ label: 'KPI 1', value: '—' }, { label: 'KPI 2', value: '—' }] })} />
            <PopBtn label="Saut de page" sub="Nouvelle page" icon={<MoveDown className="w-3.5 h-3.5" />}
              onClick={() => ins({ id: uid(), type: 'pageBreak' })} />
          </div>
          <div className="border-t border-primary-200 dark:border-primary-800 mt-2 pt-2">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold px-2 mb-1">Depuis le catalogue</p>
            <div className="grid grid-cols-2 gap-1">
              <PopBtn label="Tables" sub="9 sources comptables" icon={<TableIcon className="w-3.5 h-3.5" />}
                onClick={() => { setOpen(false); ops.openTablesCatalog(index); }} highlight />
              <PopBtn label="Dashboards" sub="25 dashboards prêts" icon={<BarChart3 className="w-3.5 h-3.5" />}
                onClick={() => { setOpen(false); ops.openDashCatalog(index); }} highlight />
            </div>
          </div>
          <div className="flex justify-end mt-2 pt-2 border-t border-primary-200 dark:border-primary-800">
            <button onClick={() => setOpen(false)} className="text-[10px] text-primary-500 hover:text-primary-900">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PopBtn({ icon, label, sub, onClick, highlight }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick}
      className={clsx('text-left p-2 rounded border transition',
        highlight
          ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800'
          : 'border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900')}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-[9px] text-primary-500 leading-tight">{sub}</p>
    </button>
  );
}

function PageA4({ children, style, maxH, pageNum, totalPages, palette, hideNumber, pageType }: {
  children: React.ReactNode;
  style: React.CSSProperties;
  maxH?: number;
  pageNum?: number;
  totalPages?: number;
  palette?: any;
  hideNumber?: boolean;
  pageType?: 'cover' | 'toc' | 'content' | 'back';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!ref.current || !maxH) return;
    const check = () => setOverflow(ref.current!.scrollHeight > maxH);
    check();
    const obs = new ResizeObserver(check);
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [maxH, children]);

  return (
    // Layout flex naturel SANS hauteur forcee a l'ecran : la page A4 prend la
    // hauteur de son contenu (pas d'espace blanc inutile entre les pages).
    // En print, l'@media print impose min-height: 100vh pour le rendu A4.
    <div data-page-type={pageType ?? 'content'} className={clsx('bg-white dark:bg-primary-900 mx-auto relative flex flex-col page-a4',
      overflow ? 'ring-1 ring-error/30' : '')} style={style}>
      {overflow && (
        <div className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded text-[9px] font-semibold bg-error/10 text-error border border-error/20 print:hidden">
          Hors marge — créez un nouveau saut de page
        </div>
      )}
      {/* w-full force la pleine largeur (parfois flex-basis:0 de flex-1 cause
          un retreciement en cross-axis) — important pour les covers modern
          qui utilisent flex horizontal interne avec w-2/5 et flex-1. */}
      <div ref={ref} className="break-words flex-1 w-full flex flex-col gap-1 p-4 pb-2">{children}</div>
      {/* Footer en flux normal — pas d'absolute pour eviter l'espace vide
          quand la page contient peu de contenu. */}
      {!hideNumber && pageNum && totalPages && (
        <div className="pb-2 flex items-center justify-center text-[10px] text-primary-400 font-medium select-none pointer-events-none">
          <span style={{ color: palette?.primary ?? undefined }}>Page {pageNum} / {totalPages}</span>
        </div>
      )}
    </div>
  );
}

function CoverPage({ config, palette, org, setLogo, setCoverProps }: any) {
  const [dragOver, setDragOver] = useState(false);
  const id = config.identity || {};
  // Cover : on consomme les tokens layout (palette.layout) pour matcher le
  // theme Twisty par defaut — bg creme + accent orange pour les liserés.
  // Important : on traite '#ffffff' comme "pas defini" pour ecraser les vieilles
  // configs persistees en localStorage qui ont coverBgColor='#ffffff'.
  const lay = (palette as any).layout as { bgShell?: string; accent?: string } | undefined;
  const isDefaultBg = !id.coverBgColor || id.coverBgColor.toLowerCase() === '#ffffff' || id.coverBgColor.toLowerCase() === '#fff';
  const titleColor = id.titleColor || palette.primary;
  const subtitleColor = id.subtitleColor || (lay?.accent ?? palette.primary);
  const accentColor = lay?.accent ?? palette.primary;
  const bgColor = isDefaultBg ? (lay?.bgShell ?? '#F4F1EC') : id.coverBgColor;
  const bgImage = id.coverBgImageUrl;
  const bgOpacity = typeof id.coverBgOpacity === 'number' ? id.coverBgOpacity : 0.15;
  const style = (id.coverStyle as 'classic' | 'modern' | 'banner') || 'modern';

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string' && setLogo) setLogo(reader.result); };
    reader.readAsDataURL(file);
  };
  const setBgImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string' && setCoverProps) setCoverProps({ coverBgImageUrl: reader.result }); };
    reader.readAsDataURL(file);
  };

  // NOTE: `w-full` explicite sur les 3 styles ci-dessous. Le parent PageA4 est un
  // `flex flex-col` dans une cellule grid ; sans w-full, l'enfant peut se réduire
  // à sa largeur intrinsèque (notamment sur les conteneurs `flex` row internes).
  // Style MODERN — bandeau gauche coloré
  // Layout en CSS GRID 2 colonnes (40% / 1fr) au lieu de flex : plus deterministe,
  // les 2 bandeaux occupent TOUJOURS toute la largeur peu importe le contexte parent.
  if (style === 'modern') {
    return (
      <div
        className="w-full h-full relative overflow-hidden grid"
        style={{ minHeight: 480, background: bgColor, gridTemplateColumns: '40% 1fr' }}
      >
        {bgImage && <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
        <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
        <div className="flex flex-col justify-between p-10 relative z-10" style={{ background: titleColor, color: '#fff' }}>
          {id.logoDataUrl ? (
            <div className="bg-white/10 backdrop-blur p-3 rounded inline-block self-start">
              <img src={id.logoDataUrl} alt="logo" style={{ maxHeight: '72px', maxWidth: '180px', objectFit: 'contain' }} />
            </div>
          ) : <div className="opacity-50 text-xs uppercase tracking-widest">Logo</div>}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 mb-2">Document {id.confidentiality}</p>
            <p className="text-xs opacity-90">Période : <strong>{id.period}</strong></p>
            <p className="text-xs opacity-90">Date : {new Date().toLocaleDateString('fr-FR')}</p>
            <p className="text-xs opacity-90 mt-3">Émis par {id.author}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center p-12 relative z-10">
          <p className="text-[11px] uppercase tracking-[0.25em] mb-4" style={{ color: titleColor, opacity: 0.7 }}>{org?.name ?? 'Société'}</p>
          <h1 className="text-5xl font-bold leading-tight mb-3" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-lg italic" style={{ color: subtitleColor, opacity: 0.9 }}>{id.subtitle}</p>}
          <div className="mt-12 pt-6 border-t-2" style={{ borderColor: accentColor }}>
            {(org?.rccm || org?.ifu) && <p className="text-xs text-primary-500">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
            {org?.address && <p className="text-xs text-primary-500 mt-1">{org.address}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Style BANNER — bandeau horizontal en haut
  if (style === 'banner') {
    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ minHeight: 480, background: bgColor }}>
        {bgImage && <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
        <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
        <div className="h-44 flex items-center justify-between px-12 relative z-10" style={{ background: titleColor, color: '#fff' }}>
          {id.logoDataUrl ? (
            <img src={id.logoDataUrl} alt="logo" className="bg-white/10 p-2 rounded backdrop-blur" style={{ maxHeight: '90px', maxWidth: '200px', objectFit: 'contain' }} />
          ) : <div className="opacity-50">Logo</div>}
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest opacity-90">{org?.name ?? '—'}</p>
            <p className="text-[10px] opacity-70 mt-1">Document {id.confidentiality}</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-10 relative z-10">
          <h1 className="text-5xl font-bold leading-tight mb-4" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-xl italic mb-12" style={{ color: subtitleColor }}>{id.subtitle}</p>}
          <div className="inline-block px-8 py-4 border-2 rounded-lg" style={{ borderColor: titleColor }}>
            <p className="text-2xl font-bold" style={{ color: titleColor }}>{id.period}</p>
          </div>
        </div>
        <div className="px-10 py-6 text-center text-xs text-primary-500 border-t relative z-10" style={{ borderColor: titleColor + '40' }}>
          <p>Émis par <strong>{id.author}</strong> · {new Date().toLocaleDateString('fr-FR')}</p>
          {(org?.rccm || org?.ifu) && <p className="mt-1">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        </div>
      </div>
    );
  }

  // Style CLASSIC (par défaut) — centré épuré et élégant
  return (
    <div
      className="w-full h-full flex flex-col relative overflow-hidden"
      style={{ minHeight: 480, background: bgColor }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {bgImage && <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />}
      <CoverEditPanel id={id} setCoverProps={setCoverProps} setBgImage={setBgImage} />
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20 print:hidden">
          <div className="text-center">
            <p className="text-3xl font-semibold tracking-tight" style={{ color: palette.primary }}>Déposez votre logo</p>
            <p className="text-sm text-primary-500 mt-2">PNG · JPG · SVG</p>
          </div>
        </div>
      )}
      <div className="h-3" style={{ background: titleColor }} />
      {/* Liseré accent (orange Twisty par defaut) sous le bandeau noir principal */}
      <div className="h-1 mt-1 mx-12" style={{ background: accentColor }} />

      <div className="flex-1 flex flex-col p-12 relative z-10">
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-primary-500 font-semibold">Document {id.confidentiality}</p>

        {id.logoDataUrl ? (
          <div className="text-center mt-8 relative group">
            <img src={id.logoDataUrl} alt="logo" className="inline-block" style={{ maxHeight: '110px', maxWidth: '260px', objectFit: 'contain' }} />
            <button onClick={() => setLogo && setLogo('')} className="absolute top-0 right-1/2 translate-x-32 -translate-y-2 opacity-0 group-hover:opacity-100 bg-error text-white rounded-full w-6 h-6 text-xs font-bold transition print:hidden" title="Retirer le logo">×</button>
          </div>
        ) : (
          <div className="text-center mt-8 print:hidden">
            <label className="inline-block border-2 border-dashed border-primary-300 rounded p-4 cursor-pointer hover:border-primary-500 transition">
              <p className="text-xs text-primary-500">Cliquez ou glissez un logo</p>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]; if (!f || !setLogo) return;
                const r = new FileReader(); r.onload = () => typeof r.result === 'string' && setLogo(r.result); r.readAsDataURL(f);
              }} />
            </label>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {/* Petits traits de cadrage en accent autour du titre */}
          <div className="w-16 h-px mb-6" style={{ background: accentColor }} />
          <h1 className="text-4xl font-bold leading-tight tracking-tight" style={{ color: titleColor }}>{id.title}</h1>
          {id.subtitle && <p className="text-lg italic mt-3" style={{ color: subtitleColor, opacity: 0.9 }}>{id.subtitle}</p>}
          <div className="w-16 h-px mt-6" style={{ background: accentColor }} />

          <p className="text-2xl font-bold mt-12" style={{ color: titleColor + 'cc' }}>{org?.name ?? '—'}</p>
          {(org?.rccm || org?.ifu) && <p className="text-xs text-primary-500 mt-2">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        </div>

        <div className="text-center text-sm space-y-1.5 mt-8 pt-6 border-t" style={{ borderColor: accentColor + '40' }}>
          <p className="text-primary-700"><span className="text-primary-500 text-xs uppercase tracking-wider">Période</span><br /><strong className="text-base">{id.period}</strong></p>
          <p className="text-primary-500 text-xs">Émis par <strong className="text-primary-700">{id.author}</strong> · {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </div>

      <div className="h-1 mb-1 mx-12" style={{ background: accentColor }} />
      <div className="h-3" style={{ background: titleColor }} />
    </div>
  );
}

// Panneau d'édition flottant pour personnaliser la couverture
function CoverEditPanel({ id, setCoverProps, setBgImage }: any) {
  const [open, setOpen] = useState(false);
  if (!setCoverProps) return null;
  return (
    <div className="absolute top-2 right-2 z-30 print:hidden">
      <button onClick={() => setOpen(!open)} className="bg-primary-900/90 dark:bg-primary-100/90 text-primary-50 dark:text-primary-900 rounded-full px-3 py-1.5 text-[10px] font-semibold shadow-lg hover:scale-105 transition">
        Personnaliser
      </button>
      {open && (
        <div className="absolute top-10 right-0 w-72 bg-white dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg shadow-2xl p-3 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Style</label>
            <select className="input !py-1 text-xs" value={id.coverStyle || 'classic'} onChange={(e) => setCoverProps({ coverStyle: e.target.value })}>
              <option value="classic">Classique (centré)</option>
              <option value="modern">Moderne (bandeau gauche)</option>
              <option value="banner">Banner (bandeau haut)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur de fond</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.coverBgColor || '#ffffff'} onChange={(e) => setCoverProps({ coverBgColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.coverBgColor || '#ffffff'} onChange={(e) => setCoverProps({ coverBgColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur du titre</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.titleColor || '#171717'} onChange={(e) => setCoverProps({ titleColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.titleColor || ''} placeholder="palette défaut" onChange={(e) => setCoverProps({ titleColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Couleur sous-titre</label>
            <div className="flex gap-2 items-center">
              <input type="color" className="w-10 h-8 rounded cursor-pointer border-0" value={id.subtitleColor || '#737373'} onChange={(e) => setCoverProps({ subtitleColor: e.target.value })} />
              <input type="text" className="input !py-1 text-xs flex-1" value={id.subtitleColor || ''} placeholder="défaut" onChange={(e) => setCoverProps({ subtitleColor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Image de fond</label>
            <input type="file" accept="image/*" className="text-[10px] w-full" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBgImage(f); }} />
            {id.coverBgImageUrl && (
              <>
                <div className="mt-2 flex gap-2 items-center">
                  <img src={id.coverBgImageUrl} alt="bg" className="h-8 rounded object-cover w-16" />
                  <button className="btn-outline !py-1 text-[10px]" onClick={() => setCoverProps({ coverBgImageUrl: '' })}>Retirer</button>
                </div>
                <label className="text-[9px] text-primary-500 block mt-1">Opacité : {Math.round((id.coverBgOpacity ?? 0.15) * 100)} %</label>
                <input type="range" min={0.05} max={1} step={0.05} value={id.coverBgOpacity ?? 0.15} onChange={(e) => setCoverProps({ coverBgOpacity: parseFloat(e.target.value) })} className="w-full" />
              </>
            )}
          </div>
          <div className="flex justify-between pt-2 border-t border-primary-200 dark:border-primary-800">
            <button className="btn-outline !py-1 text-[10px]" onClick={() => setCoverProps({ coverBgColor: '', coverBgImageUrl: '', titleColor: '', subtitleColor: '', coverStyle: 'classic' })}>Réinitialiser</button>
            <button className="btn-primary !py-1 text-[10px]" onClick={() => setOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Page de dos / 4ème de couverture
function BackCoverPage({ config, palette, org }: any) {
  const lay = (palette as any).layout as { bgShell?: string; accent?: string } | undefined;
  const accentColor = lay?.accent ?? palette.primary;
  const bgColor = lay?.bgShell ?? '#ffffff';
  return (
    // minHeight aligné sur les covers (480) pour cohérence visuelle ; la hauteur
    // réelle est imposée par PageA4 via `h-full` + maxHeight du pageStyle.
    // Bordure en accent (orange) + fond shell (creme) pour matcher Twisty.
    <div className="w-full border-2 rounded p-6 h-full flex flex-col justify-between" style={{ borderColor: accentColor, minHeight: 480, background: bgColor }}>
      <div className="text-center">
        {config.identity.logoDataUrl && (
          <img
            src={config.identity.logoDataUrl}
            alt="logo"
            className="inline-block opacity-80 mb-4"
            style={{ maxHeight: '64px', maxWidth: '180px', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        )}
        <p className="text-xs uppercase tracking-widest text-primary-500 font-semibold">{org?.name ?? '—'}</p>
      </div>

      <div className="space-y-6 px-8">
        <div className="text-center">
          <p className="text-xl font-bold mb-2" style={{ color: palette.primary }}>{config.identity.title}</p>
          {config.identity.subtitle && <p className="text-sm italic text-primary-500">{config.identity.subtitle}</p>}
        </div>

        <div className="border-t border-b py-4 space-y-2 text-xs text-primary-600 dark:text-primary-400" style={{ borderColor: accentColor + '60' }}>
          <p><strong>Document confidentiel</strong> — destiné exclusivement aux destinataires désignés. Toute reproduction ou diffusion non autorisée est strictement interdite.</p>
          <p>Les analyses présentées dans ce rapport sont basées sur les données comptables disponibles à la date d'émission. Elles n'engagent que leur auteur et n'ont pas vocation à constituer un avis d'expertise.</p>
          <p>Conformément aux normes <strong>SYSCOHADA révisé 2017</strong> en vigueur dans l'espace OHADA.</p>
        </div>

        {config.recipients?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Destinataires</p>
            <ul className="text-xs space-y-0.5">
              {config.recipients.slice(0, 8).map((r: any, i: number) => <li key={i}>• {r.name} {r.email && <span className="text-primary-400">— {r.email}</span>}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="text-center text-[10px] text-primary-400 space-y-1 border-t pt-4" style={{ borderColor: accentColor + '60' }}>
        <p>Émis par {config.identity.author} · {new Date().toLocaleDateString('fr-FR')}</p>
        {(org?.rccm || org?.ifu) && <p>{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
        {org?.address && <p>{org.address}</p>}
        <p className="mt-2 italic">Généré avec CockPit F&A · SYSCOHADA 2017</p>
      </div>
    </div>
  );
}

function TocPage({ config, palette }: any) {
  const toc = config.blocks.filter((b: any) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.inToc !== false);
  const lay = (palette as any).layout as { accent?: string } | undefined;
  const accentColor = lay?.accent ?? palette.primary;
  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold pb-2 mb-6 border-b-2" style={{ color: palette.primary, borderColor: accentColor }}>Sommaire</h2>
      <ol className="space-y-2">
        {toc.map((t: any, i: number) => (
          <li key={t.id} className={clsx('flex items-baseline gap-2', t.type === 'h2' && 'pl-4', t.type === 'h3' && 'pl-8')}>
            <span className="num text-xs text-primary-500 w-6">{i + 1}.</span>
            <span className={clsx('text-sm', t.type === 'h1' && 'font-semibold')}>{t.text}</span>
            <span className="flex-1 border-b border-dotted border-primary-300 dark:border-primary-700 mb-1" />
            <span className="num text-xs text-primary-500">—</span>
          </li>
        ))}
        {toc.length === 0 && <li className="text-sm text-primary-400 italic">Ajoutez des titres pour générer le sommaire.</li>}
      </ol>
    </div>
  );
}

// ─── ÉDITION INLINE D'UN BLOC ────────────────────────────────────
function BlockEditor({ block, data, palette, ops }: any) {
  const Controls = (
    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition flex gap-0.5 bg-primary-100 dark:bg-primary-900 p-0.5 rounded shadow z-10">
      <button onClick={() => ops.moveBlock(block.id, -1)} className="btn-ghost !p-1 text-[10px]">↑</button>
      <button onClick={() => ops.moveBlock(block.id, 1)} className="btn-ghost !p-1 text-[10px]">↓</button>
      <button onClick={() => ops.removeBlock(block.id)} className="btn-ghost !p-1 text-[10px] text-error"><Trash2 className="w-3 h-3" /></button>
    </div>
  );

  const wrapper = (children: React.ReactNode) => (
    <div className="group relative hover:bg-primary-100/30 dark:hover:bg-primary-800/20 rounded px-1 py-0">
      {Controls}{children}
    </div>
  );

  if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
    const sizes = { h1: 'text-2xl font-bold', h2: 'text-lg font-bold', h3: 'text-base font-semibold' };
    const Tag = block.type as 'h1' | 'h2' | 'h3';
    return wrapper(
      <>
        <input
          className={clsx(sizes[block.type as keyof typeof sizes], 'w-full bg-transparent border-b border-transparent focus:border-primary-500 outline-none px-1 py-0.5 print:hidden')}
          value={block.text}
          onChange={(e) => ops.updateBlock(block.id, { text: e.target.value })}
          style={{ color: palette.primary }}
        />
        {/* Version texte pour l'impression PDF */}
        <Tag
          className={clsx(sizes[block.type as keyof typeof sizes], 'hidden print:block px-1 py-0.5 m-0')}
          style={{ color: palette.primary }}
        >
          {block.text}
        </Tag>
      </>
    );
  }
  if (block.type === 'paragraph') {
    // Texte affichable en édition (textarea) + version impression (p)
    // Le marker [Proph3t-auto] est nettoyé visuellement
    const cleanText = (block.text || '').replace(/^\[Proph3t-auto\]\s*/, '');
    return wrapper(
      <>
        <textarea
          className="w-full bg-transparent border border-dashed border-transparent focus:border-primary-500 hover:border-primary-300 dark:hover:border-primary-700 rounded px-2 py-1 text-sm resize-none outline-none overflow-hidden print:hidden"
          value={block.text}
          onChange={(e) => {
            ops.updateBlock(block.id, { text: e.target.value });
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          ref={(el) => {
            if (el) {
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }
          }}
        />
        <p className="hidden print:block px-2 py-1 text-sm leading-relaxed m-0">{cleanText}</p>
      </>
    );
  }
  if (block.type === 'kpi') {
    return wrapper(
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {block.items.map((it: any, i: number) => (
            <div key={i} className="border border-primary-200 dark:border-primary-800 rounded p-2 bg-primary-50 dark:bg-primary-950">
              <input className="w-full text-[10px] uppercase tracking-wider text-primary-500 font-semibold bg-transparent outline-none" value={it.label}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], label: e.target.value }; ops.updateBlock(block.id, { items }); }} />
              <input className="w-full num text-base font-bold bg-transparent outline-none mt-1" style={{ color: palette.primary }} value={it.value}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], value: e.target.value }; ops.updateBlock(block.id, { items }); }} />
              <input className="w-full text-[10px] text-primary-500 bg-transparent outline-none mt-0.5" placeholder="sous-valeur" value={it.subValue ?? ''}
                onChange={(e) => { const items = [...block.items]; items[i] = { ...items[i], subValue: e.target.value }; ops.updateBlock(block.id, { items }); }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          <button className="btn-outline !py-1 text-xs" onClick={() => ops.updateBlock(block.id, { items: [...block.items, { label: `KPI ${block.items.length + 1}`, value: '—' }] })}>+ KPI</button>
          {block.items.length > 1 && <button className="btn-outline !py-1 text-xs" onClick={() => ops.updateBlock(block.id, { items: block.items.slice(0, -1) })}>− KPI</button>}
          <select className="input !py-1 text-xs !w-auto" value="" onChange={(e) => {
            if (!e.target.value) return;
            const v = e.target.value;
            const map: Record<string, { label: string; value: string }> = {
              ca: { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
              rn: { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
              ebe: { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
              va: { label: 'Valeur ajoutée', value: fmtMoney(data.sig?.valeurAjoutee ?? 0) },
              actif: { label: 'Total Actif', value: fmtMoney(data.bilanActif?.find((l: any) => l.code === '_BZ')?.value ?? 0) },
            };
            ops.updateBlock(block.id, { items: [...block.items, map[v]] });
            e.target.value = '';
          }}>
            <option value="">+ KPI calculé…</option>
            <option value="ca">CA</option><option value="rn">Résultat net</option><option value="ebe">EBE</option><option value="va">VA</option><option value="actif">Total Actif</option>
          </select>
        </div>
      </div>
    );
  }
  if (block.type === 'table') {
    return wrapper(
      <div>
        <div className="flex gap-2 mb-2 items-center">
          <select className="input !py-1 text-xs !w-auto" value={block.source} onChange={(e) => ops.updateBlock(block.id, { source: e.target.value as any })}>
            {TABLE_CATALOG.map((s) => <option key={s.v} value={s.v}>{s.cat} — {s.label}</option>)}
          </select>
          <input className="input !py-1 text-xs flex-1" placeholder="Titre du tableau (optionnel)" value={block.title ?? ''} onChange={(e) => ops.updateBlock(block.id, { title: e.target.value })} />
        </div>
        <TablePreview source={block.source} data={data} palette={palette} title={block.title} />
      </div>
    );
  }
  if (block.type === 'dashboard') {
    return wrapper(
      <div>
        <div className="flex gap-2 mb-2 items-center">
          <select className="input !py-1 text-xs !w-auto max-w-[280px]" value={block.dashboardId} onChange={(e) => ops.updateBlock(block.id, { dashboardId: e.target.value })}>
            {DASHBOARD_CATALOG.map((d) => <option key={d.id} value={d.id}>{d.cat} — {d.name}</option>)}
          </select>
          <input className="input !py-1 text-xs flex-1" placeholder="Titre (optionnel)" value={block.title ?? ''} onChange={(e) => ops.updateBlock(block.id, { title: e.target.value })} />
        </div>
        <DashboardSnippet id={block.dashboardId} data={data} palette={palette} />
      </div>
    );
  }
  if (block.type === 'pageBreak') {
    return (
      <div className="my-3 text-center text-[10px] text-primary-400 border-t-2 border-dashed border-primary-300 dark:border-primary-700 pt-1 group relative">
        {Controls}— Saut de page —
      </div>
    );
  }
  return null;
}

// ─── PREVIEW DES TABLES (tronquées) ──────────────────────────────
function TablePreview({ source, data, palette, title }: any) {
  const head: string[] = [];
  let body: any[][] = [];
  switch (source) {
    case 'bilan_actif': head.push('Code', 'Poste', 'Montant'); body = data.bilanActif.slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'bilan_passif': head.push('Code', 'Poste', 'Montant'); body = data.bilanPassif.slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'cr': head.push('Code', 'Poste', 'Montant'); body = data.cr.slice(0, 14).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'sig': head.push('Solde', 'Valeur'); body = [['Marge brute', fmtFull(data.sig?.margeBrute ?? 0)], ['VA', fmtFull(data.sig?.valeurAjoutee ?? 0)], ['EBE', fmtFull(data.sig?.ebe ?? 0)], ['Résultat exploitation', fmtFull(data.sig?.re ?? 0)], ['Résultat net', fmtFull(data.sig?.resultat ?? 0)]]; break;
    case 'balance': {
      head.push('Compte', 'Libellé', 'Solde D', 'Solde C');
      // Filtrer les comptes sans solde (mouvements = 0)
      const filtered = data.balance.filter((r: any) => Math.abs(r.soldeD) > 0.01 || Math.abs(r.soldeC) > 0.01);
      body = filtered.slice(0, 30).map((r: any) => [r.account, r.label, r.soldeD ? fmtFull(r.soldeD) : '', r.soldeC ? fmtFull(r.soldeC) : '']);
      break;
    }
    case 'ratios': head.push('Ratio', 'Valeur', 'Cible', 'Statut'); body = data.ratios.slice(0, 10).map((r: any) => [r.label, r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`, `${r.target}`, r.status === 'good' ? 'OK' : r.status === 'warn' ? '--' : '!!']); break;
    case 'budget_actual': {
      head.push('Compte', 'Réalisé', 'Budget', 'Écart', 'Var %');
      // Filtrer : exclure les comptes sans aucun mouvement (réalisé=0 ET budget=0)
      const filtered = (data.budgetActual ?? []).filter((r: any) =>
        Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01
      );
      body = filtered.slice(0, 30).map((r: any) => [r.label, fmtFull(r.realise), fmtFull(r.budget), fmtFull(r.ecart), r.ecartPct ? `${r.ecartPct.toFixed(1)}%` : '—']);
      break;
    }
    case 'capital': head.push('Rubrique', 'Ouverture', 'Augm.', 'Clôture'); body = (data.capital ?? []).map((m: any) => [m.rubrique, fmtFull(m.ouverture), m.augmentation ? '+' + fmtFull(m.augmentation) : '—', fmtFull(m.cloture)]); break;
    case 'tft': head.push('Code', 'Poste', 'Montant'); body = (data.tft ?? []).slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'cr_monthly': {
      const mcr = data.monthlyCR;
      if (mcr?.lines?.length) {
        head.push('Poste', ...mcr.months.slice(0, 6), 'YTD');
        body = mcr.lines.filter((l: any) => l.total || l.grand).slice(0, 10).map((l: any) => [
          l.label, ...l.values.slice(0, 6).map((v: number) => fmtFull(v)), fmtFull(l.ytd),
        ]);
      } else {
        head.push('Poste', 'Jan', 'Fév', 'Mar', 'Total');
        body = [['CA', '—', '—', '—', fmtFull(data.sig?.ca ?? 0)], ['RN', '—', '—', '—', fmtFull(data.sig?.resultat ?? 0)]];
      }
      break;
    }
    case 'bilan_monthly': {
      const mb = data.monthlyBilan;
      if (mb?.actif?.length) {
        head.push('Poste', ...mb.months.slice(0, 6), 'Fin');
        body = mb.actif.filter((l: any) => l.total || l.grand).slice(0, 8).map((l: any) => [
          l.label, ...l.values.slice(0, 6).map((v: number) => fmtFull(v)), fmtFull(l.ytd),
        ]);
      } else {
        head.push('Poste', 'Valeur'); body = data.bilanActif.slice(0, 8).map((l: any) => [l.label, fmtFull(l.value)]);
      }
      break;
    }
    case 'budget_monthly': {
      head.push('Section', 'Actual Mois', 'Budget Mois', 'N-1 Mois', 'Actual YTD', 'Budget YTD');
      const ba = data.budgetActual ?? [];
      const produits = ba.filter((r: any) => r.code?.startsWith('7'));
      const charges = ba.filter((r: any) => r.code?.startsWith('6'));
      const totProdR = produits.reduce((s: number, r: any) => s + r.realise, 0);
      const totProdB = produits.reduce((s: number, r: any) => s + r.budget, 0);
      const totChR = charges.reduce((s: number, r: any) => s + r.realise, 0);
      const totChB = charges.reduce((s: number, r: any) => s + r.budget, 0);
      body = [
        ['Produits expl.', '—', '—', '—', fmtFull(totProdR), fmtFull(totProdB)],
        ['Charges expl.', '—', '—', '—', fmtFull(totChR), fmtFull(totChB)],
        ['Résultat', '—', '—', '—', fmtFull(totProdR - totChR), fmtFull(totProdB - totChB)],
      ];
      break;
    }
    default: {
      // CR bloc par période (crtab_*_m / _q / _s / _a)
      if (source.startsWith('crtab_')) {
        const BASE_PREFIXES: Record<string, string[]> = {
          produits_expl: ['70','71','72','73','74','75','781'],
          charges_expl: ['60','61','62','63','64','65','66','681','691'],
          produits_fin: ['77','786','797'],
          charges_fin: ['67','687','697'],
          produits_hao: ['82','84','86','88'],
          charges_hao: ['81','83','85'],
          impots: ['87','89'],
        };
        const parts = source.replace('crtab_', '').split('_');
        const suffix = parts[parts.length - 1]; // m=Monthly, q=Quarterly, s=Semestre, a=Annual
        const sectionKey = parts.slice(0, -1).join('_');
        const prefixes = BASE_PREFIXES[sectionKey] ?? [];

        // Détermine la fenêtre de mois selon le suffixe : on agrège depuis le
        // monthlyCR pour avoir la VRAIE valeur de la période (pas YTD).
        const monthCount = ({ m: 1, q: 3, s: 6, a: 12 } as Record<string, number>)[suffix] ?? 12;
        const periodLabel = ({ m: 'Mois', q: 'Trimestre', s: 'Semestre', a: 'Annuel' } as Record<string, string>)[suffix] ?? 'Période';
        const mcr = data.monthlyCR;
        // Index des mois actifs : on prend les `monthCount` derniers mois ayant
        // au moins un mouvement (sinon rapport sur Q1, Q2... selon la position).
        const activeMonths: number[] = [];
        if (mcr?.lines && mcr.lines.length > 0) {
          for (let mi = 11; mi >= 0; mi--) {
            const hasData = mcr.lines.some((l: any) => Math.abs(l.values?.[mi] ?? 0) > 0);
            if (hasData) activeMonths.unshift(mi);
            if (activeMonths.length >= monthCount) break;
          }
        }
        // Indices = derniers mois actifs (ex: pour quarterly, 3 derniers mois actifs)

        // Construction du tableau : pour chaque compte du CR, agrège le réalisé
        // sur les mois retenus + budget sur ces mois + N-1 sur ces mêmes mois.
        type Row = { code: string; label: string; realise: number; budget: number; n1: number; isCharge: boolean };
        const rowMap = new Map<string, Row>();
        if (mcr?.lines) {
          for (const line of mcr.lines) {
            const code = String(line.code || line.accountCodes || '');
            if (!prefixes.some((p: string) => code.startsWith(p))) continue;
            if (line.total || line.intermediate) continue;
            const r: Row = { code, label: line.label ?? code, realise: 0, budget: 0, n1: 0, isCharge: line.isCharge ?? /^[68]/.test(code) };
            for (const mi of activeMonths) {
              r.realise += line.values?.[mi] ?? 0;
              r.budget  += line.budgets?.[mi] ?? 0;
              r.n1      += line.previousYear?.[mi] ?? 0;
            }
            if (Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01 || Math.abs(r.n1) > 0.01) {
              rowMap.set(code, r);
            }
          }
        }
        // Fallback : si monthlyCR vide, retombe sur budgetActual YTD
        if (rowMap.size === 0) {
          const ba = data.budgetActual ?? [];
          for (const r of ba) {
            if (!prefixes.some((p: string) => r.code?.startsWith(p))) continue;
            if (Math.abs(r.realise) < 0.01 && Math.abs(r.budget) < 0.01) continue;
            rowMap.set(r.code, { code: r.code, label: r.label, realise: r.realise, budget: r.budget, n1: 0, isCharge: r.isCharge });
          }
        }
        const filtered = Array.from(rowMap.values()).sort((a, b) => a.code.localeCompare(b.code));

        // Sous-totaux SYSCOHADA pour la section
        const totR = filtered.reduce((s, r) => s + r.realise, 0);
        const totB = filtered.reduce((s, r) => s + r.budget, 0);
        const totN1 = filtered.reduce((s, r) => s + r.n1, 0);
        const ecartTot = totR - totB;
        const varN1Tot = totN1 ? ((totR - totN1) / Math.abs(totN1)) * 100 : 0;

        head.push('Compte', 'Libellé', `Réalisé ${periodLabel}`, `Budget`, 'Écart', 'Écart %', 'N-1', 'Var N-1 %');
        body = filtered.slice(0, 30).map((r) => {
          const ecart = r.realise - r.budget;
          const ecartPct = r.budget ? (ecart / Math.abs(r.budget)) * 100 : 0;
          const varN1 = r.n1 ? ((r.realise - r.n1) / Math.abs(r.n1)) * 100 : 0;
          return [
            r.code, r.label,
            fmtFull(r.realise), fmtFull(r.budget), fmtFull(ecart),
            r.budget ? `${ecartPct.toFixed(1)}%` : '—',
            r.n1 ? fmtFull(r.n1) : '—',
            r.n1 ? `${varN1.toFixed(1)}%` : '—',
          ];
        });
        // Ligne de TOTAL (sous-total intermédiaire SYSCOHADA)
        body.push([
          '─', `TOTAL ${sectionKey.toUpperCase()}`,
          fmtFull(totR), fmtFull(totB), fmtFull(ecartTot),
          totB ? `${((ecartTot / Math.abs(totB)) * 100).toFixed(1)}%` : '—',
          totN1 ? fmtFull(totN1) : '—',
          totN1 ? `${varN1Tot.toFixed(1)}%` : '—',
        ]);
      }
      break;
    }
  }
  return (
    <div>
      {title && <p className="text-xs font-semibold mb-1" style={{ color: palette.primary }}>{title}</p>}
      <table className="w-full text-xs">
        <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
          {head.map((h, i) => <th key={i} className="text-left py-1 px-2 first:rounded-l last:rounded-r">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
          {body.map((row, i) => (
            <tr key={i}>{row.map((c, j) => <td key={j} className={clsx('py-1 px-2', j === row.length - 1 && 'text-right num')}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9px] text-primary-400 italic mt-1">Aperçu tronqué — version complète dans le PDF</p>
    </div>
  );
}

function DashboardSnippet({ id, data, palette }: any) {
  const dash = DASHBOARD_CATALOG.find((d) => d.id === id);
  const kpis = (() => {
    if (id === 'home' || id === 'cp' || id === 'crblock' || id === 'is_bvsa' || id === 'is_bvsa_monthly' || id?.startsWith('crblock_')) return [
      { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
      { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
      { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
      { label: 'Marge brute', value: fmtMoney(data.sig?.margeBrute ?? 0) },
    ];
    if (id === 'cashflow') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      // VRAI cashflow : encaissements/décaissements totaux sur la période
      // (mouvements classe 5), pas le CA / résultat du CR.
      const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
      const totalIn = cf?.encaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0;
      const totalOut = cf?.decaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0;
      const netCash = totalIn - totalOut;
      return [
        { label: 'Total encaissé', value: fmtMoney(totalIn) },
        { label: 'Total décaissé', value: fmtMoney(totalOut) },
        { label: 'Trésorerie de clôture', value: fmtMoney(treso) },
        { label: 'Cash flow net', value: fmtMoney(netCash), subValue: totalIn > 0 ? `${((netCash / totalIn) * 100).toFixed(1)} % des encaissements` : '' },
      ];
    }
    if (id === 'receivables') {
      const ar = data.bilanActif?.find((l: any) => l.code === 'BH')?.value ?? 0;
      const ap = data.bilanPassif?.find((l: any) => l.code === 'DJ')?.value ?? 0;
      // VRAIS achats = sommes 60 (hors 603 var stocks) + 61 + 62 + 63
      // RA seul ne couvrait que les achats marchandises ; signe inversé.
      const balance = data.balance ?? [];
      const totalPurchases = balance
        .filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603'))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      return [
        { label: 'Ventes (CA HT)', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Créances clients', value: fmtMoney(ar) },
        { label: 'Achats consommés', value: fmtMoney(totalPurchases), subValue: 'Comptes 60-63 (hors var. stocks)' },
        { label: 'Dettes fournisseurs', value: fmtMoney(ap) },
      ];
    }
    if (id?.startsWith('crsec_') && data.budgetActual) {
      const sec = id.replace('crsec_', '');
      const prefixMap: Record<string, string[]> = {
        produits_expl: ['70','71','72','73','74','75'], charges_expl: ['60','61','62','63','64','65','66'],
        produits_fin: ['77'], charges_fin: ['67'],
        produits_hao: ['82','84','86','88'], charges_hao: ['81','83','85'],
        impots: ['87','89'],
      };
      const pfx = prefixMap[sec] ?? [];
      const subset = data.budgetActual.filter((r: any) => pfx.some((p) => r.code.startsWith(p)));
      const totR = subset.reduce((s: number, r: any) => s + r.realise, 0);
      const totB = subset.reduce((s: number, r: any) => s + r.budget, 0);
      return [
        { label: 'Réalisé', value: fmtMoney(totR) },
        { label: 'Budget', value: fmtMoney(totB) },
        { label: 'Écart', value: fmtMoney(totR - totB) },
        { label: 'Comptes', value: String(subset.length) },
      ];
    }
    if (id === 'ratios') return data.ratios.slice(0, 4).map((r: any) => ({ label: r.label, value: r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}` }));
    // ─── Dashboards Premium ★ ───
    if (id === 'exec') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const alertes = (data.ratios || []).filter((r: any) => r.status !== 'good').length;
      return [
        { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Alertes', value: `${alertes} ratio(s)` },
      ];
    }
    if (id === 'compliance') {
      // Géré séparément dans le rendu enrichi ci-dessous
      return [];
    }
    if (id === 'breakeven') {
      // Seuil de rentabilité SYSCOHADA = Charges fixes / Taux marge sur coûts variables
      // Charges FIXES typiques : Personnel (66) + Dotations amortissements (681)
      //                        + Loyers (622) + Assurances (625) + Charges financières (67)
      // Charges VARIABLES typiques : Achats (60 hors 603) + Transports/61 + Services A 62
      //                             + Impôts et taxes liés aux ventes (64) — en partie
      const ca = data.sig?.ca ?? 0;
      const balance = data.balance ?? [];
      const sumDebMoinsCre = (regex: RegExp) => balance
        .filter((r: any) => regex.test(r.account))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const personnel  = sumDebMoinsCre(/^66/);
      const loyers     = sumDebMoinsCre(/^622/);
      const assurances = sumDebMoinsCre(/^625/);
      const dotations  = sumDebMoinsCre(/^68/);
      const chFin      = sumDebMoinsCre(/^67/);
      const chargesFixes = personnel + loyers + assurances + dotations + chFin;
      // Charges variables = Achats consommés + transports + services ext (62 hors 622)
      const achats     = sumDebMoinsCre(/^60(?!3)/) + sumDebMoinsCre(/^603/); // achats + var stock
      const transports = sumDebMoinsCre(/^61/);
      const servExtA   = sumDebMoinsCre(/^62/) - loyers - assurances; // 62 hors 622 et 625
      const servExtB   = sumDebMoinsCre(/^63/);
      const chargesVariables = achats + transports + servExtA + servExtB;
      const margeCV = ca - chargesVariables;
      const tauxMargeCV = ca > 0 ? margeCV / ca : 0;
      const seuil = tauxMargeCV > 0 ? Math.round(chargesFixes / tauxMargeCV) : 0;
      const margeSec = ca - seuil;
      return [
        { label: 'CA', value: fmtMoney(ca), subValue: `Marge sur CV ${(tauxMargeCV * 100).toFixed(1)} %` },
        { label: 'Charges fixes', value: fmtMoney(chargesFixes), subValue: 'Pers + Loy + Ass + Dot + Fin' },
        { label: 'Seuil rentabilité', value: fmtMoney(seuil), subValue: 'CF / Taux marge CV' },
        { label: 'Marge sécurité', value: fmtMoney(margeSec), subValue: ca > 0 ? `${((margeSec / ca) * 100).toFixed(1)} % du CA` : '—' },
      ];
    }
    if (id === 'pareto') {
      // Géré séparément ci-dessous (rendu enrichi avec table)
      return [];
    }
    if (id === 'client') {
      const ca = data.sig?.ca ?? 0;
      const periodDays = (data as any).periodDays ?? 360;
      const balance = data.balance ?? [];
      // SYSCOHADA — décomposition correcte des créances clients :
      //   411/412/413/414/415/418 = créances saines (clients ordinaires + effets)
      //   416 = créances clients douteuses ou litigieuses
      //   491 = provisions pour dépréciation des comptes clients (contre-actif)
      // Encours BRUT = solde D 41x ; Encours NET = brut − provisions 491
      const sainesD = balance.filter((r: any) => /^41[1-58]/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const douteusesD = balance.filter((r: any) => r.account?.startsWith('416')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const provisions = balance.filter((r: any) => r.account?.startsWith('491')).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const encoursBrut = sainesD + douteusesD;
      const encoursNet = encoursBrut - provisions;
      // Pertes sur créances de l'exercice (compte 6 partagé : 6541 + 6594)
      const pertesIrrec = balance.filter((r: any) => /^(6541|6594|654)/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      // DSO sur encours NET (convention) et CA TTC du période
      // Taux TVA fixé à 18 % (norme UEMOA SYSCOHADA). Dériver du solde 443
      // donne un taux faussé car le solde 443 est minoré dès qu'une déclaration
      // a été déposée et payée en cours de période.
      const caTTC = ca * 1.18;
      const dso = caTTC > 0 ? Math.round((encoursNet / caTTC) * periodDays) : 0;
      return [
        { label: 'Encours net (411 − 491)', value: fmtMoney(encoursNet), subValue: `Brut ${fmtMoney(encoursBrut)} − prov ${fmtMoney(provisions)}` },
        { label: 'DSO', value: caTTC > 0 ? `${dso} j` : 'n.a.' },
        { label: 'Dont douteux (416)', value: fmtMoney(douteusesD), subValue: encoursBrut > 0 ? `${((douteusesD / encoursBrut) * 100).toFixed(1)} % du brut` : '—' },
        { label: 'Pertes sur créances', value: fmtMoney(pertesIrrec), subValue: 'Comptes 654/6594 (charge)' },
      ];
    }
    if (id === 'fr') {
      const balance = data.balance ?? [];
      const periodDays = (data as any).periodDays ?? 360;
      // SYSCOHADA — décomposition correcte des dettes fournisseurs :
      //   401/403/408 = fournisseurs ordinaires + effets + factures non parvenues
      //   481 = fournisseurs d'investissement
      //   492 = provisions sur fournisseurs débiteurs (à isoler)
      const dettesNettes = balance.filter((r: any) => /^40/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const fnp = balance.filter((r: any) => /^408/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const effetsAPayer = balance.filter((r: any) => /^403/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      // Achats HT (hors variations stocks 603)
      const achatsHT = balance
        .filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603'))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      // Taux TVA fixé à 18 % (UEMOA) pour ne pas se faire piéger par un solde
      // 445 minoré post-déclaration.
      const achatsTTC = achatsHT * 1.18;
      const dpo = achatsTTC > 0 ? Math.round((dettesNettes / achatsTTC) * periodDays) : 0;
      return [
        { label: 'Dettes fournisseurs (40x)', value: fmtMoney(dettesNettes), subValue: `dont effets ${fmtMoney(effetsAPayer)}` },
        { label: 'DPO', value: achatsTTC > 0 ? `${dpo} j` : 'n.a.' },
        { label: 'Achats N (60-63 HT)', value: fmtMoney(achatsHT), subValue: `TTC ${fmtMoney(achatsTTC)}` },
        { label: 'Factures non parvenues (408)', value: fmtMoney(fnp), subValue: 'Provision charges courues' },
      ];
    }
    if (id === 'cashforecast') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      // Projection 13 sem = moyenne mensuelle des vrais flux × 3 mois (~13 sem)
      const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
      const monthsActifs = (cf?.encaissements ?? []).filter((v: number) => v > 0).length || 1;
      const moyEnc = (cf?.encaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0) / monthsActifs;
      const moyDec = (cf?.decaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0) / monthsActifs;
      const projEnc = moyEnc * 3;
      const projDec = moyDec * 3;
      return [
        { label: 'Cash actuel', value: fmtMoney(treso) },
        { label: 'Horizon', value: '13 semaines' },
        { label: 'Encaissements prévus', value: fmtMoney(projEnc), subValue: 'Moyenne 3 mois × 3' },
        { label: 'Décaissements prévus', value: fmtMoney(projDec), subValue: 'Moyenne 3 mois × 3' },
      ];
    }
    if (id === 'waterfall') {
      return [
        { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Marge brute', value: fmtMoney(data.sig?.margeBrute ?? 0) },
        { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
        { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
      ];
    }
    if (id === 'sal') {
      const balance = data.balance || [];
      // Masse salariale = soldeD − soldeC (cohérent avec le reste du moteur)
      const compte66 = balance.filter((r: any) => r.account?.startsWith('66'));
      const masse = compte66.reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const charges66 = balance.filter((r: any) => r.account?.startsWith('663') || r.account?.startsWith('664')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const remBrutes = balance.filter((r: any) => r.account?.startsWith('661') || r.account?.startsWith('662')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const ratio = data.sig?.ca ? (masse / data.sig.ca) * 100 : 0;
      const tauxCharges = remBrutes > 0 ? (charges66 / remBrutes) * 100 : 0;
      return [
        { label: 'Masse salariale (66)', value: fmtMoney(masse), subValue: `${compte66.length} comptes` },
        { label: 'Ratio masse / CA', value: `${ratio.toFixed(1)} %`, subValue: 'Indicateur productivité' },
        { label: 'Rém. brutes (661-662)', value: fmtMoney(remBrutes) },
        { label: 'Charges sociales', value: fmtMoney(charges66), subValue: `${tauxCharges.toFixed(1)} % des brutes` },
      ];
    }
    if (id === 'bfr') {
      // Cohérent avec le rendu graphique : BFR = Total Actif Circulant (_BK) − Total Passif Circulant (_DP)
      // FR = Ressources stables (_DF) − Actif immobilisé (_AZ)
      // TN = Trésorerie active (_BT) − Trésorerie passive (DV) = FR − BFR
      const a = data.bilanActif ?? [];
      const p = data.bilanPassif ?? [];
      const get = (lines: any[], c: string) => lines.find((l: any) => l.code === c)?.value ?? 0;
      const actifCirc = get(a, '_BK');
      const passifCirc = get(p, '_DP');
      const fr = get(p, '_DF') - get(a, '_AZ');
      const bfr = actifCirc - passifCirc;
      const tn = get(a, '_BT') - get(p, 'DV');
      return [
        { label: 'FR (Fonds roulement)', value: fmtMoney(fr), subValue: 'Ress. stables − Actif immo' },
        { label: 'BFR', value: fmtMoney(bfr), subValue: 'Actif circ. − Passif circ.' },
        { label: 'TN (Trésorerie nette)', value: fmtMoney(tn), subValue: 'Trés. active − Trés. passive' },
        { label: 'Vérification', value: Math.abs(fr - bfr - tn) < 1 ? '✓ FR = BFR + TN' : `⚠ écart ${fmtMoney(fr - bfr - tn)}` },
      ];
    }
    if (id === 'analytical') {
      // Évite l'affichage si pas de données
      return [
        { label: 'Status', value: data.hasAnalytical ? 'Données disponibles' : 'Aucune donnée' },
        { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Résultat', value: fmtMoney(data.sig?.resultat ?? 0) },
        { label: 'Voir page Analytique', value: '→' },
      ];
    }

    // ─── Helper : agrégation balance par préfixe ───
    const balance = data.balance ?? [];
    const sumD = (...prefixes: string[]) => balance.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
    const sumC = (...prefixes: string[]) => balance.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);

    // ─── DASHBOARDS STANDARD ───
    if (id === 'stk') {
      const stocksMP = sumD('32');
      const stocksProd = sumD('33', '34', '35');
      const stocksMarch = sumD('31');
      const provStk = sumC('39');
      const total = stocksMP + stocksProd + stocksMarch;
      const ca = data.sig?.ca ?? 0;
      const rotation = total > 0 ? Math.round((ca / total) * 1) : 0;
      return [
        { label: 'Stocks marchandises', value: fmtMoney(stocksMarch), subValue: 'Compte 31' },
        { label: 'Stocks MP & fournitures', value: fmtMoney(stocksMP), subValue: 'Compte 32' },
        { label: 'Stocks produits', value: fmtMoney(stocksProd), subValue: 'Comptes 33-35' },
        { label: 'Provisions stocks', value: fmtMoney(provStk), subValue: `Rotation ${rotation}× / an` },
      ];
    }
    if (id === 'immo') {
      const immoBrut = sumD('20', '21', '22', '23', '24', '25');
      const immoFin = sumD('26', '27');
      const amorts = sumC('28');
      const provImmo = sumC('29');
      const vnc = immoBrut + immoFin - amorts - provImmo;
      const tauxAmort = immoBrut > 0 ? (amorts / immoBrut) * 100 : 0;
      return [
        { label: 'Immo. brutes', value: fmtMoney(immoBrut + immoFin), subValue: 'Comptes 20-27' },
        { label: 'Amortissements', value: fmtMoney(amorts), subValue: `${tauxAmort.toFixed(1)} % vétusté` },
        { label: 'VNC', value: fmtMoney(vnc), subValue: 'Net brut − amorts − prov' },
        { label: 'Provisions', value: fmtMoney(provImmo), subValue: 'Compte 29' },
      ];
    }
    if (id === 'tre') {
      const banques = sumD('52', '53', '54');
      const caisse = sumD('57');
      const decouvert = sumC('56');
      const treso = banques + caisse - decouvert;
      const ca = data.sig?.ca ?? 0;
      const joursTreso = ca > 0 ? Math.round((treso / ca) * 360) : 0;
      return [
        { label: 'Trésorerie nette', value: fmtMoney(treso), subValue: 'Banques + caisse − découvert' },
        { label: 'Banques (52-54)', value: fmtMoney(banques) },
        { label: 'Caisse (57)', value: fmtMoney(caisse) },
        { label: 'Découverts (56)', value: fmtMoney(decouvert), subValue: `Trés. = ${joursTreso}j de CA` },
      ];
    }
    if (id === 'fis') {
      const tvaCol = sumC('443');
      const tvaDed = sumD('445');
      const tvaAPayer = tvaCol - tvaDed;
      const isDu = sumC('441');
      const taxes = sumD('64');
      const ca = data.sig?.ca ?? 0;
      const pressionFis = ca > 0 ? ((tvaAPayer + isDu + taxes) / ca) * 100 : 0;
      return [
        { label: 'TVA collectée (443)', value: fmtMoney(tvaCol) },
        { label: 'TVA déductible (445)', value: fmtMoney(tvaDed), subValue: `À payer ${fmtMoney(tvaAPayer)}` },
        { label: 'IS dû (441)', value: fmtMoney(isDu) },
        { label: 'Impôts & taxes (64)', value: fmtMoney(taxes), subValue: `Pression ${pressionFis.toFixed(1)} %` },
      ];
    }

    // ─── DASHBOARDS SECTORIELS ───
    const ca = data.sig?.ca ?? 0;
    const rn = data.sig?.resultat ?? 0;
    if (id === 'ind') {
      const achatsMP = sumD('602', '604', '605');
      const prodImmob = sumC('72');
      const margeIndus = ca - achatsMP;
      return [
        { label: 'CA industriel', value: fmtMoney(ca) },
        { label: 'Achats MP', value: fmtMoney(achatsMP), subValue: ca > 0 ? `${((achatsMP / ca) * 100).toFixed(1)} % du CA` : '—' },
        { label: 'Marge industrielle', value: fmtMoney(margeIndus), subValue: ca > 0 ? `${((margeIndus / ca) * 100).toFixed(1)} %` : '—' },
        { label: 'Production immobilisée', value: fmtMoney(prodImmob), subValue: 'Compte 72' },
      ];
    }
    if (id === 'btp') {
      const sousTraitance = sumD('604', '611');
      const travauxEnCours = sumD('335');
      const ratioSousTr = ca > 0 ? (sousTraitance / ca) * 100 : 0;
      return [
        { label: 'CA travaux', value: fmtMoney(ca) },
        { label: 'Sous-traitance', value: fmtMoney(sousTraitance), subValue: `${ratioSousTr.toFixed(1)} % du CA` },
        { label: 'Travaux en cours', value: fmtMoney(travauxEnCours), subValue: 'Compte 335' },
        { label: 'Résultat chantiers', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn / ca) * 100).toFixed(1)} % marge` : '—' },
      ];
    }
    if (id === 'com') {
      const ventesMarch = sumC('701');
      const achatsMarch = sumD('601');
      const margeCom = ventesMarch - achatsMarch;
      const tauxMarque = ventesMarch > 0 ? (margeCom / ventesMarch) * 100 : 0;
      const tauxMarge = achatsMarch > 0 ? (margeCom / achatsMarch) * 100 : 0;
      return [
        { label: 'Ventes marchandises', value: fmtMoney(ventesMarch), subValue: 'Compte 701' },
        { label: 'Achats marchandises', value: fmtMoney(achatsMarch), subValue: 'Compte 601' },
        { label: 'Marge commerciale', value: fmtMoney(margeCom) },
        { label: 'Taux marque / marge', value: `${tauxMarque.toFixed(1)} % / ${tauxMarge.toFixed(1)} %`, subValue: 'Marque/Vente · Marge/Achat' },
      ];
    }
    if (id === 'mfi') {
      const interets = sumC('77');
      const encours = sumD('41', '42', '46');
      const provDouteux = sumC('491', '496');
      const par = encours > 0 ? (provDouteux / encours) * 100 : 0;
      return [
        { label: 'PNB (intérêts perçus)', value: fmtMoney(interets), subValue: 'Compte 77' },
        { label: 'Encours total', value: fmtMoney(encours), subValue: 'Comptes 41, 42, 46' },
        { label: 'Provisions douteux', value: fmtMoney(provDouteux), subValue: 'Comptes 491, 496' },
        { label: 'PAR (Portfolio at Risk)', value: `${par.toFixed(2)} %`, subValue: 'Provisions / Encours' },
      ];
    }
    if (id === 'imco') {
      const loyers = sumC('706', '707');
      const chargesLoc = sumD('614', '615');
      const valImmo = sumD('22', '23');
      const renta = valImmo > 0 ? (loyers / valImmo) * 100 : 0;
      return [
        { label: 'Loyers perçus', value: fmtMoney(loyers), subValue: 'Comptes 706/707' },
        { label: 'Charges locatives', value: fmtMoney(chargesLoc), subValue: 'Comptes 614/615' },
        { label: 'Valeur immobilière', value: fmtMoney(valImmo), subValue: 'Terrains + bâtiments' },
        { label: 'Rentabilité brute', value: `${renta.toFixed(2)} %`, subValue: 'Loyers / Val. immo' },
      ];
    }
    if (id === 'hot') {
      const ventesHeb = sumC('706');
      const ventesFB = sumC('707');
      const ratioFB = ca > 0 ? (ventesFB / ca) * 100 : 0;
      return [
        { label: 'Ventes hébergement', value: fmtMoney(ventesHeb), subValue: 'Compte 706' },
        { label: 'Ventes F&B', value: fmtMoney(ventesFB), subValue: `${ratioFB.toFixed(1)} % du CA` },
        { label: 'CA total', value: fmtMoney(ca) },
        { label: 'GOP (RN)', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn / ca) * 100).toFixed(1)} % CA` : '—' },
      ];
    }
    if (id === 'agri') {
      const intrants = sumD('602', '604', '605');
      const subvAgri = sumC('71');
      const margeAgri = ca - intrants;
      return [
        { label: 'CA récoltes', value: fmtMoney(ca) },
        { label: 'Intrants', value: fmtMoney(intrants), subValue: 'Semences, engrais, phyto' },
        { label: 'Marge agricole', value: fmtMoney(margeAgri) },
        { label: "Subventions d'exploitation", value: fmtMoney(subvAgri), subValue: 'Compte 71' },
      ];
    }
    if (id === 'sante') {
      const honoraires = sumC('706');
      const personnel = sumD('66');
      const ratioPers = ca > 0 ? (personnel / ca) * 100 : 0;
      return [
        { label: 'Honoraires & actes', value: fmtMoney(honoraires), subValue: 'Compte 706' },
        { label: 'Personnel soignant', value: fmtMoney(personnel), subValue: `${ratioPers.toFixed(1)} % du CA` },
        { label: 'CA total', value: fmtMoney(ca) },
        { label: 'Marge nette', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn / ca) * 100).toFixed(1)} %` : '—' },
      ];
    }
    if (id === 'transp') {
      const carburant = sumD('6051', '6052');
      const flotte = sumD('245');
      const ratioCarb = ca > 0 ? (carburant / ca) * 100 : 0;
      return [
        { label: 'CA transport', value: fmtMoney(ca) },
        { label: 'Carburant', value: fmtMoney(carburant), subValue: `${ratioCarb.toFixed(1)} % du CA` },
        { label: 'Valeur flotte', value: fmtMoney(flotte), subValue: 'Compte 245 matériel transport' },
        { label: 'Marge', value: fmtMoney(rn) },
      ];
    }
    if (id === 'serv') {
      const honoraires = sumC('706', '708');
      const personnel = sumD('66');
      const tauxFact = personnel > 0 ? (honoraires / personnel) : 0;
      return [
        { label: 'Honoraires', value: fmtMoney(honoraires), subValue: 'Comptes 706, 708' },
        { label: 'Personnel facturable', value: fmtMoney(personnel) },
        { label: 'Taux facturable', value: `${tauxFact.toFixed(2)}×`, subValue: 'Honoraires / Personnel' },
        { label: 'Marge projets', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn / ca) * 100).toFixed(1)} %` : '—' },
      ];
    }

    // ─── DASHBOARDS ANALYTIQUES ───
    if (id === 'ana_centres' || id === 'ana_projets' || id === 'ana_axes') {
      return [
        { label: 'CA total', value: fmtMoney(ca) },
        { label: 'Résultat', value: fmtMoney(rn) },
        { label: 'Données analytiques', value: data.hasAnalytical ? '✓ Disponibles' : '⚠ Non saisies' },
        { label: 'Voir page Analytique', value: '→ /analytical' },
      ];
    }

    // ─── ÉTATS SYSCOHADA + REPORTING AVANCÉ (Phase 4) ───
    if (id === 'tafire') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const caf = (data.sig?.resultat ?? 0) + sumD('68') - sumC('78');
      return [
        { label: 'CAF', value: fmtMoney(caf), subValue: 'RN + dotations - reprises' },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Référence', value: 'Art. 29-37 SYSCOHADA' },
      ];
    }
    if (id === 'bilan_monthly') {
      const totA = data.bilanActif?.find((l: any) => l.code === '_BZ')?.value ?? 0;
      const totP = data.bilanPassif?.find((l: any) => l.code === '_DZ')?.value ?? 0;
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'Total Actif', value: fmtMoney(totA) },
        { label: 'Total Passif', value: fmtMoney(totP) },
        { label: 'Capitaux propres', value: fmtMoney(cp), subValue: totA > 0 ? `${((cp/totA)*100).toFixed(1)}% du total` : '—' },
        { label: 'Équilibre', value: Math.abs(totA - totP) < 1 ? '✓ OK' : '⚠ écart' },
      ];
    }
    if (id === 'caf') {
      const caf = (data.sig?.resultat ?? 0) + sumD('68') - sumC('78');
      const tauxCAF = ca > 0 ? (caf / ca) * 100 : 0;
      return [
        { label: 'CAF exercice', value: fmtMoney(caf), subValue: 'RN + dotations - reprises' },
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Taux CAF / CA', value: `${tauxCAF.toFixed(1)} %` },
        { label: 'Résultat net', value: fmtMoney(rn) },
      ];
    }
    if (id === 'multi_year') {
      return [
        { label: 'CA N', value: fmtMoney(ca) },
        { label: 'RN N', value: fmtMoney(rn) },
        { label: 'EBE N', value: fmtMoney(data.sig?.ebe ?? 0) },
        { label: 'Comparaison', value: 'N / N-1 / N-2 / N-3' },
      ];
    }
    if (id === 'bank_recon') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const banques = sumD('52');
      return [
        { label: 'Solde GL banques (52)', value: fmtMoney(banques) },
        { label: 'Trésorerie active', value: fmtMoney(treso) },
        { label: 'Suspens à régulariser', value: fmtMoney(treso - banques) },
        { label: 'Statut', value: Math.abs(treso - banques) < 1 ? '✓ Rapproché' : '⚠ Écart' },
      ];
    }
    if (id === 'closing_just') {
      const provisions = sumC('19');
      const cca = sumD('476');
      const pca = sumC('477');
      const fae = sumD('418');
      return [
        { label: 'Provisions risques (19)', value: fmtMoney(provisions) },
        { label: 'CCA (476)', value: fmtMoney(cca), subValue: 'Charges constatées d\'avance' },
        { label: 'PCA (477)', value: fmtMoney(pca), subValue: 'Produits constatés d\'avance' },
        { label: 'FAE (418)', value: fmtMoney(fae), subValue: 'Factures à établir' },
      ];
    }
    if (id === 'audit_visu') {
      const total = (data.glCount ?? data.balance?.length ?? 0);
      return [
        { label: 'Écritures GL', value: String(total) },
        { label: 'Hash chain', value: 'SHA-256' },
        { label: 'Méthode', value: 'Web Crypto API' },
        { label: 'Voir intégrité', value: '→ /dashboard/audit-trail' },
      ];
    }
    if (id === 'anomalies') {
      const ratios = data.ratios ?? [];
      const alertes = ratios.filter((r: any) => r.status === 'alert').length;
      const warn = ratios.filter((r: any) => r.status === 'warn').length;
      return [
        { label: 'Alertes critiques', value: String(alertes) },
        { label: 'Vigilance', value: String(warn) },
        { label: 'Conformes', value: String(ratios.length - alertes - warn) },
        { label: 'Voir heatmap', value: '→ /dashboard/anomalies' },
      ];
    }
    if (id === 'lettrage') {
      const clients = sumD('41');
      const fournisseurs = sumC('40');
      return [
        { label: 'Encours clients (41)', value: fmtMoney(clients) },
        { label: 'Encours fournisseurs (40)', value: fmtMoney(fournisseurs) },
        { label: 'Voir taux', value: '→ /dashboard/lettrage' },
        { label: 'Vieillissement', value: '0-30 / 30-60 / 60-90 / 90+ j' },
      ];
    }
    if (id === 'zscore') {
      // Z-Score Altman simplifié
      const a = data.bilanActif ?? [];
      const p = data.bilanPassif ?? [];
      const get = (lines: any[], c: string) => lines.find((l: any) => l.code === c)?.value ?? 0;
      const totA = get(a, '_BZ');
      const cp = get(p, '_CP');
      const ratioCP = totA > 0 ? (cp / totA) * 100 : 0;
      return [
        { label: 'Autonomie financière', value: `${ratioCP.toFixed(1)} %`, subValue: 'CP / Total Actif' },
        { label: 'Marge nette', value: ca > 0 ? `${((rn / ca) * 100).toFixed(1)} %` : '—' },
        { label: 'Score Cockpit', value: '0-100', subValue: 'Voir détail' },
        { label: 'Famille', value: 'Rentabilité, Liquidité, Structure, Activité' },
      ];
    }
    if (id === 'forecast') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      return [
        { label: 'Cash actuel', value: fmtMoney(treso) },
        { label: 'Horizon 30 j', value: 'Projection' },
        { label: 'Horizon 60 j', value: 'Projection' },
        { label: 'Horizon 90 j', value: 'Projection' },
      ];
    }
    if (id === 'wcd') {
      const ca = data.sig?.ca ?? 0;
      const periodDays = (data as any).periodDays ?? 360;
      const stocks = data.bilanActif?.find((l: any) => l.code === 'BB')?.value ?? 0;
      const creances = data.bilanActif?.find((l: any) => l.code === 'BH')?.value ?? 0;
      const dettes = sumC('40');
      const achats = balance.filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const dso = ca > 0 ? Math.round((creances / (ca * 1.18)) * periodDays) : 0;
      const dio = ca > 0 ? Math.round((stocks / ca) * periodDays) : 0;
      const dpo = achats > 0 ? Math.round((dettes / (achats * 1.18)) * periodDays) : 0;
      return [
        { label: 'DSO', value: `${dso} j`, subValue: 'Délai clients' },
        { label: 'DIO', value: `${dio} j`, subValue: 'Délai stocks' },
        { label: 'DPO', value: `${dpo} j`, subValue: 'Délai fournisseurs' },
        { label: 'CCC', value: `${dso + dio - dpo} j`, subValue: 'Cash Conversion Cycle' },
      ];
    }
    if (id === 'tft_monthly') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      return [
        { label: 'Trésorerie clôture', value: fmtMoney(treso) },
        { label: 'Période', value: '12 mois' },
        { label: 'Sections', value: 'Exploit / Invest / Financ' },
        { label: 'Référence', value: 'SYSCOHADA art. 38' },
      ];
    }
    if (id === 'cap_var') {
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'Capitaux propres', value: fmtMoney(cp) },
        { label: 'Résultat de l\'exercice', value: fmtMoney(rn) },
        { label: 'Mouvements', value: 'Apports + Distributions + Affectation' },
        { label: 'État obligatoire', value: 'SYSCOHADA' },
      ];
    }
    if (id === 'closing_pack') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const alertes = (data.ratios || []).filter((r: any) => r.status === 'alert').length;
      return [
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Alertes', value: String(alertes) },
      ];
    }
    if (id === 'seasonality') {
      const monthly = (data as any).monthlyCA ?? [];
      const avg = monthly.length > 0 ? monthly.reduce((s: number, m: any) => s + (m.realise ?? 0), 0) / monthly.length : 0;
      const max = monthly.length > 0 ? Math.max(...monthly.map((m: any) => m.realise ?? 0)) : 0;
      const min = monthly.length > 0 ? Math.min(...monthly.map((m: any) => m.realise ?? 0)) : 0;
      return [
        { label: 'CA moyen mensuel', value: fmtMoney(avg) },
        { label: 'Pic max', value: fmtMoney(max), subValue: avg > 0 ? `Index ${((max/avg)*100).toFixed(0)}` : '—' },
        { label: 'Creux min', value: fmtMoney(min), subValue: avg > 0 ? `Index ${((min/avg)*100).toFixed(0)}` : '—' },
        { label: 'Amplitude', value: avg > 0 ? `${(((max-min)/avg)*100).toFixed(0)} %` : '—' },
      ];
    }
    if (id === 'whatif') {
      return [
        { label: 'CA actuel', value: fmtMoney(ca) },
        { label: 'Marge actuelle', value: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
        { label: 'Charges actuelles', value: fmtMoney(ca - rn) },
        { label: 'Simulation', value: '→ /dashboard/whatif' },
      ];
    }
    if (id === 'provisions') {
      const dotations = sumD('68');
      const reprises = sumC('78');
      return [
        { label: 'Dotations (68)', value: fmtMoney(dotations) },
        { label: 'Reprises (78)', value: fmtMoney(reprises) },
        { label: 'Solde net', value: fmtMoney(dotations - reprises) },
        { label: 'Impact résultat', value: fmtMoney(-(dotations - reprises)), subValue: 'Charge nette' },
      ];
    }
    if (id === 'intercos') {
      const avances = sumC('167');
      const titres = sumD('267');
      const cca = sumD('4561');
      const intra = sumD('462') - sumC('463');
      return [
        { label: 'Avances reçues (167)', value: fmtMoney(avances) },
        { label: 'Titres participation (267)', value: fmtMoney(titres) },
        { label: 'Apports CCA (4561)', value: fmtMoney(cca) },
        { label: 'Solde net intra-groupe', value: fmtMoney(intra) },
      ];
    }
    if (id === 'weekly') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const alertes = (data.ratios || []).filter((r: any) => r.status !== 'good').length;
      return [
        { label: 'CA YTD', value: fmtMoney(ca) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Résultat', value: fmtMoney(rn) },
        { label: 'Alertes', value: `${alertes} / ${(data.ratios || []).length}` },
      ];
    }
    if (id === 'mda') {
      return [
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Marge nette', value: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
        { label: 'Narratif', value: 'Auto-généré' },
      ];
    }
    if (id === 'board_pack') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Capitaux propres', value: fmtMoney(cp) },
      ];
    }
    if (id === 'sector_bench') {
      const ratios = data.ratios ?? [];
      const conformes = ratios.filter((r: any) => r.status === 'good').length;
      return [
        { label: 'Score sectoriel', value: `${conformes} / ${ratios.length}` },
        { label: 'Secteur', value: data.org?.sector ?? 'Commerce' },
        { label: 'Référentiel', value: 'UEMOA OHADA' },
        { label: 'Voir détail', value: '→ /dashboard/sector-benchmark' },
      ];
    }

    return [{ label: 'CA', value: fmtMoney(ca) }, { label: 'RN', value: fmtMoney(rn) }];
  })();

  // ─── Rendu enrichi avec mini-graphiques ───

  // STRUCTURE DE L'ACTIF — donut + table
  if (id === 'struct_actif') {
    const a = data.bilanActif ?? [];
    const get = (c: string) => a.find((l: any) => l.code === c)?.value ?? 0;
    const totA = get('_BZ') || a.reduce((s: number, l: any) => l.code?.startsWith('_') ? s : s + (l.value || 0), 0);
    const items = [
      { label: 'Actif immobilisé', value: get('_AZ'), color: palette.primary },
      { label: 'Stocks', value: get('BB'), color: '#d97706' },
      { label: 'Créances clients', value: get('BH'), color: '#0891b2' },
      { label: 'Autres créances', value: get('BI'), color: '#7c3aed' },
      { label: 'Trésorerie active', value: get('_BT'), color: '#16a34a' },
      { label: 'Comptes non classés', value: get('_EC'), color: '#a3a3a3' },
    ].filter((it) => Math.abs(it.value) > 0.01);
    const totalCalc = items.reduce((s, it) => s + it.value, 0) || totA || 1;
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3">
          {/* Donut SVG */}
          <div className="col-span-1 flex flex-col items-center justify-center">
            {(() => {
              let cumPct = 0;
              const r = 50, cx = 70, cy = 70;
              return (
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {items.map((it, i) => {
                    const pct = it.value / totalCalc;
                    const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    cumPct += pct;
                    const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    const x1 = cx + r * Math.cos(startAngle);
                    const y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle);
                    const y2 = cy + r * Math.sin(endAngle);
                    const largeArc = pct > 0.5 ? 1 : 0;
                    return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={it.color} stroke="#fff" strokeWidth="1" />;
                  })}
                  <circle cx={cx} cy={cy} r={26} fill="#fff" />
                  <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill={palette.primary} fontWeight="bold">TOTAL</text>
                  <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill={palette.primary}>{Math.round(totalCalc / 1_000_000)}M</text>
                </svg>
              );
            })()}
          </div>
          {/* Table légendée */}
          <div className="col-span-2">
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
                  <th className="text-left py-1 px-1.5 first:rounded-l">Poste</th>
                  <th className="text-right py-1 px-1.5">Montant</th>
                  <th className="text-right py-1 px-1.5 last:rounded-r">% Actif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1 px-1.5 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />
                      {it.label}
                    </td>
                    <td className="py-1 px-1.5 text-right num">{fmtMoney(it.value)}</td>
                    <td className="py-1 px-1.5 text-right num font-semibold">{((it.value / totalCalc) * 100).toFixed(1)} %</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2" style={{ borderColor: palette.primary }}>
                  <td className="py-1 px-1.5">TOTAL ACTIF</td>
                  <td className="py-1 px-1.5 text-right num">{fmtMoney(totalCalc)}</td>
                  <td className="py-1 px-1.5 text-right num">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // STRUCTURE DU PASSIF — donut + table
  if (id === 'struct_passif') {
    const p = data.bilanPassif ?? [];
    const get = (c: string) => p.find((l: any) => l.code === c)?.value ?? 0;
    // Décomposition stricte SYSCOHADA :
    //   _CP = Capitaux propres
    //   DA  = Emprunts et dettes financières (16, 17, 18)  ← ligne dédiée
    //   DP  = Provisions pour risques et charges (19)      ← ligne dédiée
    //   _DP = Total passif circulant (40 à 48)
    //   DV  = Trésorerie passive (56 + découverts)
    const items = [
      { label: 'Capitaux propres', value: get('_CP'), color: palette.primary },
      { label: 'Dettes financières', value: get('DA'), color: '#dc2626' },
      { label: 'Provisions risques', value: get('DP'), color: '#a16207' },
      { label: 'Dettes circulantes', value: get('_DP'), color: '#d97706' },
      { label: 'Trésorerie passive', value: get('DV'), color: '#7c3aed' },
      { label: 'Comptes non classés', value: get('_ECP'), color: '#a3a3a3' },
    ].filter((it) => Math.abs(it.value) > 0.01).map((it) => ({ ...it, value: Math.abs(it.value) }));
    const totalCalc = items.reduce((s, it) => s + it.value, 0) || 1;
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 flex flex-col items-center justify-center">
            {(() => {
              let cumPct = 0;
              const r = 50, cx = 70, cy = 70;
              return (
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {items.map((it, i) => {
                    const pct = it.value / totalCalc;
                    const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    cumPct += pct;
                    const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    const x1 = cx + r * Math.cos(startAngle);
                    const y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle);
                    const y2 = cy + r * Math.sin(endAngle);
                    const largeArc = pct > 0.5 ? 1 : 0;
                    return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={it.color} stroke="#fff" strokeWidth="1" />;
                  })}
                  <circle cx={cx} cy={cy} r={26} fill="#fff" />
                  <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill={palette.primary} fontWeight="bold">TOTAL</text>
                  <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill={palette.primary}>{Math.round(totalCalc / 1_000_000)}M</text>
                </svg>
              );
            })()}
          </div>
          <div className="col-span-2">
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
                  <th className="text-left py-1 px-1.5 first:rounded-l">Poste</th>
                  <th className="text-right py-1 px-1.5">Montant</th>
                  <th className="text-right py-1 px-1.5 last:rounded-r">% Passif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1 px-1.5 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />
                      {it.label}
                    </td>
                    <td className="py-1 px-1.5 text-right num">{fmtMoney(it.value)}</td>
                    <td className="py-1 px-1.5 text-right num font-semibold">{((it.value / totalCalc) * 100).toFixed(1)} %</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2" style={{ borderColor: palette.primary }}>
                  <td className="py-1 px-1.5">TOTAL PASSIF</td>
                  <td className="py-1 px-1.5 text-right num">{fmtMoney(totalCalc)}</td>
                  <td className="py-1 px-1.5 text-right num">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // PYRAMIDE DES PERFORMANCES (Du Pont) — ROE = Marge × Rotation × Levier
  if (id === 'pyramide_perf') {
    const sig = data.sig;
    const a = data.bilanActif ?? [], pas = data.bilanPassif ?? [];
    const ca = sig?.ca ?? 0;
    const rn = sig?.resultat ?? 0;
    const totA = a.find((l: any) => l.code === '_BZ')?.value ?? 0;
    const cp = pas.find((l: any) => l.code === '_CP')?.value ?? 0;
    // ROE/ROA basés sur capitaux/actif d'OUVERTURE (sans le résultat de l'exercice)
    const cpOuv = cp - rn;
    const totAOuv = totA - rn;
    const marge = ca ? (rn / ca) * 100 : 0;
    const rotation = totAOuv > 0 ? ca / totAOuv : 0;
    // GARDE : capitaux propres ≤ 0 = situation nette dégradée → levier non
    // significatif. On affiche "n.a." plutôt qu'une valeur trompeuse.
    const cpInvalid = cpOuv <= 0;
    const levier = cpInvalid ? 0 : totAOuv / cpOuv;
    const roa = totAOuv > 0 ? (rn / totAOuv) * 100 : 0;
    const roe = cpInvalid ? 0 : (rn / cpOuv) * 100;
    const Box = ({ label, value, sub, color, big }: any) => (
      <div className="rounded p-2 text-center" style={{ background: color + '15', borderLeft: `3px solid ${color}` }}>
        <p className="text-[9px] uppercase text-primary-500 font-semibold">{label}</p>
        <p className={clsx('num font-bold', big ? 'text-base' : 'text-sm')} style={{ color }}>{value}</p>
        {sub && <p className="text-[8px] text-primary-400">{sub}</p>}
      </div>
    );
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        {/* Niveau 1 : ROE en haut */}
        <div className="mb-2">
          <Box label="ROE — Rentabilité des capitaux propres" value={cpInvalid ? 'n.a.' : `${roe.toFixed(2)} %`} sub={cpInvalid ? '⚠ Capitaux propres ouverture ≤ 0' : `= Résultat net / CP ouverture`} color={palette.primary} big />
        </div>
        <div className="text-center text-xs text-primary-400 my-1">= Marge × Rotation × Levier</div>
        {/* Niveau 2 : ROA × Levier */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Box label="ROA — Rentabilité de l'actif" value={`${roa.toFixed(2)} %`} sub={`= Marge × Rotation`} color="#0891b2" />
          <Box label="Levier financier" value={cpInvalid ? 'n.a.' : `${levier.toFixed(2)} ×`} sub={cpInvalid ? 'CP ouverture ≤ 0' : `= Total Actif / CP`} color="#d97706" />
        </div>
        {/* Niveau 3 : Marge × Rotation */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Box label="Marge nette" value={`${marge.toFixed(2)} %`} sub={`= RN / CA`} color="#16a34a" />
          <Box label="Rotation de l'actif" value={`${rotation.toFixed(2)} ×`} sub={`= CA / Total Actif`} color="#7c3aed" />
        </div>
        {/* Niveau 4 : composants */}
        <div className="grid grid-cols-3 gap-2">
          <Box label="Résultat net" value={fmtMoney(rn)} color="#16a34a" />
          <Box label="CA" value={fmtMoney(ca)} color="#0891b2" />
          <Box label="Total Actif" value={fmtMoney(totA)} color="#d97706" />
        </div>
        <p className="text-[9px] text-primary-400 italic mt-2 text-center">Décomposition Du Pont — analyse multiplicative de la performance financière</p>
      </div>
    );
  }

  // RATIOS TABLE — table complète avec statut + benchmark
  if (id === 'ratios_table') {
    const ratios = data.ratios ?? [];
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
              <th className="text-left py-1 px-1.5 first:rounded-l">Ratio</th>
              <th className="text-left py-1 px-1.5">Catégorie</th>
              <th className="text-right py-1 px-1.5">Valeur</th>
              <th className="text-right py-1 px-1.5">Cible</th>
              <th className="text-center py-1 px-1.5 last:rounded-r">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {ratios.slice(0, 20).map((r: any, i: number) => {
              const color = r.status === 'good' ? '#16a34a' : r.status === 'warn' ? '#d97706' : '#dc2626';
              const status = r.status === 'good' ? '✓ OK' : r.status === 'warn' ? '⚠ À surveiller' : '✗ Hors seuil';
              return (
                <tr key={i}>
                  <td className="py-1 px-1.5 truncate max-w-[180px]">{r.label}</td>
                  <td className="py-1 px-1.5 text-primary-500 text-[9px]">{r.category ?? '—'}</td>
                  <td className="py-1 px-1.5 text-right num font-semibold">{r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`}</td>
                  <td className="py-1 px-1.5 text-right num text-primary-500">{r.target ?? '—'}</td>
                  <td className="py-1 px-1.5 text-center font-bold" style={{ color }}>{status}</td>
                </tr>
              );
            })}
            {ratios.length === 0 && (
              <tr><td colSpan={5} className="py-2 text-center text-primary-500 italic">Aucun ratio calculé</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // WATERFALL — barres horizontales SIG
  if (id === 'waterfall') {
    const sig = data.sig;
    const steps = [
      { label: 'CA', value: sig?.ca ?? 0 },
      { label: 'Marge brute', value: sig?.margeBrute ?? 0 },
      { label: 'Valeur ajoutée', value: sig?.valeurAjoutee ?? 0 },
      { label: 'EBE', value: sig?.ebe ?? 0 },
      { label: 'RE', value: sig?.re ?? 0 },
      { label: 'Résultat net', value: sig?.resultat ?? 0 },
    ];
    const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const pct = (Math.abs(s.value) / max) * 100;
            const neg = s.value < 0;
            return (
              // Layout 3 colonnes : label | track de barre | valeur sombre.
              // La valeur est SORTIE de la barre pour rester lisible quel que
              // soit le ratio de remplissage (avant : texte blanc sur fond gris
              // clair quand la barre ne couvrait pas toute la zone).
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-24 text-right text-primary-600 dark:text-primary-300 font-medium shrink-0">{s.label}</div>
                <div className="flex-1 bg-primary-100 dark:bg-primary-900 h-5 rounded overflow-hidden relative">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: neg ? '#dc2626' : palette.primary }} />
                </div>
                <div className="w-28 text-right num font-semibold tabular-nums text-primary-900 dark:text-primary-100 shrink-0">{fmtMoney(s.value)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // CASHFLOW — graphique évolution mensuelle Cash In / Out (données RÉELLES)
  if (id === 'cashflow' || id === 'cashforecast') {
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    // VRAIS flux de trésorerie : débits (encaissements) et crédits (décaissements)
    // sur les comptes de banque/caisse 50-58. PAS les classes 6/7 du CR (qui
    // mesurent le RÉSULTAT, pas le CASH — un produit non encaissé n'est pas
    // du cash, une dotation aux amortissements n'est pas un décaissement).
    const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
    const series = months.map((_, mi) => ({
      mois: months[mi],
      in: Math.round(cf?.encaissements?.[mi] ?? 0),
      out: Math.round(cf?.decaissements?.[mi] ?? 0),
    }));
    const maxV = Math.max(...series.flatMap((s) => [s.in, s.out]), 1);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (
            <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
              <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
              <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Cash In (vert) vs Cash Out (rouge) — Mensuel · valeurs en milliers XOF</p>
        <div className="flex items-end gap-1 h-32">
          {series.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col justify-end h-28 relative">
                <div className="bg-success/90 rounded-t flex items-start justify-center pt-0.5 text-[8px] text-white font-semibold" style={{ height: `${(s.in / maxV) * 50}%` }}>
                  {Math.round(s.in / 1000)}k
                </div>
                <div className="bg-error/90 rounded-b flex items-end justify-center pb-0.5 text-[8px] text-white font-semibold" style={{ height: `${(s.out / maxV) * 50}%` }}>
                  {Math.round(s.out / 1000)}k
                </div>
              </div>
              <span className="text-[8px] text-primary-500">{s.mois}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-around text-[9px] text-primary-500 mt-1">
          <span>Total In : <strong className="num text-success">{fmtMoney(series.reduce((s, m) => s + m.in, 0))}</strong></span>
          <span>Total Out : <strong className="num text-error">{fmtMoney(series.reduce((s, m) => s + m.out, 0))}</strong></span>
          <span>Net : <strong className="num">{fmtMoney(series.reduce((s, m) => s + m.in - m.out, 0))}</strong></span>
        </div>
      </div>
    );
  }

  // BFR — graphique structure FR / BFR / TN
  if (id === 'bfr') {
    const a = data.bilanActif ?? [], p = data.bilanPassif ?? [];
    const get = (l: any[], c: string) => l.find((x: any) => x.code === c)?.value ?? 0;
    const fr = get(p, '_DF') - get(a, '_AZ');
    const bfr = get(a, '_BK') - get(p, '_DP');
    const tn = get(a, '_BT') - get(p, 'DV');
    const max = Math.max(Math.abs(fr), Math.abs(bfr), Math.abs(tn), 1);
    const items = [{ label: 'FR', value: fr, color: palette.primary }, { label: 'BFR', value: bfr, color: '#d97706' }, { label: 'TN', value: tn, color: tn >= 0 ? '#16a34a' : '#dc2626' }];
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3 mb-2">
          {items.map((it, i) => {
            const pct = (Math.abs(it.value) / max) * 100;
            return (
              <div key={i} className="text-center">
                <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">{it.label}</p>
                <div className="bg-primary-100 dark:bg-primary-900 h-24 rounded relative overflow-hidden flex items-end">
                  <div className="w-full transition-all flex items-start justify-center pt-1 text-[10px] font-bold text-white" style={{ height: `${pct}%`, background: it.color }}>
                    {pct > 25 ? fmtMoney(it.value) : ''}
                  </div>
                </div>
                <p className="num text-xs font-bold mt-1" style={{ color: it.color }}>{fmtMoney(it.value)}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-primary-400 italic text-center">Équation : FR − BFR = TN</p>
      </div>
    );
  }

  // EXEC — KPIs + radar de performance simplifié
  if (id === 'exec') {
    const ratios = data.ratios ?? [];
    const top6 = ratios.slice(0, 6);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (
            <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
              <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
              <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
            </div>
          ))}
        </div>
        {top6.length > 0 && (
          <>
            <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 6 ratios</p>
            <div className="grid grid-cols-3 gap-1">
              {top6.map((r: any, i: number) => {
                const color = r.status === 'good' ? '#16a34a' : r.status === 'warn' ? '#d97706' : '#dc2626';
                return (
                  <div key={i} className="text-[9px] flex justify-between gap-1 px-1.5 py-1 rounded" style={{ background: color + '20', color }}>
                    <span className="truncate">{r.label}</span>
                    <span className="font-bold num">{r.unit === '%' ? `${r.value.toFixed(1)}%` : r.value.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── CYCLE CLIENT — KPIs + Top débiteurs + Balance âgée RÉELLE ───
  if (id === 'client') {
    const auxClient = (data.auxClient ?? []) as Array<{ tier: string; label: string; account: string; solde: number }>;
    const sorted = [...auxClient].sort((a, b) => b.solde - a.solde);
    const total = auxClient.reduce((s, r) => s + r.solde, 0);
    // Balance âgée RÉELLE calculée depuis les dates des écritures
    const aged = data.agedClient as { buckets: string[]; rows: Array<{ buckets: number[] }> } | null;
    const colors = ['#16a34a', palette.primary, '#d97706', '#ea580c', '#dc2626'];
    const aggBuckets = [0, 0, 0, 0, 0];
    if (aged?.rows) {
      for (const r of aged.rows) {
        for (let i = 0; i < 5; i++) aggBuckets[i] += r.buckets[i] || 0;
      }
    }
    const totalAged = aggBuckets.reduce((s, v) => s + v, 0) || 1;
    const buckets = (aged?.buckets ?? ['Non échu','0-30j','31-60j','61-90j','> 90j']).map((label, i) => ({
      label,
      montant: aggBuckets[i],
      pct: aggBuckets[i] / totalAged,
      color: colors[i],
    }));
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (
            <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
              <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
              <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Balance âgée — Répartition (montant + %)</p>
        <div className="flex gap-0.5 h-7 rounded overflow-hidden mb-1">
          {buckets.map((b, i) => (
            <div key={i} className="flex items-center justify-center text-[9px] text-white font-semibold" style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label}: ${fmtMoney(b.montant)} (${(b.pct * 100).toFixed(0)}%)`}>
              {b.pct >= 0.15 ? `${(b.pct * 100).toFixed(0)}%` : ''}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1 text-[9px] mb-3">
          {buckets.map((b, i) => (
            <div key={i} className="text-center">
              <p className="text-primary-500">{b.label}</p>
              <p className="num font-semibold" style={{ color: b.color }}>{fmtMoney(b.montant)}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 10 débiteurs</p>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
              <th className="text-left py-1 px-1.5 first:rounded-l">Compte</th>
              <th className="text-left py-1 px-1.5">Libellé</th>
              <th className="text-right py-1 px-1.5">Solde</th>
              <th className="text-right py-1 px-1.5 last:rounded-r">% portefeuille</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {sorted.slice(0, 10).map((r, i) => (
              <tr key={i}>
                <td className="py-1 px-1.5 num font-mono">{r.tier}</td>
                <td className="py-1 px-1.5 truncate max-w-[200px]">{r.label}</td>
                <td className="py-1 px-1.5 text-right num">{fmtMoney(r.solde)}</td>
                <td className="py-1 px-1.5 text-right num">{total ? ((r.solde / total) * 100).toFixed(1) : 0} %</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="py-2 text-center text-primary-500 italic">Aucune créance client significative</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ─── CYCLE FOURNISSEUR — KPIs + Top fournisseurs + Échéancier RÉEL ───
  if (id === 'fr') {
    const auxFr = (data.auxFournisseur ?? []) as Array<{ tier: string; label: string; account: string; solde: number }>;
    const sorted = [...auxFr].sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
    const total = auxFr.reduce((s, r) => s + Math.abs(r.solde), 0);
    // Échéancier RÉEL depuis les dates GL
    const aged = data.agedFournisseur as { buckets: string[]; rows: Array<{ buckets: number[] }> } | null;
    const colors = ['#16a34a', palette.primary, '#d97706', '#ea580c', '#dc2626'];
    const aggBuckets = [0, 0, 0, 0, 0];
    if (aged?.rows) {
      for (const r of aged.rows) {
        for (let i = 0; i < 5; i++) aggBuckets[i] += Math.abs(r.buckets[i] || 0);
      }
    }
    const totalAged = aggBuckets.reduce((s, v) => s + v, 0) || 1;
    const buckets = (aged?.buckets ?? ['Non échu','0-30j','31-60j','61-90j','> 90j']).map((label, i) => ({
      label,
      montant: aggBuckets[i],
      pct: aggBuckets[i] / totalAged,
      color: colors[i],
    }));
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (
            <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
              <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
              <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Échéancier — Répartition à payer (montant + %)</p>
        <div className="flex gap-0.5 h-7 rounded overflow-hidden mb-1">
          {buckets.map((b, i) => (
            <div key={i} className="flex items-center justify-center text-[9px] text-white font-semibold" style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label}: ${fmtMoney(b.montant)} (${(b.pct * 100).toFixed(0)}%)`}>
              {b.pct >= 0.15 ? `${(b.pct * 100).toFixed(0)}%` : ''}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1 text-[9px] mb-3">
          {buckets.map((b, i) => (
            <div key={i} className="text-center">
              <p className="text-primary-500">{b.label}</p>
              <p className="num font-semibold" style={{ color: b.color }}>{fmtMoney(b.montant)}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 10 fournisseurs (concentration)</p>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
              <th className="text-left py-1 px-1.5 first:rounded-l">Compte</th>
              <th className="text-left py-1 px-1.5">Libellé</th>
              <th className="text-right py-1 px-1.5">Solde dû</th>
              <th className="text-right py-1 px-1.5 last:rounded-r">% dépendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {sorted.slice(0, 10).map((r, i) => (
              <tr key={i}>
                <td className="py-1 px-1.5 num font-mono">{r.tier}</td>
                <td className="py-1 px-1.5 truncate max-w-[200px]">{r.label}</td>
                <td className="py-1 px-1.5 text-right num">{fmtMoney(Math.abs(r.solde))}</td>
                <td className="py-1 px-1.5 text-right num">{total ? ((Math.abs(r.solde) / total) * 100).toFixed(1) : 0} %</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="py-2 text-center text-primary-500 italic">Aucune dette fournisseur significative</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ─── COMPLIANCE SYSCOHADA — 10 contrôles + recommandations ───
  if (id === 'compliance') {
    const balance = data.balance ?? [];
    const bilan = { actif: data.bilanActif ?? [], passif: data.bilanPassif ?? [], totalActif: 0, totalPassif: 0 };
    bilan.totalActif = bilan.actif.find((l: any) => l.code === '_BZ')?.value ?? 0;
    bilan.totalPassif = bilan.passif.find((l: any) => l.code === '_DZ')?.value ?? bilan.totalActif;
    const sig = data.sig;
    const movements = balance;

    type Check = { id: string; label: string; status: 'ok' | 'warn' | 'fail'; severity: 'critical'|'major'|'minor'; detail: string; reco?: string };
    const checks: Check[] = [];
    const totD = balance.reduce((s: number, r: any) => s + r.debit, 0);
    const totC = balance.reduce((s: number, r: any) => s + r.credit, 0);
    const deltaBal = Math.abs(totD - totC);
    checks.push({
      id: 'balance_eq', label: 'Balance équilibrée (D = C)', severity: 'critical',
      status: deltaBal < 1 ? 'ok' : 'fail',
      detail: deltaBal < 1 ? 'Équilibrée' : `Écart ${fmtMoney(totD - totC)}`,
      reco: deltaBal < 1 ? '' : 'Identifier les écritures déséquilibrées dans le GL et corriger à la source.',
    });
    const deltaBilan = Math.abs(bilan.totalActif - bilan.totalPassif);
    checks.push({
      id: 'bilan_eq', label: 'Bilan équilibré (Actif = Passif)', severity: 'critical',
      status: deltaBilan < 1 ? 'ok' : 'fail',
      detail: deltaBilan < 1 ? `Total ${fmtMoney(bilan.totalActif)}` : `Écart ${fmtMoney(bilan.totalActif - bilan.totalPassif)}`,
      reco: deltaBilan < 1 ? '' : 'Vérifier l\'affectation du résultat et la complétude des classes 1-5.',
    });
    if (sig) {
      const resBilan = bilan.passif.find((l: any) => l.code === 'CF')?.value ?? 0;
      const delta = Math.abs(resBilan - sig.resultat);
      checks.push({
        id: 'res', label: 'Résultat Bilan ↔ SIG cohérent', severity: 'major',
        status: delta < 2 ? 'ok' : 'warn',
        detail: delta < 2 ? 'Cohérent' : `Écart ${fmtMoney(resBilan - sig.resultat)}`,
        reco: delta < 2 ? '' : 'Réconcilier le résultat passif (CF) avec le résultat SIG (classes 6/7).',
      });
    }
    const hasCapital = balance.some((r: any) => r.account?.startsWith('101'));
    checks.push({
      id: 'capital', label: 'Capital social (101) présent', severity: 'major',
      status: hasCapital ? 'ok' : 'warn', detail: hasCapital ? 'Présent' : 'Absent',
      reco: hasCapital ? '' : 'Créer le compte 101 et y porter le capital social libéré.',
    });
    const class8Fail = balance.filter((r: any) => r.account?.length === 1).length;
    checks.push({
      id: 'racine', label: 'Pas de comptes racine seule', severity: 'minor',
      status: class8Fail === 0 ? 'ok' : 'warn',
      detail: class8Fail === 0 ? 'Aucune racine' : `${class8Fail} compte(s) racine`,
      reco: class8Fail === 0 ? '' : 'Reclasser les écritures sur des sous-comptes détaillés.',
    });
    const unmapped = balance.filter((r: any) => !r.syscoCode).length;
    checks.push({
      id: 'mapping', label: 'Mapping SYSCOHADA complet', severity: 'major',
      status: unmapped === 0 ? 'ok' : (unmapped < 5 ? 'warn' : 'fail'),
      detail: unmapped === 0 ? 'Tous mappés' : `${unmapped} non mappé(s)`,
      reco: unmapped === 0 ? '' : 'Importer/compléter le Plan Comptable avec mapping SYSCOHADA.',
    });
    // Classe 6 : sens débiteur — EXCLURE les contre-charges structurellement
    // créditrices : 603 (var. stocks), 619/629/639 (RRR obtenus), 781/791 (transferts).
    const c6Cred = balance.filter((r: any) =>
      r.account?.startsWith('6')
      && !r.account.startsWith('603')
      && !r.account.startsWith('619')
      && !r.account.startsWith('629')
      && !r.account.startsWith('639')
      && r.soldeC > 1000
    ).length;
    checks.push({
      id: 'c6', label: 'Classe 6 : sens débiteur normal', severity: 'major',
      status: c6Cred === 0 ? 'ok' : 'warn',
      detail: c6Cred === 0 ? 'Tous en débit (hors 603, 619, 629, 639)' : `${c6Cred} en crédit anormal`,
      reco: c6Cred === 0 ? '' : 'Vérifier les comptes de charges en solde créditeur (rétrocessions, RRR, erreurs).',
    });
    // Classe 7 : sens créditeur — EXCLURE les contre-produits structurellement
    // débiteurs : 709 (RRR accordés), 7019/7029... (RRR sur ventes spécifiques)
    const c7Deb = balance.filter((r: any) =>
      r.account?.startsWith('7')
      && !r.account.startsWith('709')
      && !/^70[1-7]9/.test(r.account)
      && r.soldeD > 1000
    ).length;
    checks.push({
      id: 'c7', label: 'Classe 7 : sens créditeur normal', severity: 'major',
      status: c7Deb === 0 ? 'ok' : 'warn',
      detail: c7Deb === 0 ? 'Tous en crédit (hors 709, 7Xx9)' : `${c7Deb} en débit anormal`,
      reco: c7Deb === 0 ? '' : 'Examiner les comptes de produits en débit (avoirs, annulations).',
    });
    const tva443 = balance.filter((r: any) => r.account?.startsWith('443') && r.soldeD > 100).length;
    const tva445 = balance.filter((r: any) => r.account?.startsWith('445') && r.soldeC > 100).length;
    checks.push({
      id: 'tva', label: 'TVA cohérente (443 C / 445 D)', severity: 'minor',
      status: tva443 + tva445 === 0 ? 'ok' : 'warn',
      detail: tva443 + tva445 === 0 ? 'Cohérent' : 'Anomalies sur 443/445',
      reco: tva443 + tva445 === 0 ? '' : 'Réviser les écritures TVA pour respecter le sens normal.',
    });
    const emptyLabels = movements.filter((r: any) => !r.label || r.label === '—').length;
    checks.push({
      id: 'labels', label: 'Libellés des écritures renseignés', severity: 'minor',
      status: emptyLabels === 0 ? 'ok' : 'warn',
      detail: emptyLabels === 0 ? 'Tous renseignés' : `${emptyLabels} sans libellé`,
      reco: emptyLabels === 0 ? '' : 'Ajouter un libellé descriptif à chaque écriture pour traçabilité.',
    });

    const ok = checks.filter((c) => c.status === 'ok').length;
    const fail = checks.filter((c) => c.status === 'fail').length;
    const warn = checks.filter((c) => c.status === 'warn').length;
    const score = Math.round((ok / checks.length) * 100);
    const scoreColor = score >= 90 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626';
    const failedChecks = checks.filter((c) => c.status !== 'ok');

    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded" style={{ borderLeft: `3px solid ${scoreColor}` }}>
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Score conformité</p>
            <p className="num text-base font-bold" style={{ color: scoreColor }}>{score} %</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Contrôles OK</p>
            <p className="num text-base font-bold text-success">{ok} / {checks.length}</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Avertissements</p>
            <p className="num text-base font-bold" style={{ color: '#d97706' }}>{warn}</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Critiques</p>
            <p className="num text-base font-bold text-error">{fail}</p>
          </div>
        </div>

        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Détail des 10 contrôles SYSCOHADA</p>
        <table className="w-full text-[10px] mb-3">
          <thead>
            <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
              <th className="text-center py-1 px-1.5 first:rounded-l w-8">#</th>
              <th className="text-left py-1 px-1.5">Contrôle</th>
              <th className="text-left py-1 px-1.5">Sévérité</th>
              <th className="text-left py-1 px-1.5">Détail</th>
              <th className="text-center py-1 px-1.5 last:rounded-r w-16">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {checks.map((c, i) => {
              const color = c.status === 'ok' ? '#16a34a' : c.status === 'warn' ? '#d97706' : '#dc2626';
              const label = c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
              const sevColor = c.severity === 'critical' ? '#dc2626' : c.severity === 'major' ? '#d97706' : '#6b7280';
              return (
                <tr key={c.id}>
                  <td className="py-1 px-1.5 text-center text-primary-500">{i + 1}</td>
                  <td className="py-1 px-1.5">{c.label}</td>
                  <td className="py-1 px-1.5"><span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: sevColor + '20', color: sevColor }}>{c.severity}</span></td>
                  <td className="py-1 px-1.5 text-primary-600">{c.detail}</td>
                  <td className="py-1 px-1.5 text-center font-bold" style={{ color }}>{label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {failedChecks.length > 0 && (
          <>
            <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Recommandations prioritaires</p>
            <ul className="space-y-1 text-[10px]">
              {failedChecks.map((c) => (
                <li key={c.id} className="flex gap-2 p-1.5 rounded" style={{ background: (c.status === 'fail' ? '#dc2626' : '#d97706') + '10' }}>
                  <span className="font-bold" style={{ color: c.status === 'fail' ? '#dc2626' : '#d97706' }}>{c.status === 'fail' ? '⛔' : '⚠'}</span>
                  <div>
                    <strong>{c.label}</strong> — <span className="text-primary-600">{c.reco}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {failedChecks.length === 0 && (
          <p className="text-[10px] text-success font-semibold p-2 rounded bg-success/10">✓ Conformité parfaite — aucune anomalie détectée sur les 10 contrôles SYSCOHADA.</p>
        )}
      </div>
    );
  }

  // Rendu enrichi pour le dashboard PARETO : KPIs + table top 15 + cumulé %
  if (id === 'pareto') {
    const ba = (data.budgetActual ?? []).filter((r: any) => Math.abs(r.realise) > 0.01);
    const sorted = ba.slice().sort((a: any, b: any) => Math.abs(b.realise) - Math.abs(a.realise));
    const total = sorted.reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const top20 = Math.ceil(sorted.length * 0.2);
    const top20Sum = sorted.slice(0, top20).reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const pctTop = total ? (top20Sum / total) * 100 : 0;
    let cumul = 0;
    const top15 = sorted.slice(0, 15).map((r: any) => {
      cumul += Math.abs(r.realise);
      const pctIndiv = total ? (Math.abs(r.realise) / total) * 100 : 0;
      const pctCumul = total ? (cumul / total) * 100 : 0;
      const cls = pctCumul <= 80 ? 'A' : pctCumul <= 95 ? 'B' : 'C';
      return { code: r.code, label: r.label, montant: r.realise, pct: pctIndiv, cumul: pctCumul, cls };
    });
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Comptes total</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{sorted.length}</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Top 20 % comptes</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{top20}</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Pèsent</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{pctTop.toFixed(1)} %</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">Volume top 20%</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{fmtMoney(top20Sum)}</p>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Top 15 comptes — Classement ABC</p>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
              <th className="text-left py-1 px-1.5 first:rounded-l">Compte</th>
              <th className="text-left py-1 px-1.5">Libellé</th>
              <th className="text-right py-1 px-1.5">Montant</th>
              <th className="text-right py-1 px-1.5">% indiv</th>
              <th className="text-right py-1 px-1.5">% cumulé</th>
              <th className="text-center py-1 px-1.5 last:rounded-r">Classe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {top15.map((r: any, i: number) => (
              <tr key={i}>
                <td className="py-1 px-1.5 num font-mono">{r.code}</td>
                <td className="py-1 px-1.5 truncate max-w-[180px]">{r.label}</td>
                <td className="py-1 px-1.5 text-right num">{fmtMoney(r.montant)}</td>
                <td className="py-1 px-1.5 text-right num">{r.pct.toFixed(1)} %</td>
                <td className="py-1 px-1.5 text-right num font-semibold">{r.cumul.toFixed(1)} %</td>
                <td className="py-1 px-1.5 text-center font-bold" style={{ color: r.cls === 'A' ? '#dc2626' : r.cls === 'B' ? '#d97706' : '#16a34a' }}>{r.cls}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[9px] text-primary-400 italic mt-1">A = 80 % · B = 80-95 % · C = 95-100 % du volume cumulé</p>
      </div>
    );
  }

  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
      <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
      <div className="grid grid-cols-4 gap-2">
        {kpis.map((k: any, i: number) => (
          <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPOSANTS UTILITAIRES ──────────────────────────────────────
function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">{label}</label>
      <input className="input !py-1.5 text-xs" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-primary-500">{label}</span><span className="font-semibold truncate">{v}</span></div>;
}

function LogoUpload({ onLogo, current }: { onLogo: (d: string) => void; current?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Logo</label>
      <input ref={ref} type="file" accept="image/*" className="input !py-1 text-[10px]" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader(); r.onload = () => onLogo(r.result as string); r.readAsDataURL(f);
      }} />
      {current && <div className="mt-1.5 inline-block border p-1 rounded bg-primary-50"><img src={current} alt="logo" className="h-8" /></div>}
    </div>
  );
}

// ─── MODALES ────────────────────────────────────────────────────
function SendModal({ open, onClose, config, setConfig, onValidate }: any) {
  const [email, setEmail] = useState('');
  const [destination, setDestination] = useState<'validation' | 'final'>('validation');
  return (
    <Modal open={open} onClose={onClose} title="Envoyer le rapport" subtitle="Validation interne ou diffusion finale"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { onValidate(); onClose(); toast.info('Rapport envoyé', `${destination === 'validation' ? 'Validation interne' : 'Diffusion finale'} · ${config.recipients.length} destinataires (envoi réel au Sprint 5)`); }}>
          <Send className="w-4 h-4" /> Envoyer
        </button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-primary-500 font-semibold block mb-2">Type d'envoi</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDestination('validation')} className={clsx('p-3 rounded border text-sm text-left',
              destination === 'validation' ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-800' : 'border-primary-200 dark:border-primary-800')}>
              <p className="font-semibold">⏸ Pour validation</p>
              <p className="text-[10px] text-primary-500 mt-1">Statut "En révision"</p>
            </button>
            <button onClick={() => setDestination('final')} className={clsx('p-3 rounded border text-sm text-left',
              destination === 'final' ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-800' : 'border-primary-200 dark:border-primary-800')}>
              <p className="font-semibold">📤 Diffusion finale</p>
              <p className="text-[10px] text-primary-500 mt-1">Statut "Diffusé"</p>
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-primary-500 font-semibold block mb-2">Destinataires ({config.recipients.length})</label>
          <div className="flex gap-2">
            <input className="input flex-1" type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) { setConfig((c: ReportConfig) => ({ ...c, recipients: [...c.recipients, email.trim()] })); setEmail(''); } }} />
            <button className="btn-outline" onClick={() => { if (email.trim()) { setConfig((c: ReportConfig) => ({ ...c, recipients: [...c.recipients, email.trim()] })); setEmail(''); } }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {config.recipients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {config.recipients.map((r: string, i: number) => (
                <span key={i} className="badge bg-primary-200 dark:bg-primary-800 px-2 py-1 text-xs flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {r}
                  <button onClick={() => setConfig((c: ReportConfig) => ({ ...c, recipients: c.recipients.filter((_, j) => j !== i) }))} className="ml-1 hover:text-error">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card p-3 bg-primary-100 dark:bg-primary-800 text-xs">
          <p>📎 Le PDF sera téléchargé localement (et joint à l'email lors de l'intégration SMTP au Sprint 5).</p>
          <p className="mt-1 text-primary-500">Format : {config.format} · Palette : {config.palette}</p>
        </div>
      </div>
    </Modal>
  );
}

function SaveModal({ open, onClose, config, orgId }: any) {
  const [name, setName] = useState(config.identity.title);
  const [desc, setDesc] = useState('');
  const save = async () => {
    if (!name.trim()) return;
    const now = Date.now();
    await db.templates.add({ orgId, name: name.trim(), description: desc.trim() || undefined, config: JSON.stringify(config), createdAt: now, updatedAt: now });
    onClose();
    toast.success('Modèle enregistré', `"${name}" prêt à être réutilisé`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Enregistrer comme modèle"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={save}><Save className="w-4 h-4" /> Enregistrer</button>
      </>}>
      <div className="space-y-3">
        <Field label="Nom du modèle" v={name} on={setName} />
        <div>
          <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Description</label>
          <textarea className="input min-h-[60px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description du modèle (optionnel)" />
        </div>
        <p className="text-xs text-primary-500">Le modèle conservera : identité, palette, format, options, et tous les blocs.</p>
      </div>
    </Modal>
  );
}

function CatalogModal({ open, onClose, kind, onPick }: { open: boolean; onClose: () => void; kind: 'tables' | 'dashboards'; onPick: (item: any, withTitle: boolean) => void }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('Toutes');
  const [withTitle, setWithTitle] = useState(true);
  const items = kind === 'tables' ? TABLE_CATALOG : DASHBOARD_CATALOG;
  const cats = ['Toutes', ...Array.from(new Set(items.map((i) => i.cat)))];
  const filtered = items.filter((i) => {
    if (cat !== 'Toutes' && i.cat !== cat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const label = (i as any).label ?? (i as any).name;
    return label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose}
      title={kind === 'tables' ? 'Catalogue de tables' : 'Catalogue de dashboards'}
      subtitle={`${filtered.length} élément(s) — cliquez pour insérer`}
      size="xl"
      footer={
        <>
          <label className="flex items-center gap-2 text-xs cursor-pointer mr-auto">
            <input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} />
            Insérer un titre H2 au-dessus du bloc (ajouté au sommaire)
          </label>
          <button className="btn-outline" onClick={onClose}>Fermer</button>
        </>
      }>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="input !py-1.5 text-sm flex-1 min-w-[200px]" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-1 flex-wrap">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`btn !py-1.5 text-xs ${cat === c ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto pr-1">
        {filtered.map((it: any) => (
          <button key={it.v ?? it.id} onClick={() => onPick(it, withTitle)}
            className="text-left p-3 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900 hover:border-primary-400 dark:hover:border-primary-600 transition group">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{it.label ?? it.name}</p>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-400 shrink-0">{it.cat}</span>
            </div>
            <p className="text-xs text-primary-500 leading-tight">{it.desc}</p>
            <p className="text-[10px] text-primary-400 mt-2 group-hover:text-primary-700 dark:group-hover:text-primary-300">+ Insérer →</p>
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-full py-12 text-center text-primary-500 text-sm">Aucun résultat</p>}
      </div>
    </Modal>
  );
}

function LoadModal({ open, onClose, templates, onLoad }: any) {
  const remove = async (id: number) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    await db.templates.delete(id);
  };
  return (
    <Modal open={open} onClose={onClose} title="Charger un modèle" size="lg"
      footer={<button className="btn-outline" onClick={onClose}>Fermer</button>}>
      {templates.length === 0 ? (
        <p className="py-12 text-center text-primary-500 text-sm">Aucun modèle enregistré. Créez-en un avec « Enregistrer comme modèle ».</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-sm">{t.name}</p>
                <button onClick={() => remove(t.id)} className="btn-ghost !p-1 text-primary-500 hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {t.description && <p className="text-xs text-primary-500 mb-3">{t.description}</p>}
              <p className="text-[10px] text-primary-400 mb-3">Créé le {new Date(t.createdAt).toLocaleDateString('fr-FR')}</p>
              <button className="btn-primary w-full !py-1.5 text-xs" onClick={() => onLoad(t)}>Charger</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── JOURNAL DES RAPPORTS — liste tous les rapports persistés ─────────
function ReportJournalModal({ open, onClose, reports, currentReportId, onLoad, onDelete }: any) {
  const [filter, setFilter] = useState('');
  const filtered = reports.filter((r: any) =>
    !filter || r.title.toLowerCase().includes(filter.toLowerCase()) || r.author.toLowerCase().includes(filter.toLowerCase())
  );

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      draft: { label: 'Brouillon', cls: 'bg-primary-200 text-primary-700' },
      review: { label: 'En revue', cls: 'bg-amber-100 text-amber-800' },
      approved: { label: 'Validé', cls: 'bg-emerald-100 text-emerald-800' },
      diffused: { label: 'Diffusé', cls: 'bg-blue-100 text-blue-800' },
    };
    const m = map[s] ?? map.draft;
    return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold', m.cls)}>{m.label}</span>;
  };

  return (
    <Modal open={open} onClose={onClose} title={`Journal des rapports (${reports.length})`} size="xl"
      subtitle="Tous les rapports enregistrés pour cette société"
      footer={<button className="btn-outline" onClick={onClose}>Fermer</button>}>
      <div className="mb-3">
        <input className="input" placeholder="Rechercher par titre ou auteur…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-primary-500">
          <FileText className="w-10 h-10 mx-auto mb-3 text-primary-400" />
          <p className="text-sm">{reports.length === 0 ? 'Aucun rapport enregistré pour le moment.' : 'Aucun résultat pour cette recherche.'}</p>
          {reports.length === 0 && (
            <p className="text-xs text-primary-400 mt-2">Cliquez sur « Enregistrer le rapport » dans le header pour créer votre premier rapport.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-200 dark:border-primary-800">
              <tr>
                <th className="text-left py-2 px-3">Titre</th>
                <th className="text-left py-2 px-3">Auteur</th>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-left py-2 px-3">Créé le</th>
                <th className="text-left py-2 px-3">Modifié le</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {filtered.map((r: any) => (
                <tr key={r.id} className={clsx('hover:bg-primary-100/40 dark:hover:bg-primary-900/40', currentReportId === r.id && 'bg-primary-100 dark:bg-primary-900')}>
                  <td className="py-2 px-3 font-medium">
                    {r.title}
                    {currentReportId === r.id && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900">En cours</span>}
                  </td>
                  <td className="py-2 px-3 text-xs text-primary-500">{r.author}</td>
                  <td className="py-2 px-3">{statusBadge(r.status)}</td>
                  <td className="py-2 px-3 text-xs text-primary-500 num">{new Date(r.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="py-2 px-3 text-xs text-primary-500 num">{new Date(r.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button className="btn-outline !py-1 text-xs" onClick={() => onLoad(r)} title="Charger ce rapport">
                        Ouvrir
                      </button>
                      <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error" onClick={() => onDelete(r.id)} title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
