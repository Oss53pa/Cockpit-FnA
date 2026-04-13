import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Eye, Mail, Plus, Save, Send, Trash2, Type, Hash, BarChart3, Table as TableIcon, MoveDown } from 'lucide-react';
import clsx from 'clsx';
import { saveAs } from 'file-saver';
import { PageHeader } from '../components/layout/PageHeader';
import { Modal } from '../components/ui/Modal';
import { Collapsible } from '../components/ui/Collapsible';
import { useBudgetActual, useCapitalVariation, useCurrentOrg, useRatios, useStatements, useTFT } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { Block, buildPDFFromBlocks, buildPPTXFromBlocks, DEFAULT_CONFIG, PALETTES, PaletteKey, ReportConfig } from '../engine/reportBlocks';
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
  { v: 'budget_actual', label: 'Budget vs Réalisé', cat: 'Analyse', desc: 'Écarts par compte sur tout le CR' },
];

// Synchronisé avec le catalogue Dashboards
const DASHBOARD_CATALOG: Array<{ id: string; name: string; cat: string; desc: string }> = [
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
  { id: 'is_bvsa', name: 'Income Statement Budget vs Actual', cat: 'Reporting', desc: 'Current period / N-1 / YTD' },
  { id: 'cashflow', name: 'Cashflow Statement', cat: 'Reporting', desc: 'KPIs + Cash In/Out + Solde' },
  { id: 'receivables', name: 'Receivables & Payables Review', cat: 'Reporting', desc: 'Donuts + évolution mensuelle' },
  { id: 'crsec_produits_expl', name: "CR — Produits d'exploitation", cat: 'CR détaillé', desc: 'Comptes 70-75' },
  { id: 'crsec_charges_expl', name: "CR — Charges d'exploitation", cat: 'CR détaillé', desc: 'Comptes 60-66' },
  { id: 'crsec_produits_fin', name: 'CR — Produits financiers', cat: 'CR détaillé', desc: 'Comptes 77' },
  { id: 'crsec_charges_fin', name: 'CR — Charges financières', cat: 'CR détaillé', desc: 'Comptes 67' },
  { id: 'crsec_produits_hao', name: 'CR — Produits exceptionnels', cat: 'CR détaillé', desc: 'Comptes 82, 84, 86, 88' },
  { id: 'crsec_charges_hao', name: 'CR — Charges exceptionnelles', cat: 'CR détaillé', desc: 'Comptes 81, 83, 85' },
  { id: 'crsec_impots', name: 'CR — Impôts sur bénéfices', cat: 'CR détaillé', desc: 'Comptes 87, 89' },
  { id: 'ind', name: 'Industrie', cat: 'Sectoriel', desc: 'Production, MP, marge industrielle' },
  { id: 'btp', name: 'BTP', cat: 'Sectoriel', desc: 'Travaux, sous-traitance, chantiers' },
  { id: 'com', name: 'Commerce', cat: 'Sectoriel', desc: 'Marge commerciale, taux de marque' },
  { id: 'mfi', name: 'Microfinance', cat: 'Sectoriel', desc: 'PNB, encours, PAR' },
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
  monthly: (data) => {
    const k = computeKPIs(data);
    return [
      // ─── 1. SYNTHÈSE EXÉCUTIVE ───────────────────────────
      { id: uid(), type: 'h1', text: '1. Synthèse exécutive', inToc: true },
      { id: uid(), type: 'paragraph', text: "Le présent rapport présente la performance financière de la société sur la période. Il analyse les principaux indicateurs de gestion, l'évolution de la trésorerie et les écarts par rapport au budget." },
      { id: uid(), type: 'h2', text: '1.1 Indicateurs clés', inToc: true },
      { id: uid(), type: 'kpi', items: [
        { label: "Chiffre d'affaires", value: k.ca, subValue: 'Cumul de la période' },
        { label: 'Résultat net', value: k.rn, subValue: `Marge ${k.margePct}` },
        { label: 'EBE', value: k.ebe, subValue: `Taux ${k.ebePct}` },
        { label: 'Trésorerie nette', value: k.treso, subValue: 'Position fin de période' },
      ]},
      { id: uid(), type: 'h2', text: '1.2 Faits marquants', inToc: true },
      { id: uid(), type: 'paragraph', text: "Cette section recense les éléments significatifs de la période : variations notables, événements exceptionnels, décisions structurantes. À compléter par la Direction Financière." },
      { id: uid(), type: 'pageBreak' },

      // ─── 2. PERFORMANCE — COMPTE DE RÉSULTAT ─────────────
      { id: uid(), type: 'h1', text: '2. Performance — Compte de résultat', inToc: true },
      { id: uid(), type: 'paragraph', text: "Analyse de la formation du résultat depuis le chiffre d'affaires jusqu'au résultat net, en passant par les soldes intermédiaires de gestion." },
      { id: uid(), type: 'h2', text: '2.1 Compte de résultat', inToc: true },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat — par nature' },
      { id: uid(), type: 'h2', text: '2.2 Soldes intermédiaires de gestion', inToc: true },
      { id: uid(), type: 'table', source: 'sig', title: 'SIG — formation du résultat' },
      { id: uid(), type: 'pageBreak' },

      // ─── 3. POSITION FINANCIÈRE — BILAN ───────────────────
      { id: uid(), type: 'h1', text: '3. Position financière — Bilan', inToc: true },
      { id: uid(), type: 'paragraph', text: "Photographie du patrimoine de l'entreprise à la date de clôture : actif (emplois) et passif (ressources)." },
      { id: uid(), type: 'h2', text: '3.1 Actif', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif', title: 'Bilan — Actif' },
      { id: uid(), type: 'h2', text: '3.2 Passif', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_passif', title: 'Bilan — Passif' },
      { id: uid(), type: 'kpi', items: [
        { label: 'Total Actif', value: k.actif },
        { label: 'Capitaux propres', value: k.capPropres },
        { label: 'BFR', value: k.bfr, subValue: "d'exploitation" },
        { label: 'Trésorerie nette', value: k.treso },
      ]},
      { id: uid(), type: 'pageBreak' },

      // ─── 4. BUDGET vs RÉALISÉ ─────────────────────────────
      { id: uid(), type: 'h1', text: '4. Analyse Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'paragraph', text: "Comparaison du réalisé sur la période avec le budget prévisionnel. Les écarts favorables sont marqués en vert, les défavorables en rouge." },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa', title: 'Income Statement — Budget vs Actual' },
      { id: uid(), type: 'pageBreak' },

      // ─── 5. TRÉSORERIE ────────────────────────────────────
      { id: uid(), type: 'h1', text: '5. Pilotage de la trésorerie', inToc: true },
      { id: uid(), type: 'paragraph', text: "Position et flux de trésorerie : encaissements, décaissements, solde mensuel et indicateurs clés." },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow', title: 'Cashflow Statement' },
      { id: uid(), type: 'pageBreak' },

      // ─── 6. CYCLE D'EXPLOITATION ──────────────────────────
      { id: uid(), type: 'h1', text: "6. Cycle d'exploitation", inToc: true },
      { id: uid(), type: 'paragraph', text: "Suivi des créances clients et des dettes fournisseurs. Analyse du DSO, DPO et de la concentration des tiers." },
      { id: uid(), type: 'dashboard', dashboardId: 'receivables', title: 'Receivables & Payables Review' },
      { id: uid(), type: 'pageBreak' },

      // ─── 7. RATIOS ────────────────────────────────────────
      { id: uid(), type: 'h1', text: '7. Ratios financiers', inToc: true },
      { id: uid(), type: 'paragraph', text: "Indicateurs de rentabilité, liquidité, structure financière et activité. Le statut indique le positionnement par rapport aux cibles internes." },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios financiers' },
      { id: uid(), type: 'pageBreak' },

      // ─── 8. RECOMMANDATIONS ───────────────────────────────
      { id: uid(), type: 'h1', text: "8. Conclusions et recommandations", inToc: true },
      { id: uid(), type: 'paragraph', text: "Synthèse des points d'attention identifiés et des actions correctives recommandées par la Direction Financière." },
      { id: uid(), type: 'h2', text: "8.1 Points d'attention", inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : ratios hors seuil, écarts significatifs, alertes opérationnelles." },
      { id: uid(), type: 'h2', text: '8.2 Plan d\'action', inToc: true },
      { id: uid(), type: 'paragraph', text: "À compléter : actions à mettre en œuvre, responsables, échéances, indicateurs de suivi." },
    ];
  },

  flash: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: 'Flash report — synthèse', inToc: true },
      { id: uid(), type: 'paragraph', text: "Note de synthèse rapide pour suivi opérationnel." },
      { id: uid(), type: 'kpi', items: [
        { label: "CA", value: k.ca },
        { label: 'Résultat net', value: k.rn },
        { label: 'Trésorerie', value: k.treso },
        { label: 'BFR', value: k.bfr },
      ]},
      { id: uid(), type: 'h2', text: "Points d'attention", inToc: true },
      { id: uid(), type: 'paragraph', text: "Écarts et alertes de la période." },
      { id: uid(), type: 'table', source: 'ratios', title: 'Ratios clés' },
    ];
  },

  quarterly: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Synthèse trimestrielle', inToc: true },
      { id: uid(), type: 'kpi', items: [
        { label: 'CA', value: k.ca }, { label: 'Marge nette', value: k.margePct },
        { label: 'RN', value: k.rn }, { label: 'TN', value: k.treso },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. États financiers', inToc: true },
      { id: uid(), type: 'h2', text: '2.1 Bilan', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif' }, { id: uid(), type: 'table', source: 'bilan_passif' },
      { id: uid(), type: 'h2', text: '2.2 Compte de résultat', inToc: true },
      { id: uid(), type: 'table', source: 'cr' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Budget vs Réalisé', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'is_bvsa' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Trésorerie & flux', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'cashflow' },
      { id: uid(), type: 'table', source: 'tft', title: 'TFT — méthode indirecte' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Cycle d\'exploitation', inToc: true },
      { id: uid(), type: 'dashboard', dashboardId: 'receivables' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Capitaux propres', inToc: true },
      { id: uid(), type: 'table', source: 'capital' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '7. Ratios financiers', inToc: true },
      { id: uid(), type: 'table', source: 'ratios' },
    ];
  },

  annual: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Message de la Direction', inToc: true },
      { id: uid(), type: 'paragraph', text: "Présentation de l'exercice écoulé, des principales réalisations et des perspectives." },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '2. Indicateurs clés', inToc: true },
      { id: uid(), type: 'kpi', items: [
        { label: 'CA', value: k.ca }, { label: 'EBE', value: k.ebe },
        { label: 'RN', value: k.rn }, { label: 'Capitaux propres', value: k.capPropres },
      ]},
      { id: uid(), type: 'kpi', items: [
        { label: 'Total Actif', value: k.actif }, { label: 'BFR', value: k.bfr },
        { label: 'Trésorerie', value: k.treso }, { label: 'DSO', value: k.dso },
      ]},
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '3. Bilan', inToc: true },
      { id: uid(), type: 'table', source: 'bilan_actif' }, { id: uid(), type: 'table', source: 'bilan_passif' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '4. Compte de résultat', inToc: true },
      { id: uid(), type: 'table', source: 'cr' },
      { id: uid(), type: 'h2', text: 'SIG', inToc: true },
      { id: uid(), type: 'table', source: 'sig' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '5. Tableau des flux de trésorerie', inToc: true },
      { id: uid(), type: 'table', source: 'tft' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '6. Variation des capitaux propres', inToc: true },
      { id: uid(), type: 'table', source: 'capital' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '7. Analyse par ratios', inToc: true },
      { id: uid(), type: 'table', source: 'ratios' },
      { id: uid(), type: 'pageBreak' },
      { id: uid(), type: 'h1', text: '8. Balance générale', inToc: true },
      { id: uid(), type: 'table', source: 'balance' },
    ];
  },
};

