// Module Reporting IFRS — liasse complète niveau « GT Example Financial Statements »
// Jeu complet 5 états (P&L · OCI · SoFP · Variation des CP · Flux) en comparatif
// N/N-1, références IAS/IFRS par ligne, notes, retraitements auto + manuels,
// réconciliation IFRS 1, bilingue FR/EN, export PDF « liasse » multi-pages.
import { useEffect, useMemo, useState } from 'react';
import { Globe, ArrowRightLeft, Scale, GitCompareArrows, Info, Download, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { TabSwitch } from '../components/ui/TabSwitch';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { safeLocalStorage } from '../lib/safeStorage';
import { fmtFull, fmtK } from '../lib/format';
import { dataProvider } from '../db/provider';
import { computeBalance, type BalanceRow } from '../engine/balance';
import { computeIfrsReport, DEFAULT_MANUAL, IFRS_TAX_RATE, type IfrsLineC, type IfrsManualInputs, type IfrsReport } from '../engine/ifrs';

type Tab = 'etats' | 'reconciliation' | 'retraitements' | 'parametres' | 'mapping' | 'notes';
type Lang = 'fr' | 'en';

const MAPPING: { sysco: string; ifrs: string; ifrsEn: string; norme: string }[] = [
  { sysco: 'Actif immobilisé (classes 20-27)', ifrs: 'Actifs non courants', ifrsEn: 'Non-current assets', norme: 'IAS 1' },
  { sysco: 'Charges immobilisées (compte 20)', ifrs: '❌ Sorties (charges)', ifrsEn: '❌ Derecognised (expensed)', norme: 'IAS 38' },
  { sysco: 'Actif circulant + trésorerie', ifrs: 'Actifs courants', ifrsEn: 'Current assets', norme: 'IAS 1' },
  { sysco: 'Capitaux propres + prov. réglementées', ifrs: 'Capitaux propres (retraités)', ifrsEn: 'Equity (adjusted)', norme: 'IAS 1' },
  { sysco: "Subventions d'investissement (14)", ifrs: 'Produits différés', ifrsEn: 'Deferred income', norme: 'IAS 20' },
  { sysco: 'Dettes financières (16-18)', ifrs: 'Passifs non courants', ifrsEn: 'Non-current liabilities', norme: 'IAS 1' },
  { sysco: 'Passif circulant + trésorerie passive', ifrs: 'Passifs courants', ifrsEn: 'Current liabilities', norme: 'IAS 1' },
  { sysco: 'Résultat HAO (classes 81-88)', ifrs: "↔ Fusionné dans l'ordinaire", ifrsEn: '↔ Merged into ordinary result', norme: 'IAS 1' },
  { sysco: 'SIG (marge brute, VA, EBE)', ifrs: 'Non repris (spécifique OHADA)', ifrsEn: 'Not carried over (OHADA-specific)', norme: '—' },
];

function readParams(key: string): { taxRate: number; manual: IfrsManualInputs } {
  try {
    const v = safeLocalStorage.getItem(key);
    if (v) { const p = JSON.parse(v); return { taxRate: p.taxRate ?? IFRS_TAX_RATE, manual: { ...DEFAULT_MANUAL, ...p.manual } }; }
  } catch { /* ignore */ }
  return { taxRate: IFRS_TAX_RATE, manual: DEFAULT_MANUAL };
}

export default function IfrsReporting() {
  const { currentYear, currentOrgId } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const { balance } = useStatements();
  const [tab, setTab] = useState<Tab>('etats');
  const [lang, setLang] = useState<Lang>('fr');
  const [priorBalance, setPriorBalance] = useState<BalanceRow[] | null>(null);
  const storeKey = `ifrs-params-${currentOrgId ?? 'none'}`;
  const [taxRate, setTaxRate] = useState<number>(() => readParams(storeKey).taxRate);
  const [manual, setManual] = useState<IfrsManualInputs>(() => readParams(storeKey).manual);

  useEffect(() => {
    if (currentOrgId) safeLocalStorage.setItem(storeKey, JSON.stringify({ taxRate, manual }));
  }, [storeKey, currentOrgId, taxRate, manual]);

  // Charge la balance N-1 pour le comparatif (dernier import GL de l'entité).
  useEffect(() => {
    if (!currentOrgId) return;
    let alive = true;
    (async () => {
      try {
        const imports = await dataProvider.getImports(currentOrgId);
        const gl = imports.filter((i) => i.kind === 'GL');
        const importId = gl.length ? String(gl[0].id) : undefined;
        let bal = await computeBalance({ orgId: currentOrgId, year: currentYear - 1, includeOpening: true, importId });
        if (bal.length === 0 && importId) bal = await computeBalance({ orgId: currentOrgId, year: currentYear - 1, includeOpening: true });
        if (alive) setPriorBalance(bal);
      } catch { if (alive) setPriorBalance(null); }
    })();
    return () => { alive = false; };
  }, [currentOrgId, currentYear]);

  const report = useMemo<IfrsReport | null>(
    () => (balance && balance.length ? computeIfrsReport(balance, priorBalance, currentYear, { taxRate, manual }) : null),
    [balance, priorBalance, currentYear, taxRate, manual],
  );

  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const pick = (l: { fr: string; en: string }) => (lang === 'fr' ? l.fr : l.en);

  const exportPdf = async () => {
    if (!report) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const head = [[t('Poste', 'Item'), String(report.yearN), report.hasPrior ? String(report.yearN1) : '', 'Réf.']];
    const rows = (lines: IfrsLineC[]) => lines.map((l) => [`${l.indent ? '   ' : ''}${pick(l)}`, fmtFull(l.value), report.hasPrior ? fmtFull(l.prior) : '', l.ref ?? '']);
    const section = (title: string, lines: IfrsLineC[]) => autoTable(doc, { head: [[title, '', '', '']], body: rows(lines), styles: { fontSize: 7.5 }, headStyles: { fillColor: [31, 30, 27] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: [150, 150, 150], fontSize: 6 } } });
    doc.setFontSize(17); doc.text(t('Liasse IFRS', 'IFRS Financial Statements'), 40, 50);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`${org?.name ?? ''} · ${t('Exercice', 'FY')} ${report.yearN}${report.hasPrior ? ` / ${report.yearN1}` : ''} · ${t('converti depuis SYSCOHADA révisé', 'converted from revised SYSCOHADA')}`, 40, 68);
    autoTable(doc, { startY: 84, head, body: rows(report.pnl), styles: { fontSize: 7.5 }, headStyles: { fillColor: [31, 30, 27] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: [150, 150, 150], fontSize: 6 } } });
    section(t('Résultat global (OCI)', 'Comprehensive income (OCI)'), report.oci);
    section(t('Situation financière — Actifs', 'Financial position — Assets'), [...report.sofpNCA, ...report.sofpCA]);
    section(t('Situation financière — CP & Passifs', 'Financial position — Equity & Liabilities'), [...report.sofpEquity, ...report.sofpNCL, ...report.sofpCL]);
    section(t('Flux de trésorerie', 'Cash flows'), report.cashflow);
    section(t('Réconciliation des capitaux propres (IFRS 1)', 'Equity reconciliation (IFRS 1)'), report.reconEquity);
    doc.save(`IFRS_${(org?.name ?? 'entreprise').replace(/\s+/g, '_')}_${report.yearN}.pdf`);
  };

  if (!balance || balance.length === 0 || !report) {
    return (
      <div>
        <PageHeader title="Reporting IFRS" subtitle={`Conversion SYSCOHADA révisé → IFRS — ${org?.name ?? '—'} · Exercice ${currentYear}`} />
        <EmptyState icon={Globe} title="Aucune donnée à convertir" description="Importez votre Grand Livre pour générer la liasse IFRS et les ponts de réconciliation." />
      </div>
    );
  }

  const r = report;
  const curr = org?.currency ?? 'XOF';

  return (
    <div>
      <PageHeader
        eyebrow={t('Normes internationales', 'International standards')}
        title={t('Reporting IFRS — Liasse complète', 'IFRS Reporting — Full statements')}
        subtitle={t(
          `Jeu complet d'états convertis depuis SYSCOHADA révisé — ${org?.name ?? '—'} · Exercice ${r.yearN}${r.hasPrior ? ` / ${r.yearN1}` : ''}`,
          `Complete set of statements converted from revised SYSCOHADA — ${org?.name ?? '—'} · FY ${r.yearN}${r.hasPrior ? ` / ${r.yearN1}` : ''}`,
        )}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setLang((p) => (p === 'fr' ? 'en' : 'fr'))}>
              <Globe className="w-4 h-4" /> {lang === 'fr' ? 'English' : 'Français'}
            </button>
            <button className="btn-clay" onClick={exportPdf}>
              <Download className="w-4 h-4" /> {t('Export liasse PDF', 'Export PDF pack')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title={t('Capitaux propres IFRS', 'Equity — IFRS')} value={fmtK(r.equityIfrsN)} unit={curr} icon={<Scale className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title={t('Résultat net IFRS', 'Profit — IFRS')} value={fmtK(r.resultIfrsN)} unit={curr} subValue={t('vs SYSCOHADA', 'vs SYSCOHADA')} icon={<Globe className="w-4 h-4" />} color={r.resultIfrsN >= 0 ? ct.at(0) : ct.at(1)} />
        <KPICard title={t('Total bilan IFRS', 'Total assets — IFRS')} value={fmtK(r.totalAssetsN)} unit={curr} icon={<Scale className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title={t('Comparatif', 'Comparative')} value={r.hasPrior ? `${r.yearN} / ${r.yearN1}` : String(r.yearN)} subValue={r.hasPrior ? t('2 exercices', '2 years') : t('N-1 indisponible', 'no prior year')} icon={<GitCompareArrows className="w-4 h-4" />} color={ct.at(2)} />
      </div>

      <div className="mb-4">
        <TabSwitch
          tabs={[
            { key: 'etats', label: t('États financiers', 'Statements') },
            { key: 'reconciliation', label: t('Réconciliation', 'Reconciliation') },
            { key: 'retraitements', label: t('Retraitements', 'Adjustments') },
            { key: 'parametres', label: t('Paramètres', 'Settings') },
            { key: 'mapping', label: 'Mapping' },
            { key: 'notes', label: 'Notes' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </div>

      {tab === 'etats' && (
        <div className="space-y-4">
          <p className="text-[11px] text-primary-400 italic">{t(`Montants en ${curr}. Références normatives entre parenthèses.`, `Amounts in ${curr}. Standard references in brackets.`)}</p>
          <ChartCard title={t('Compte de résultat', 'Statement of Profit or Loss')} subtitle="IAS 1 · par nature" accent={ct.at(0)}>
            <StatementTable lines={r.pnl} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} />
          </ChartCard>
          <ChartCard title={t('Résultat global', 'Statement of Comprehensive Income')} subtitle="IAS 1.82A" accent={ct.at(3)}>
            <StatementTable lines={r.oci} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} />
          </ChartCard>
          <ChartCard title={t('État de la situation financière', 'Statement of Financial Position')} subtitle="IAS 1 · current / non-current" accent={ct.at(0)}>
            <StatementTable lines={r.sofpNCA} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} header={t('ACTIFS NON COURANTS', 'NON-CURRENT ASSETS')} />
            <StatementTable lines={r.sofpCA} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} header={t('ACTIFS COURANTS', 'CURRENT ASSETS')} noHead />
            <GrandTotal label={t('TOTAL ACTIF', 'TOTAL ASSETS')} n={r.totalAssetsN} n1={r.totalAssetsN1} hasPrior={r.hasPrior} />
            <StatementTable lines={r.sofpEquity} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} header={t('CAPITAUX PROPRES', 'EQUITY')} noHead />
            <StatementTable lines={r.sofpNCL} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} header={t('PASSIFS NON COURANTS', 'NON-CURRENT LIABILITIES')} noHead />
            <StatementTable lines={r.sofpCL} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={r.hasPrior} t={t} header={t('PASSIFS COURANTS', 'CURRENT LIABILITIES')} noHead />
            <GrandTotal label={t('TOTAL CAPITAUX PROPRES & PASSIFS', 'TOTAL EQUITY & LIABILITIES')} n={r.totalELN} n1={r.totalELN1} hasPrior={r.hasPrior} />
          </ChartCard>
          <ChartCard title={t('Variation des capitaux propres', 'Statement of Changes in Equity')} subtitle="IAS 1.106" accent={ct.at(4)}>
            <SceTable sce={r.sce} />
          </ChartCard>
          <ChartCard title={t('Tableau des flux de trésorerie', 'Statement of Cash Flows')} subtitle={t('IAS 7 · méthode indirecte', 'IAS 7 · indirect method')} accent={ct.at(2)}>
            <StatementTable lines={r.cashflow} pick={pick} yearN={r.yearN} yearN1={r.yearN1} hasPrior={false} t={t} />
            {r.hasPrior && <p className="text-[10px] text-primary-400 mt-2">{t('Le comparatif N-1 des flux nécessite l\'exercice N-2 (non calculé).', 'Prior-year cash flows require year N-2 (not computed).')}</p>}
          </ChartCard>
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('Pont des capitaux propres', 'Equity reconciliation')} subtitle="SYSCOHADA → IFRS (IFRS 1)" accent={ct.at(0)}>
            <ReconTable lines={r.reconEquity} pick={pick} />
          </ChartCard>
          <ChartCard title={t('Pont du résultat', 'Profit reconciliation')} subtitle="SYSCOHADA → IFRS" accent={ct.at(3)}>
            <ReconTable lines={r.reconResult} pick={pick} />
          </ChartCard>
        </div>
      )}

      {tab === 'retraitements' && (
        <ChartCard title={t('Retraitements de conversion', 'Conversion adjustments')} subtitle={t(`Auto + manuels · impôt ${(r.taxRate * 100).toFixed(0)} %`, `Auto + manual · tax ${(r.taxRate * 100).toFixed(0)}%`)} accent={ct.at(0)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                  <th className="text-left py-2 px-2">{t('Norme', 'Standard')}</th>
                  <th className="text-left py-2 px-2">{t('Retraitement', 'Adjustment')}</th>
                  <th className="text-right py-2 px-2">{t('Montant', 'Amount')}</th>
                  <th className="text-right py-2 px-2">{t('Impact résultat', 'P&L impact')}</th>
                  <th className="text-right py-2 px-2">{t('Impact CP', 'Equity impact')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {r.adjustments.map((a) => (
                  <tr key={a.id} className="hover:bg-primary-50/60 dark:hover:bg-primary-900/40">
                    <td className="py-2 px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${a.type === 'manuel' ? 'bg-accent/15 text-accent' : 'bg-primary-100 dark:bg-primary-800 text-primary-500'}`}>{a.norme}</span></td>
                    <td className="py-2 px-2"><p className="font-medium">{lang === 'fr' ? a.fr : a.en}</p><p className="text-[11px] text-primary-400">{a.detail}</p></td>
                    <td className="py-2 px-2 text-right num">{fmtK(a.montant)}</td>
                    <td className={`py-2 px-2 text-right num ${a.impactResult !== 0 ? (a.impactResult > 0 ? 'text-success' : 'text-error') : 'text-primary-300'}`}>{a.impactResult !== 0 ? fmtK(a.impactResult) : '—'}</td>
                    <td className={`py-2 px-2 text-right num ${a.impactEquity !== 0 ? (a.impactEquity > 0 ? 'text-success' : 'text-error') : 'text-primary-300'}`}>{a.impactEquity !== 0 ? fmtK(a.impactEquity) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {tab === 'parametres' && (
        <ChartCard title={t('Retraitements manuels & paramètres', 'Manual adjustments & settings')} subtitle={t('Alimentez les retraitements nécessitant des données externes — persistés par entité', 'Feed the adjustments requiring external data — stored per entity')} accent={ct.at(0)}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldGroup title={t("Taux d'imposition", 'Tax rate')} norme="IAS 12">
              <NumberField label={t("Taux d'IS (%)", 'Income tax rate (%)')} value={taxRate * 100} onChange={(v) => setTaxRate(v / 100)} step={1} />
            </FieldGroup>
            <FieldGroup title={t('Contrats de location', 'Leases')} norme="IFRS 16">
              <NumberField label={t('Loyer annuel', 'Annual payment')} value={manual.ifrs16.annualPayment} onChange={(v) => setManual((m) => ({ ...m, ifrs16: { ...m.ifrs16, annualPayment: v } }))} />
              <NumberField label={t('Durée résiduelle (ans)', 'Remaining term (yrs)')} value={manual.ifrs16.termYears} onChange={(v) => setManual((m) => ({ ...m, ifrs16: { ...m.ifrs16, termYears: v } }))} />
              <NumberField label={t("Taux d'actualisation (%)", 'Discount rate (%)')} value={manual.ifrs16.rate * 100} onChange={(v) => setManual((m) => ({ ...m, ifrs16: { ...m.ifrs16, rate: v / 100 } }))} step={0.5} />
            </FieldGroup>
            <FieldGroup title={t('Engagements de retraite', 'Employee benefits')} norme="IAS 19">
              <NumberField label={t('Obligation (DBO)', 'Obligation (DBO)')} value={manual.ias19.obligation} onChange={(v) => setManual((m) => ({ ...m, ias19: { ...m.ias19, obligation: v } }))} />
              <NumberField label={t('Déjà provisionné', 'Already provided')} value={manual.ias19.alreadyProvided} onChange={(v) => setManual((m) => ({ ...m, ias19: { ...m.ias19, alreadyProvided: v } }))} />
            </FieldGroup>
            <FieldGroup title={t('Impôts différés', 'Deferred tax')} norme="IAS 12">
              <NumberField label={t('Différences temporelles nettes', 'Net temporary differences')} value={manual.ias12.temporaryDifferences} onChange={(v) => setManual((m) => ({ ...m, ias12: { ...m.ias12, temporaryDifferences: v } }))} />
            </FieldGroup>
            <FieldGroup title={t('Dépréciation créances', 'Receivables impairment')} norme="IFRS 9">
              <NumberField label={t('Taux de perte attendue (%)', 'Expected credit loss (%)')} value={manual.ifrs9.eclRate * 100} onChange={(v) => setManual((m) => ({ ...m, ifrs9: { ...m.ifrs9, eclRate: v / 100 } }))} step={0.5} />
            </FieldGroup>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-[10px] text-primary-400 flex items-center gap-1"><SlidersHorizontal className="w-3 h-3" /> {t('La liasse se recalcule en temps réel.', 'The statements recompute in real time.')}</p>
            <button className="btn-outline text-xs" onClick={() => { setManual(DEFAULT_MANUAL); setTaxRate(IFRS_TAX_RATE); }}>{t('Réinitialiser', 'Reset')}</button>
          </div>
        </ChartCard>
      )}

      {tab === 'mapping' && (
        <ChartCard title={t('Correspondance SYSCOHADA ↔ IFRS', 'SYSCOHADA ↔ IFRS mapping')} subtitle={t('Reclassement de présentation (IAS 1)', 'Presentation reclassification (IAS 1)')} accent={ct.at(0)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                  <th className="text-left py-2 px-2">SYSCOHADA</th><th className="w-8"></th><th className="text-left py-2 px-2">IFRS</th><th className="text-right py-2 px-2">{t('Norme', 'Standard')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {MAPPING.map((m, i) => (
                  <tr key={i} className="hover:bg-primary-50/60 dark:hover:bg-primary-900/40">
                    <td className="py-2 px-2">{m.sysco}</td>
                    <td className="py-2 px-2 text-primary-400"><ArrowRightLeft className="w-3.5 h-3.5" /></td>
                    <td className="py-2 px-2 font-medium">{lang === 'fr' ? m.ifrs : m.ifrsEn}</td>
                    <td className="py-2 px-2 text-right"><span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-800 text-primary-500 font-semibold">{m.norme}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {tab === 'notes' && (
        <div className="space-y-3">
          {r.notes.map((note) => (
            <ChartCard key={note.id} title={`${note.id}. ${lang === 'fr' ? note.titleFr : note.titleEn}`} subtitle={note.ref} accent={ct.at(0)}>
              <p className="text-[12px] text-primary-600 dark:text-primary-300 leading-relaxed">{lang === 'fr' ? note.bodyFr : note.bodyEn}</p>
            </ChartCard>
          ))}
          <ChartCard title={t('Portée & limites', 'Scope & limitations')} subtitle="" accent={ct.at(1)}>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border-l-2 border-warning">
              <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[12px] text-primary-600 dark:text-primary-300 leading-relaxed">{t(
                'Conversion indicative de gestion inspirée du standard « GT Example Financial Statements ». Les états OCI, variation des CP et flux sont estimés depuis les données disponibles. Pour un reporting IFRS audité, faites valider les retraitements et compléter les postes hors périmètre (segments, instruments financiers détaillés, notes complètes) par un cabinet.',
                'Indicative management conversion inspired by the "GT Example Financial Statements" standard. The OCI, changes-in-equity and cash-flow statements are estimated from available data. For audited IFRS reporting, have the adjustments validated and out-of-scope items (segments, detailed financial instruments, full notes) completed by an audit firm.',
              )}</p>
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────
function StatementTable({ lines, pick, hasPrior, t, header, noHead }: {
  lines: IfrsLineC[]; pick: (l: { fr: string; en: string }) => string; yearN: number; yearN1: number;
  hasPrior: boolean; t: (fr: string, en: string) => string; header?: string; noHead?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      {!noHead && (
        <thead>
          <tr className="border-b border-primary-200 dark:border-primary-700 text-[10px] uppercase text-primary-400">
            <th className="text-left py-1.5">{header ?? t('Poste', 'Item')}</th>
            <th className="text-right py-1.5 w-28">{t('Exercice', 'Year')} N</th>
            {hasPrior && <th className="text-right py-1.5 w-28">N-1</th>}
            <th className="text-right py-1.5 w-16 hidden sm:table-cell">Réf.</th>
          </tr>
        </thead>
      )}
      <tbody>
        {header && noHead && (
          <tr><td colSpan={hasPrior ? 4 : 3} className="pt-3 pb-1 text-[10px] uppercase tracking-wider text-primary-400 font-semibold">{header}</td></tr>
        )}
        {lines.map((l) => {
          const isHeader = l.value === 0 && l.prior === 0 && !l.indent && !l.total && /^(OCIh|CF_(OP|INV|FIN)h)/.test(l.code);
          return (
            <tr key={l.code} className={l.total ? 'font-semibold border-t border-primary-100 dark:border-primary-800' : ''}>
              <td className={`py-1 ${l.indent ? 'pl-4 text-primary-600 dark:text-primary-300' : ''} ${isHeader ? 'text-[10px] uppercase tracking-wider text-primary-400 pt-2' : ''}`}>{pick(l)}</td>
              <td className={`py-1 text-right num ${l.value < 0 ? 'text-error' : ''}`}>{isHeader ? '' : fmtFull(l.value)}</td>
              {hasPrior && <td className={`py-1 text-right num text-primary-500 ${l.prior < 0 ? 'text-error' : ''}`}>{isHeader ? '' : fmtFull(l.prior)}</td>}
              <td className="py-1 text-right text-[9px] text-primary-300 hidden sm:table-cell">{l.ref ?? ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GrandTotal({ label, n, n1, hasPrior }: { label: string; n: number; n1: number; hasPrior: boolean }) {
  return (
    <div className="flex justify-between items-center mt-1 pt-2 border-t-2 border-primary-300 dark:border-primary-600 text-[13px] font-bold">
      <span>{label}</span>
      <span className="flex gap-6">
        <span className="num w-28 text-right">{fmtFull(n)}</span>
        {hasPrior && <span className="num w-28 text-right text-primary-500">{fmtFull(n1)}</span>}
        <span className="w-16 hidden sm:block" />
      </span>
    </div>
  );
}

function SceTable({ sce }: { sce: { components: string[]; rows: { label: string; values: number[] }[] } }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-primary-200 dark:border-primary-700 text-[10px] uppercase text-primary-400">
            <th className="text-left py-1.5"></th>
            {sce.components.map((c) => <th key={c} className="text-right py-1.5">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {sce.rows.map((row, i) => {
            const isTotal = i === 0 || i === sce.rows.length - 1;
            return (
              <tr key={i} className={isTotal ? 'font-semibold border-t border-primary-100 dark:border-primary-800' : ''}>
                <td className="py-1.5">{row.label}</td>
                {row.values.map((v, j) => <td key={j} className={`py-1.5 text-right num ${v < 0 ? 'text-error' : ''}`}>{v !== 0 ? fmtFull(v) : '—'}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReconTable({ lines, pick }: { lines: IfrsLineC[]; pick: (l: { fr: string; en: string }) => string }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l, i) => {
          const isTotal = l.total; const isFirst = i === 0; const isLast = i === lines.length - 1;
          return (
            <tr key={l.code} className={isTotal ? `font-bold ${isLast ? 'border-t-2 border-primary-300 dark:border-primary-600' : ''} ${isFirst ? 'text-primary-500' : ''}` : ''}>
              <td className={`py-1.5 ${l.indent ? 'pl-4' : ''}`}>{pick(l)}</td>
              <td className={`py-1.5 text-right num ${!isTotal && l.value < 0 ? 'text-error' : !isTotal && l.value > 0 ? 'text-success' : ''}`}>{!isTotal && l.value > 0 ? '+' : ''}{fmtFull(l.value)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FieldGroup({ title, norme, children }: { title: string; norme: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-primary-200 dark:border-primary-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">{norme}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] text-primary-500">{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full mt-1 px-3 py-1.5 rounded-lg border border-primary-200 dark:border-primary-700 bg-transparent text-sm num focus:outline-none focus:border-accent" />
    </label>
  );
}
