// ─── REPORTS — éditeur de rapports par blocs ─────────────────────
// Ce fichier est le point d'entrée routé. La logique est découpée en
// sous-modules dans src/pages/Reports/ conformément à la règle <500 LOC.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import clsx from 'clsx';
import { saveAs } from 'file-saver';
import { Download, Eye, FileText, Save, Send, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { dataProvider } from '../db/provider';
import { useCloudData, invalidateCloudData } from '../hooks/useCloudData';
import { PageHeader } from '../components/layout/PageHeader';
import { Collapsible } from '../components/ui/Collapsible';
import { toast } from '../components/ui/Toast';
import { useBilanN1, useBudgetActual, useCapitalVariation, useCurrentOrg, useMonthlyCR, useMonthlyBilan, useRatios, useStatements, useTFT } from '../hooks/useFinancials';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { computeRatios } from '../engine/ratios';
import type { ReportDoc } from '../db/schema';
import { Block, buildPPTXFromBlocks, DEFAULT_CONFIG, PALETTES, PaletteKey, ReportConfig } from '../engine/reportBlocks';
import { computeBilan, computeSIG } from '../engine/statements';
import { computeIfrsReport } from '../engine/ifrs';
import { fmtMoney } from '../lib/format';
import { safeLocalStorage } from '../lib/safeStorage';
// ─── sous-modules ─────────────────────────────────────────────────
import { uid, QUICK_TEMPLATES, TEMPLATE_DEFAULTS, filterConditionalBlocks } from './Reports/reportData';
import { renderPages } from './Reports/renderPages';
import { Field, Stat, LogoUpload, SendModal, SaveModal, CatalogModal, LoadModal, ReportJournalModal } from './Reports/Modals';

export default function Reports() {
  const { bilan, cr, sig, balance } = useStatements();
  const bilanN1 = useBilanN1();
  const ratios = useRatios();
  const tft = useTFT();
  const capital = useCapitalVariation();
  const budgetActual = useBudgetActual();
  const monthlyCR = useMonthlyCR();
  const monthlyBilan = useMonthlyBilan();
  const org = useCurrentOrg();
  const { currentYear, currentOrgId } = useApp();

  const [config, setConfig] = useState<ReportConfig>(() => ({ ...DEFAULT_CONFIG(`Exercice ${currentYear}`), blocks: QUICK_TEMPLATES.monthly() }));
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
    try { return JSON.parse(safeLocalStorage.getItem('report-journal') ?? '[]'); } catch { return []; }
  });

  const { data: savedReports = [] as ReportDoc[] } = useCloudData<ReportDoc[]>(
    async () => {
      if (!currentOrgId) return [] as ReportDoc[];
      const all = await dataProvider.getReports(currentOrgId);
      return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    [currentOrgId],
    { initial: [] as ReportDoc[], tag: 'reports' },
  );

  const saveReport = async (newSave = false) => {
    if (!currentOrgId) { toast.error('Société manquante', 'Sélectionnez une société avant d\'enregistrer.'); return; }
    const now = Date.now();
    const payload = {
      orgId: currentOrgId,
      title: config.identity.title || `Rapport ${new Date(now).toLocaleDateString('fr-FR')}`,
      type: 'report', author: config.identity.author || 'Utilisateur local',
      status: 'draft' as const, content: JSON.stringify(config), updatedAt: now,
    };
    try {
      if (currentReportId && !newSave) {
        await dataProvider.upsertReport({ id: currentReportId, createdAt: now, ...payload });
        invalidateCloudData('reports');
        toast.success('Rapport mis à jour', config.identity.title);
      } else {
        const id = await dataProvider.upsertReport({ ...payload, createdAt: now });
        invalidateCloudData('reports');
        setCurrentReportId(id);
        toast.success('Rapport enregistré', config.identity.title);
      }
    } catch (e: any) {
      console.error('saveReport error', e);
      toast.error('Erreur', e?.message ?? 'Impossible d\'enregistrer le rapport.');
    }
  };

  const loadReport = (rep: any) => {
    try {
      const cfg = JSON.parse(rep.content);
      setConfig(cfg);
      setCurrentReportId(rep.id);
      setOpenJournal(false);
      toast.success('Rapport chargé', rep.title);
    } catch (e: any) {
      toast.error('Chargement impossible', e?.message ?? 'Format invalide.');
    }
  };

  const deleteReport = async (id: number) => {
    if (!confirm('Supprimer ce rapport définitivement ?')) return;
    try {
      await dataProvider.deleteReport(id);
      invalidateCloudData('reports');
      if (currentReportId === id) setCurrentReportId(null);
      toast.success('Rapport supprimé');
    } catch (e: any) {
      toast.error('Erreur', e?.message ?? 'Suppression impossible.');
    }
  };

  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    if (!safeLocalStorage.getItem('reports-twisty-init')) {
      safeLocalStorage.setItem('reports-left-collapsed', 'true');
      safeLocalStorage.setItem('reports-right-collapsed', 'true');
      safeLocalStorage.setItem('reports-twisty-init', '1');
      return true;
    }
    return safeLocalStorage.getItem('reports-left-collapsed') === 'true';
  });
  const [rightCollapsed, setRightCollapsed] = useState(() => safeLocalStorage.getItem('reports-right-collapsed') === 'true');
  const toggleLeft = () => { const n = !leftCollapsed; setLeftCollapsed(n); safeLocalStorage.setItem('reports-left-collapsed', String(n)); };
  const toggleRight = () => { const n = !rightCollapsed; setRightCollapsed(n); safeLocalStorage.setItem('reports-right-collapsed', String(n)); };

  const { data: templates = [] } = useCloudData(
    () => currentOrgId ? dataProvider.getTemplates(currentOrgId) : Promise.resolve([]),
    [currentOrgId],
    { initial: [], tag: 'templates' },
  );

  useEffect(() => { setConfig((c) => ({ ...c, identity: { ...c.identity, period: `Exercice ${currentYear}` } })); }, [currentYear]);
  const initialized = useRef(false);

  const setIdentity = (k: keyof ReportConfig['identity'], v: any) => setConfig((c) => ({ ...c, identity: { ...c.identity, [k]: v } }));
  const setOption = (k: keyof ReportConfig['options'], v: boolean) => setConfig((c) => ({ ...c, options: { ...c.options, [k]: v } }));
  const setFormat = (f: ReportConfig['format']) => setConfig((c) => ({ ...c, format: f }));
  const setPalette = (p: PaletteKey) => setConfig((c) => ({ ...c, palette: p }));

  const addBlock = (b: Block) => setConfig((c) => ({ ...c, blocks: [...c.blocks, b] }));
  const insertBlockAt = (index: number, b: Block) => setConfig((c) => { const arr = [...c.blocks]; arr.splice(index, 0, b); return { ...c, blocks: arr }; });
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
    const newBlocks = filterConditionalBlocks(QUICK_TEMPLATES[k](data), data);
    const firstH1 = newBlocks.find((b: any) => b.type === 'h1');
    setConfig((c) => ({
      ...c,
      identity: {
        ...c.identity,
        title:    TEMPLATE_DEFAULTS[k as string]?.title    ?? c.identity.title,
        subtitle: TEMPLATE_DEFAULTS[k as string]?.subtitle ?? c.identity.subtitle,
      },
      blocks: newBlocks,
    }));
    setActiveTemplate(k as string);
    setCurrentReportId(null);
    const labels: Record<string, string> = {
      weekly: 'Flash hebdomadaire', monthly: 'Rapport mensuel',
      quarterly: 'Comité trimestriel', annual: 'Rapport annuel', interim: 'Rapport intérimaire',
      cfo: 'Rapport CFO', bank: 'Pack Banque', audit: "Comité d'Audit",
      shareholders: 'Reporting Actionnaires', board: "Conseil d'Administration",
      fiscal: 'Pack Fiscal', closing: 'Closing Mensuel', cash: 'Cash Management',
    };
    const sections = newBlocks.filter((b: any) => b.type === 'h1').length;
    const tables = newBlocks.filter((b: any) => b.type === 'table').length;
    const dashboards = newBlocks.filter((b: any) => b.type === 'dashboard').length;
    toast.success(
      `Modèle appliqué : ${labels[k as string] ?? k}`,
      `${sections} sections · ${tables} tables · ${dashboards} dashboards — première section : "${(firstH1 as any)?.text ?? '—'}"`,
    );
    setTimeout(() => {
      if (firstH1) {
        const allH1 = document.querySelectorAll('.report-print-area h1, .report-print-area [data-block-type="h1"]');
        for (const el of Array.from(allH1)) {
          if (el.textContent?.includes((firstH1 as any).text)) {
            (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
          }
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const applyCustomTemplate = (tpl: any) => {
    try {
      const cfg = JSON.parse(tpl.config);
      setConfig(cfg);
      setActiveTemplate(`custom:${tpl.id}`);
      setCurrentReportId(null);
      toast.success(`Modèle "${tpl.name}" chargé`, `${cfg.blocks?.length ?? 0} bloc(s) appliqué(s).`);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    } catch (e: any) {
      toast.error('Modèle illisible', e?.message ?? 'Format invalide.');
    }
  };

  const palette = PALETTES[config.palette];

  const { data: hasAnalytical = false } = useCloudData<boolean>(
    async () => {
      if (!currentOrgId) return false;
      const all = await dataProvider.getGLEntries({ orgId: currentOrgId });
      const sample = all.slice(0, 500);
      return sample.some((e) => !!e.analyticalSection || !!e.analyticalAxis);
    },
    [currentOrgId],
    { initial: false, tag: 'gl' },
  );
  const hasStocks = balance.some((r) => r.account.startsWith('3') && Math.abs(r.solde) > 1);

  const periodFromMonth = config.identity.periodFrom ? new Date(config.identity.periodFrom).getMonth() + 1 : undefined;
  const periodToMonth = config.identity.periodTo ? new Date(config.identity.periodTo).getMonth() + 1 : undefined;
  const hasPeriodFilter = periodFromMonth !== undefined && periodToMonth !== undefined;

  const { data: periodBalance = null } = useCloudData<any>(async () => {
    if (!currentOrgId || !hasPeriodFilter) return null;
    const { computeBalance: cb } = await import('../engine/balance');
    return cb({ orgId: currentOrgId, year: currentYear, fromMonth: periodFromMonth, uptoMonth: periodToMonth, includeOpening: true });
  }, [currentOrgId, currentYear, periodFromMonth, periodToMonth, hasPeriodFilter], { initial: null, tag: 'gl' });

  const { data: periodMovements = null } = useCloudData<any>(async () => {
    if (!currentOrgId || !hasPeriodFilter) return null;
    const { computeBalance: cb } = await import('../engine/balance');
    return cb({ orgId: currentOrgId, year: currentYear, fromMonth: periodFromMonth, uptoMonth: periodToMonth, includeOpening: false });
  }, [currentOrgId, currentYear, periodFromMonth, periodToMonth, hasPeriodFilter], { initial: null, tag: 'gl' });

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

  const customRatioTargets = useSettings((s) => s.ratioTargets);
  const effectiveRatios = useMemo(() => {
    if (!hasPeriodFilter || !periodBalance) return ratios;
    let pd = 0;
    for (let m = (periodFromMonth ?? 1); m <= (periodToMonth ?? 12); m++) { pd += new Date(currentYear, m, 0).getDate(); }
    return computeRatios(periodBalance, customRatioTargets, { periodDays: pd || 360 });
  }, [hasPeriodFilter, periodBalance, ratios, periodFromMonth, periodToMonth, currentYear, customRatioTargets]);

  const { data: auxClient = [] } = useCloudData(async () => {
    if (!currentOrgId) return [];
    const { computeAuxBalance } = await import('../engine/balance');
    return computeAuxBalance({ orgId: currentOrgId, year: currentYear, kind: 'client' });
  }, [currentOrgId, currentYear], { initial: [], tag: 'gl' });
  const { data: auxFournisseur = [] } = useCloudData(async () => {
    if (!currentOrgId) return [];
    const { computeAuxBalance } = await import('../engine/balance');
    return computeAuxBalance({ orgId: currentOrgId, year: currentYear, kind: 'fournisseur' });
  }, [currentOrgId, currentYear], { initial: [], tag: 'gl' });
  const { data: agedClient = null } = useCloudData<any>(async () => {
    if (!currentOrgId) return null;
    const { agedBalance } = await import('../engine/analytics');
    return agedBalance(currentOrgId, currentYear, 'client');
  }, [currentOrgId, currentYear], { initial: null, tag: 'gl' });
  const { data: agedFournisseur = null } = useCloudData<any>(async () => {
    if (!currentOrgId) return null;
    const { agedBalance } = await import('../engine/analytics');
    return agedBalance(currentOrgId, currentYear, 'fournisseur');
  }, [currentOrgId, currentYear], { initial: null, tag: 'gl' });

  const { data: cashflowMonthly = null } = useCloudData<any>(async () => {
    if (!currentOrgId) return null;
    const { tresorerieMonthly } = await import('../engine/analytics');
    return tresorerieMonthly(currentOrgId, currentYear);
  }, [currentOrgId, currentYear], { initial: null, tag: 'gl' });

  const periodDays = useMemo(() => {
    const fm = hasPeriodFilter ? periodFromMonth : 1;
    const tm = hasPeriodFilter ? periodToMonth : 12;
    let d = 0;
    for (let m = fm; m <= tm; m++) { d += new Date(currentYear, m, 0).getDate(); }
    return d || 360;
  }, [hasPeriodFilter, periodFromMonth, periodToMonth, currentYear]);

  // ─── Liasse IFRS (blocs ifrs_* : états niveau GT, comparatif N/N-1) ───
  const { data: balanceN1Raw = null } = useCloudData<any>(async () => {
    if (!currentOrgId) return null;
    const { computeBalance: cb } = await import('../engine/balance');
    const bal = await cb({ orgId: currentOrgId, year: currentYear - 1, includeOpening: true });
    return bal.length ? bal : null;
  }, [currentOrgId, currentYear], { initial: null, tag: 'gl' });

  const ifrs = useMemo(() => {
    if (!effectiveBalance || effectiveBalance.length === 0) return null;
    try { return computeIfrsReport(effectiveBalance, balanceN1Raw, currentYear); }
    catch { return null; }
  }, [effectiveBalance, balanceN1Raw, currentYear]);

  const data = useMemo(() => ({
    bilanActif: effectiveBilan?.actif ?? [],
    bilanPassif: effectiveBilan?.passif ?? [],
    bilanN1Actif: bilanN1?.actif ?? null,
    bilanN1Passif: bilanN1?.passif ?? null,
    unclassifiedAccounts: effectiveBilan?.unclassifiedAccounts ?? [],
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
    ifrs,
  }), [effectiveBilan, bilanN1, effectiveCR, effectiveSig, effectiveBalance, effectiveRatios, tft, capital, budgetActual, monthlyCR, monthlyBilan, auxClient, auxFournisseur, agedClient, agedFournisseur, cashflowMonthly, hasAnalytical, hasStocks, periodDays, ifrs]);

  useEffect(() => {
    if (initialized.current || !sig) return;
    initialized.current = true;
    setConfig((c) => ({ ...c, blocks: filterConditionalBlocks(QUICK_TEMPLATES.monthly(data), data) }));
  }, [sig, data]);

  const logReport = (title: string, format: string) => {
    const entry = { date: Date.now(), title, format };
    const updated = [entry, ...journal].slice(0, 50);
    setJournal(updated);
    safeLocalStorage.setItem('report-journal', JSON.stringify(updated));
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
      void download;
      window.print();
    }
  };

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
            <RouterLink to="/settings" className="btn-outline" title="Modifier les informations société">
              <SettingsIcon className="w-4 h-4" /> Paramètres société
            </RouterLink>
            <button className="btn-outline" onClick={() => setOpenLoad(true)}>Charger un modèle</button>
            <button className="btn-outline" onClick={() => setOpenSave(true)}><Save className="w-4 h-4" /> Enregistrer modèle</button>
            <button className="btn-outline" onClick={async () => {
              if (!confirm("Auto-commenter le rapport avec Proph3t ?\nGénère un commentaire sous chaque H1, H2 et H3.\nL'analyse intègre l'historique mémorisé + connaissance SYSCOHADA + prédictions.")) return;
              const { autoCommentReport } = await import('../engine/proph3/reportCommentator');
              const dataWithOrg = { ...data, org: { name: org?.name, sector: (org as any)?.sector } } as any;
              const res = autoCommentReport(config.blocks as any, dataWithOrg, { orgId: currentOrgId, context: config.identity.period || `${currentYear}` });
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
            <button className="btn-clay" onClick={() => setOpenSend(true)}><Send className="w-4 h-4" /> Envoyer</button>
          </div>
        }
      />
      </div>

      <div className="grid grid-cols-1 gap-4" style={{
        gridTemplateColumns: `${leftCollapsed ? '48px' : '300px'} minmax(0, 1fr) ${rightCollapsed ? '48px' : '280px'}`,
      }}>

        {/* ════════════════ SIDEBAR GAUCHE — ÉDITEUR ════════════════ */}
        {leftCollapsed ? (
          <button onClick={toggleLeft} className="self-start sticky top-20 w-10 h-12 rounded-xl bg-primary-900 dark:bg-primary-100 hover:scale-105 text-primary-50 dark:text-primary-900 shadow-sm hover:shadow flex items-center justify-center transition-all duration-200 font-semibold text-base" title="Déplier l'éditeur" aria-label="Déplier l'éditeur">›</button>
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
              <button className="btn-outline !py-1 text-[10px]" onClick={() => { const t = prompt('Titre H1 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h1', text: t.trim(), inToc: true }); }}>+ H1</button>
              <button className="btn-outline !py-1 text-[10px]" onClick={() => { const t = prompt('Titre H2 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h2', text: t.trim(), inToc: true }); }}>+ H2</button>
              <button className="btn-outline !py-1 text-[10px]" onClick={() => { const t = prompt('Titre H3 :'); if (t?.trim()) addBlock({ id: uid(), type: 'h3', text: t.trim(), inToc: true }); }}>+ H3</button>
            </div>
            {config.blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3').length === 0 ? (
              <p className="text-[10px] text-primary-400 italic text-center py-3">Aucun titre — le sommaire sera vide.</p>
            ) : (
              <ol className="space-y-0.5 max-h-64 overflow-y-auto">
                {config.blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3').map((t: any) => (
                  <li key={t.id} className={clsx('flex items-center gap-1 px-1.5 py-1 rounded hover:bg-primary-200/50 dark:hover:bg-primary-800/50',
                    t.type === 'h2' && 'pl-4', t.type === 'h3' && 'pl-7')}>
                    <input className="flex-1 text-xs bg-transparent border-b border-transparent focus:border-primary-500 focus:outline-none truncate" value={t.text} onChange={(e) => updateBlock(t.id, { text: e.target.value })} />
                    <label className="flex items-center gap-1 text-[9px] cursor-pointer" title="Inclure dans le sommaire PDF">
                      <input type="checkbox" checked={t.inToc !== false} onChange={(e) => updateBlock(t.id, { inToc: e.target.checked })} className="scale-75" />
                    </label>
                    <button className="btn-ghost !p-0.5 text-[10px]" title="Monter" onClick={() => moveBlock(t.id, -1)}>↑</button>
                    <button className="btn-ghost !p-0.5 text-[10px]" title="Descendre" onClick={() => moveBlock(t.id, 1)}>↓</button>
                    <button className="btn-ghost !p-0.5 text-[10px] text-error" title="Supprimer" onClick={() => removeBlock(t.id)}>×</button>
                  </li>
                ))}
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
                    <div className="flex gap-0.5">{p.chartColors.slice(0, 5).map((c, i) => <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />)}</div>
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
                const label = ({
                  weekly: 'Flash hebdomadaire', monthly: 'Rapport mensuel',
                  quarterly: 'Comité trimestriel', annual: 'Rapport annuel', interim: 'Rapport intérimaire',
                  cfo: 'Rapport CFO', bank: 'Pack Banque', audit: "Comité d'Audit",
                  shareholders: 'Reporting Actionnaires', board: "Conseil d'Administration",
                  fiscal: 'Pack Fiscal', closing: 'Closing Mensuel', cash: 'Cash Management',
                  ifrs: 'Liasse IFRS (GT) ★',
                } as Record<string, string>)[k] ?? k;
                const blocks = QUICK_TEMPLATES[k](data);
                return (
                  <button key={k} onClick={() => applyTemplate(k as any)}
                    className={clsx('w-full text-left px-2.5 py-2 rounded text-xs font-medium border-2 transition-all flex items-center justify-between gap-2',
                      isActive ? 'bg-accent/10 border-accent text-accent font-semibold' : 'border-transparent hover:bg-primary-200 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300')}
                    title={`${label} — ${blocks.length} blocs par défaut`}>
                    <span className="truncate">{label}</span>
                    <span className={clsx('shrink-0 flex items-center gap-1.5', isActive ? '' : 'opacity-60')}>
                      <span className="text-[9px] tabular-nums">{blocks.length} blocs</span>
                      {isActive && <span className="text-[9px] uppercase tracking-wider font-bold">Actif</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-primary-400 italic mt-2 px-1">Cliquez sur un modèle pour régénérer le rapport.</p>
          </Collapsible>

          <Collapsible title={`Mes modèles personnels (${templates.length})`} defaultOpen={templates.length > 0}>
            {templates.length === 0 ? (
              <p className="text-[10px] text-primary-400 italic px-1 py-2">Aucun modèle personnel. Cliquez sur <strong>« Enregistrer modèle »</strong> en haut pour sauvegarder le rapport courant comme modèle réutilisable.</p>
            ) : (
              <div className="space-y-1">
                {templates.map((t: any) => {
                  const isActive = activeTemplate === `custom:${t.id}`;
                  return (
                    <button key={t.id} onClick={() => applyCustomTemplate(t)}
                      className={clsx('w-full text-left px-2.5 py-2 rounded text-xs font-medium border-2 transition-all flex items-center justify-between gap-2',
                        isActive ? 'bg-accent/10 border-accent text-accent font-semibold' : 'border-transparent hover:bg-primary-200 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300')}
                      title={t.description || t.name}>
                      <span className="truncate flex items-center gap-1.5">
                        <Save className="w-3 h-3 shrink-0 text-primary-400" />
                        {t.name}
                      </span>
                      {isActive && <span className="text-[9px] uppercase tracking-wider font-bold shrink-0">Actif</span>}
                    </button>
                  );
                })}
              </div>
            )}
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
            setCoverProps: (props: Record<string, any>) => { setConfig((c) => ({ ...c, identity: { ...c.identity, ...props } })); },
          })}
        </main>

        {/* ════════════════ SIDEBAR DROITE ════════════════ */}
        {rightCollapsed ? (
          <button onClick={toggleRight} className="self-start sticky top-20 w-10 h-12 rounded-xl bg-primary-900 dark:bg-primary-100 hover:scale-105 text-primary-50 dark:text-primary-900 shadow-sm hover:shadow flex items-center justify-center transition-all duration-200 font-semibold text-base" title="Déplier le récapitulatif" aria-label="Déplier">‹</button>
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
            <button className="btn-clay w-full mb-2" onClick={() => setOpenSend(true)}><Send className="w-4 h-4" /> Envoyer pour validation/diffusion</button>
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
              <button className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 mt-2 transition" onClick={() => { setJournal([]); safeLocalStorage.removeItem('report-journal'); }}>Effacer l'historique</button>
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
          if (withTitle) { insertBlockAt(targetIdx, { id: uid(), type: 'h2', text: item.label ?? item.name, inToc: true }); offset = 1; }
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