function uid() { return Math.random().toString(36).substring(2, 11); }

export default function Reports() {
  const { bilan, cr, sig, balance } = useStatements();
  const ratios = useRatios();
  const tft = useTFT();
  const capital = useCapitalVariation();
  const budgetActual = useBudgetActual();
  const org = useCurrentOrg();
  const { currentYear, currentOrgId } = useApp();

  const [config, setConfig] = useState<ReportConfig>(() => ({ ...DEFAULT_CONFIG(`Exercice ${currentYear}`), blocks: QUICK_TEMPLATES.monthly() }));
  const [openSend, setOpenSend] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [openLoad, setOpenLoad] = useState(false);
  const [openCatalog, setOpenCatalog] = useState<'tables' | 'dashboards' | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [tocLabel, setTocLabel] = useState('');

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
  const applyTemplate = (k: keyof typeof QUICK_TEMPLATES) => setConfig((c) => ({ ...c, blocks: QUICK_TEMPLATES[k](data) }));

  const palette = PALETTES[config.palette];

  // Données réelles à injecter
  const data = useMemo(() => ({
    bilanActif: bilan?.actif ?? [],
    bilanPassif: bilan?.passif ?? [],
    cr,
    sig,
    balance,
    ratios,
    tft: tft?.lines,
    capital,
    budgetActual,
  }), [bilan, cr, sig, balance, ratios, tft, capital, budgetActual]);

  // Rafraîchir les KPIs du rapport par défaut une fois les données chargées (1 fois)
  useEffect(() => {
    if (initialized.current || !sig) return;
    initialized.current = true;
    setConfig((c) => ({ ...c, blocks: QUICK_TEMPLATES.monthly(data) }));
  }, [sig, data]);

  const generate = (download: boolean = true) => {
    if (!sig) return;
    if (config.format === 'pptx') {
      buildPPTXFromBlocks(config, data, org?.name ?? '—').then((blob) => {
        if (download) saveAs(blob, `${config.identity.title.replace(/\s+/g, '_')}.pptx`);
        else { window.open(URL.createObjectURL(blob), '_blank'); }
      });
    } else {
      const doc = buildPDFFromBlocks(config, data, org?.name ?? '—',
        [org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ') || undefined);
      if (download) doc.save(`${config.identity.title.replace(/\s+/g, '_')}.pdf`);
      else window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    }
  };

  // TOC dérivée des h1/h2/h3
  const toc = config.blocks.filter((b) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && (b as any).inToc !== false) as Array<{ id: string; type: 'h1'|'h2'|'h3'; text: string }>;

  return (
    <div>
      <PageHeader
        title="Reporting"
        subtitle="Éditeur par blocs · Visualiseur · Sommaire personnalisé · A4/PPTX · Palette"
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setOpenLoad(true)}>Charger un modèle</button>
            <button className="btn-outline" onClick={() => setOpenSave(true)}><Save className="w-4 h-4" /> Enregistrer modèle</button>
            <button className="btn-outline" onClick={() => generate(false)}><Eye className="w-4 h-4" /> Aperçu</button>
            <button className="btn-outline" onClick={() => generate(true)}><Download className="w-4 h-4" /> Télécharger</button>
            <button className="btn-primary" onClick={() => setOpenSend(true)}><Send className="w-4 h-4" /> Envoyer</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_300px] gap-4">

        {/* ════════════════ SIDEBAR GAUCHE — ÉDITEUR ════════════════ */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto pr-1">

          <Collapsible title="Identité" defaultOpen>
            <div className="space-y-2.5">
              <Field label="Titre" v={config.identity.title} on={(v) => setIdentity('title', v)} />
              <Field label="Sous-titre" v={config.identity.subtitle} on={(v) => setIdentity('subtitle', v)} />
              <Field label="Période" v={config.identity.period} on={(v) => setIdentity('period', v)} />
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

          <Collapsible title="Modèles rapides" defaultOpen={false}>
            <div className="space-y-1">
              {Object.entries(QUICK_TEMPLATES).map(([k]) => (
                <button key={k} onClick={() => applyTemplate(k as any)} className="w-full text-left px-2.5 py-2 rounded hover:bg-primary-200 dark:hover:bg-primary-800 text-xs font-medium">
                  {k === 'monthly' ? 'Rapport mensuel' : k === 'flash' ? 'Flash report' : 'Comité trimestriel'}
                </button>
              ))}
            </div>
          </Collapsible>
        </aside>

        {/* ════════════════ CENTRE — VISUALISEUR ════════════════ */}
        <main className="space-y-4">
          {renderPages(config, data, palette, {
            updateBlock, removeBlock, moveBlock, insertBlockAt,
            openTablesCatalog: (idx: number) => { setInsertAtIndex(idx); setOpenCatalog('tables'); },
            openDashCatalog: (idx: number) => { setInsertAtIndex(idx); setOpenCatalog('dashboards'); },
            org,
          })}
        </main>

        {/* ════════════════ SIDEBAR DROITE ════════════════ */}
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto pr-1">
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
            <p className="text-[10px] text-primary-500 mt-3 leading-tight">💡 Cliquez sur un bloc au centre pour l'éditer ou le supprimer. Les ↑↓ permettent de réordonner.</p>
          </div>
        </aside>
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
    </div>
  );
}

// ─── RENDU DES PAGES (simulation A4) ─────────────────────────────
function renderPages(config: ReportConfig, data: any, palette: any, ops: any) {
  const isLandscape = config.format === 'A4_landscape';
  const pageStyle = config.format === 'pptx'
    ? { width: '100%', maxWidth: 980, aspectRatio: '16/9', minHeight: 'auto' as const }
    : isLandscape
      ? { width: '100%', maxWidth: 1000, aspectRatio: '297/210', minHeight: 'auto' as const }
      : { width: '100%', maxWidth: 760, minHeight: 1000 };

  // On garde l'index global de chaque bloc pour pouvoir insérer à la bonne position
  const blocksWithIndex = config.blocks.map((b, i) => ({ block: b, index: i }));
  const pages: Array<Array<{ block: Block; index: number }>> = [[]];
  for (const item of blocksWithIndex) {
    if (item.block.type === 'pageBreak') pages.push([]);
    else pages[pages.length - 1].push(item);
  }

  return (
    <>
      {config.options.includeCover && (
        <PageA4 style={pageStyle}>
          <CoverPage config={config} palette={palette} org={ops.org} />
        </PageA4>
      )}

      {config.options.includeTOC && (
        <PageA4 style={pageStyle}>
          <TocPage config={config} palette={palette} />
        </PageA4>
      )}

      {pages.map((pageBlocks, pi) => (
        <PageA4 key={pi} style={pageStyle}>
          {pageBlocks.length === 0 && (
            <InsertHere index={config.blocks.length} ops={ops} alwaysOpen />
          )}
          {pageBlocks.map(({ block, index }, i) => (
            <div key={block.id}>
              {i === 0 && <InsertHere index={index} ops={ops} />}
              <BlockEditor block={block} data={data} palette={palette} ops={ops} />
              <InsertHere index={index + 1} ops={ops} />
            </div>
          ))}
        </PageA4>
      ))}
    </>
  );
}

// ─── BOUTON "+" ENTRE LES BLOCS ────────────────────────────────
function InsertHere({ index, ops, alwaysOpen }: { index: number; ops: any; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen ?? false);
  const [hover, setHover] = useState(false);

  const ins = (b: Block) => { ops.insertBlockAt(index, b); setOpen(false); };

  return (
    <div
      className="relative my-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Trait fin + bouton + apparaît au hover */}
      <div className={clsx('flex items-center transition-all', open || hover ? 'h-7' : 'h-2')}>
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
              <PopBtn label="📊 Tables" sub="9 sources comptables" icon={<TableIcon className="w-3.5 h-3.5" />}
                onClick={() => { setOpen(false); ops.openTablesCatalog(index); }} highlight />
              <PopBtn label="📈 Dashboards" sub="25 dashboards prêts" icon={<BarChart3 className="w-3.5 h-3.5" />}
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

function PageA4({ children, style }: { children: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div className="bg-white dark:bg-primary-900 border border-primary-300 dark:border-primary-700 rounded p-10 mx-auto overflow-hidden" style={style}>
      <div className="overflow-hidden break-words">{children}</div>
    </div>
  );
}

function CoverPage({ config, palette, org }: any) {
  return (
    <div className="border-2 rounded p-6 h-full flex flex-col" style={{ borderColor: palette.primary, minHeight: 700 }}>
      <p className="text-center text-[10px] uppercase tracking-widest text-primary-500 font-semibold">{config.identity.confidentiality}</p>
      {config.identity.logoDataUrl && <div className="text-center mt-6"><img src={config.identity.logoDataUrl} alt="logo" className="inline-block max-h-20" /></div>}
      <div className="flex-1 flex flex-col items-center justify-center text-center mt-12">
        <h1 className="text-3xl font-bold leading-tight" style={{ color: palette.primary }}>{config.identity.title}</h1>
        {config.identity.subtitle && <p className="text-base text-primary-500 italic mt-2">{config.identity.subtitle}</p>}
        <p className="text-xl font-bold mt-12">{org?.name ?? '—'}</p>
        {(org?.rccm || org?.ifu) && <p className="text-xs text-primary-500 mt-1">{[org?.rccm && `RCCM : ${org.rccm}`, org?.ifu && `IFU : ${org.ifu}`].filter(Boolean).join(' · ')}</p>}
      </div>
      <div className="text-center text-xs text-primary-500 mt-6 space-y-1">
        <p>Période : <strong>{config.identity.period}</strong></p>
        <p>Émis par : <strong>{config.identity.author}</strong></p>
        <p>Date : {new Date().toLocaleDateString('fr-FR')}</p>
      </div>
    </div>
  );
}

function TocPage({ config, palette }: any) {
  const toc = config.blocks.filter((b: any) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.inToc !== false);
  return (
    <div>
      <h2 className="text-2xl font-bold pb-2 mb-6 border-b-2" style={{ color: palette.primary, borderColor: palette.primary }}>Sommaire</h2>
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
    <div className="group relative my-2 hover:bg-primary-100/30 dark:hover:bg-primary-800/20 rounded p-1">
      {Controls}{children}
    </div>
  );

  if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
    const sizes = { h1: 'text-2xl font-bold', h2: 'text-lg font-bold', h3: 'text-base font-semibold' };
    return wrapper(
      <input
        className={clsx(sizes[block.type as keyof typeof sizes], 'w-full bg-transparent border-b border-transparent focus:border-primary-500 outline-none px-1 py-0.5')}
        value={block.text}
        onChange={(e) => ops.updateBlock(block.id, { text: e.target.value })}
        style={{ color: palette.primary }}
      />
    );
  }
  if (block.type === 'paragraph') {
    return wrapper(
      <textarea
        className="w-full bg-transparent border border-dashed border-transparent focus:border-primary-500 hover:border-primary-300 dark:hover:border-primary-700 rounded p-2 text-sm resize-y min-h-[60px] outline-none"
        value={block.text}
        onChange={(e) => ops.updateBlock(block.id, { text: e.target.value })}
      />
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
    case 'balance': head.push('Compte', 'Libellé', 'Solde D', 'Solde C'); body = data.balance.slice(0, 10).map((r: any) => [r.account, r.label, r.soldeD ? fmtFull(r.soldeD) : '', r.soldeC ? fmtFull(r.soldeC) : '']); break;
    case 'ratios': head.push('Ratio', 'Valeur', 'Cible', 'Statut'); body = data.ratios.slice(0, 10).map((r: any) => [r.label, r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`, `${r.target}`, r.status === 'good' ? '🟢' : r.status === 'warn' ? '🟠' : '🔴']); break;
    case 'budget_actual': head.push('Compte', 'Réalisé', 'Budget', 'Écart'); body = (data.budgetActual ?? []).slice(0, 10).map((r: any) => [r.label, fmtFull(r.realise), fmtFull(r.budget), fmtFull(r.ecart)]); break;
    case 'capital': head.push('Rubrique', 'Ouverture', 'Augm.', 'Clôture'); body = (data.capital ?? []).map((m: any) => [m.rubrique, fmtFull(m.ouverture), m.augmentation ? '+' + fmtFull(m.augmentation) : '—', fmtFull(m.cloture)]); break;
    case 'tft': head.push('Code', 'Poste', 'Montant'); body = (data.tft ?? []).slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
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
    if (id === 'home' || id === 'cp' || id === 'crblock' || id === 'is_bvsa') return [
      { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
      { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
      { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
      { label: 'Marge brute', value: fmtMoney(data.sig?.margeBrute ?? 0) },
    ];
    if (id === 'cashflow') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      return [
        { label: 'Total Income', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Total expenses', value: fmtMoney(-(data.sig?.ca ?? 0) + (data.sig?.resultat ?? 0)) },
        { label: 'Ending cash', value: fmtMoney(treso) },
        { label: 'Income %', value: data.sig?.ca ? `${((data.sig.resultat / data.sig.ca) * 100).toFixed(1)} %` : '0 %' },
      ];
    }
    if (id === 'receivables') {
      const ar = data.bilanActif?.find((l: any) => l.code === 'BH')?.value ?? 0;
      const ap = data.bilanPassif?.find((l: any) => l.code === 'DJ')?.value ?? 0;
      return [
        { label: 'Total sales', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Account receivable', value: fmtMoney(ar) },
        { label: 'Total Purchases', value: fmtMoney(data.cr?.find((l: any) => l.code === 'RA')?.value ?? 0) },
        { label: 'Account payable', value: fmtMoney(ap) },
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
    return [{ label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) }, { label: 'RN', value: fmtMoney(data.sig?.resultat ?? 0) }];
  })();
  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
      <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>📊 {dash?.name ?? id}</p>
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
        <button className="btn-primary" onClick={() => { onValidate(); onClose(); alert(`Rapport généré et "envoyé" en ${destination === 'validation' ? 'validation' : 'diffusion finale'} à ${config.recipients.length} destinataire(s).\n\n💡 L'envoi réel par email sera fonctionnel au Sprint 5 (Supabase Edge Functions + Resend).`); }}>
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
    alert(`Modèle "${name}" enregistré.`);
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
