// Module Reporting IFRS — conversion SYSCOHADA révisé → IFRS
// Sous-onglets : Mapping · Retraitements · États IFRS · Réconciliation · Notes.
// Bilingue FR/EN. S'appuie sur src/engine/ifrs.ts (retraitements auto-détectés).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Globe, ArrowRightLeft, FileText, Scale, GitCompareArrows, Info, Download, SlidersHorizontal } from 'lucide-react';
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
import { computeIfrsConversion, DEFAULT_MANUAL, IFRS_TAX_RATE, type IfrsLine, type IfrsManualInputs } from '../engine/ifrs';

type Tab = 'mapping' | 'retraitements' | 'etats' | 'reconciliation' | 'notes' | 'parametres';
type Lang = 'fr' | 'en';

function readParams(key: string): { taxRate: number; manual: IfrsManualInputs } {
  try {
    const v = safeLocalStorage.getItem(key);
    if (v) { const p = JSON.parse(v); return { taxRate: p.taxRate ?? IFRS_TAX_RATE, manual: { ...DEFAULT_MANUAL, ...p.manual } }; }
  } catch { /* ignore */ }
  return { taxRate: IFRS_TAX_RATE, manual: DEFAULT_MANUAL };
}

const MAPPING: { sysco: string; ifrs: string; ifrsEn: string; norme: string }[] = [
  { sysco: 'Actif immobilisé (classes 20-27)', ifrs: 'Actifs non courants', ifrsEn: 'Non-current assets', norme: 'IAS 1' },
  { sysco: 'Charges immobilisées (compte 20)', ifrs: '❌ Sorties (charges)', ifrsEn: '❌ Derecognised (expensed)', norme: 'IAS 38' },
  { sysco: 'Actif circulant + trésorerie', ifrs: 'Actifs courants', ifrsEn: 'Current assets', norme: 'IAS 1' },
  { sysco: 'Capitaux propres + prov. réglementées', ifrs: 'Capitaux propres (retraités)', ifrsEn: 'Equity (adjusted)', norme: 'IAS 1' },
  { sysco: "Subventions d'investissement (14)", ifrs: 'Produits différés', ifrsEn: 'Deferred income', norme: 'IAS 20' },
  { sysco: 'Dettes financières (16-18)', ifrs: 'Passifs non courants', ifrsEn: 'Non-current liabilities', norme: 'IAS 1' },
  { sysco: 'Passif circulant + trésorerie passive', ifrs: 'Passifs courants', ifrsEn: 'Current liabilities', norme: 'IAS 1' },
  { sysco: 'Résultat HAO (classes 81-88)', ifrs: '↔ Fusionné dans l\'ordinaire', ifrsEn: '↔ Merged into ordinary result', norme: 'IAS 1' },
  { sysco: 'SIG (marge brute, VA, EBE)', ifrs: 'Non repris (spécifique OHADA)', ifrsEn: 'Not carried over (OHADA-specific)', norme: '—' },
];

export default function IfrsReporting() {
  const { currentYear, currentOrgId } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const { balance } = useStatements();
  const [tab, setTab] = useState<Tab>('etats');
  const [lang, setLang] = useState<Lang>('fr');
  const storeKey = `ifrs-params-${currentOrgId ?? 'none'}`;
  const [taxRate, setTaxRate] = useState<number>(() => readParams(storeKey).taxRate);
  const [manual, setManual] = useState<IfrsManualInputs>(() => readParams(storeKey).manual);

  useEffect(() => {
    if (currentOrgId) safeLocalStorage.setItem(storeKey, JSON.stringify({ taxRate, manual }));
  }, [storeKey, currentOrgId, taxRate, manual]);

  const conv = useMemo(
    () => (balance && balance.length ? computeIfrsConversion(balance, { taxRate, manual }) : null),
    [balance, taxRate, manual],
  );
  const L = (l: IfrsLine) => (lang === 'fr' ? l.fr : l.en);

  const exportPdf = async () => {
    if (!conv) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pick = (l: IfrsLine) => (lang === 'fr' ? l.fr : l.en);
    doc.setFontSize(16); doc.text(lang === 'fr' ? 'Reporting IFRS' : 'IFRS Reporting', 40, 48);
    doc.setFontSize(10); doc.setTextColor(120); doc.text(`${org?.name ?? ''} · ${lang === 'fr' ? 'Exercice' : 'FY'} ${currentYear} · ${lang === 'fr' ? 'converti depuis SYSCOHADA révisé' : 'converted from revised SYSCOHADA'}`, 40, 66);
    const money = (v: number) => fmtFull(v);
    const sofp = [...conv.sofp.nonCurrentAssets, ...conv.sofp.currentAssets, ...conv.sofp.equity, ...conv.sofp.nonCurrentLiabilities, ...conv.sofp.currentLiabilities];
    autoTable(doc, { startY: 84, head: [[lang === 'fr' ? 'État de la situation financière (IAS 1)' : 'Statement of Financial Position (IAS 1)', 'XOF']], body: sofp.map((l) => [pick(l), money(l.value)]), styles: { fontSize: 8 }, headStyles: { fillColor: [31, 30, 27] } });
    autoTable(doc, { head: [[lang === 'fr' ? 'Compte de résultat' : 'Statement of Profit or Loss', 'XOF']], body: conv.pnl.map((l) => [pick(l), money(l.value)]), styles: { fontSize: 8 }, headStyles: { fillColor: [31, 30, 27] } });
    autoTable(doc, { head: [[lang === 'fr' ? 'Réconciliation des capitaux propres (IFRS 1)' : 'Equity reconciliation (IFRS 1)', 'XOF']], body: conv.reconEquity.map((l) => [pick(l), money(l.value)]), styles: { fontSize: 8 }, headStyles: { fillColor: [31, 30, 27] } });
    autoTable(doc, { head: [[lang === 'fr' ? 'Retraitements' : 'Adjustments', lang === 'fr' ? 'Impact CP' : 'Equity impact']], body: conv.adjustments.map((a) => [`${a.norme} — ${lang === 'fr' ? a.fr : a.en}`, money(a.impactEquity)]), styles: { fontSize: 8 }, headStyles: { fillColor: [31, 30, 27] } });
    doc.save(`IFRS_${(org?.name ?? 'entreprise').replace(/\s+/g, '_')}_${currentYear}.pdf`);
  };

  if (!balance || balance.length === 0 || !conv) {
    return (
      <div>
        <PageHeader title="Reporting IFRS" subtitle={`Conversion SYSCOHADA révisé → IFRS — ${org?.name ?? '—'} · Exercice ${currentYear}`} />
        <EmptyState icon={Globe} title="Aucune donnée à convertir" description="Importez votre Grand Livre pour générer automatiquement les états IFRS et les ponts de réconciliation." />
      </div>
    );
  }

  const c = conv;
  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  return (
    <div>
      <PageHeader
        eyebrow={t('Normes internationales', 'International standards')}
        title={t('Reporting IFRS', 'IFRS Reporting')}
        subtitle={t(
          `Conversion SYSCOHADA révisé → IFRS — ${org?.name ?? '—'} · Exercice ${currentYear}`,
          `SYSCOHADA-to-IFRS conversion — ${org?.name ?? '—'} · FY ${currentYear}`,
        )}
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setLang((p) => (p === 'fr' ? 'en' : 'fr'))}>
              <Globe className="w-4 h-4" /> {lang === 'fr' ? 'English' : 'Français'}
            </button>
            <button className="btn-clay" onClick={exportPdf}>
              <Download className="w-4 h-4" /> {t('Export PDF', 'Export PDF')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title={t('Capitaux propres SYSCOHADA', 'Equity — SYSCOHADA')} value={fmtK(c.equitySysco)} unit="XOF" icon={<Scale className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title={t('Capitaux propres IFRS', 'Equity — IFRS')} value={fmtK(c.equityIfrs)} unit="XOF" subValue={`${c.equityIfrs - c.equitySysco >= 0 ? '+' : ''}${fmtK(c.equityIfrs - c.equitySysco)}`} icon={<Globe className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title={t('Résultat SYSCOHADA', 'Profit — SYSCOHADA')} value={fmtK(c.resultSysco)} unit="XOF" icon={<FileText className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title={t('Résultat net IFRS', 'Profit — IFRS')} value={fmtK(c.resultIfrs)} unit="XOF" subValue={`${c.resultIfrs - c.resultSysco >= 0 ? '+' : ''}${fmtK(c.resultIfrs - c.resultSysco)}`} icon={<Globe className="w-4 h-4" />} color={c.resultIfrs >= 0 ? ct.at(0) : ct.at(1)} />
      </div>

      <div className="mb-4">
        <TabSwitch
          tabs={[
            { key: 'etats', label: t('États IFRS', 'IFRS statements') },
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('État de la situation financière', 'Statement of Financial Position')} subtitle="IAS 1 — current / non-current" accent={ct.at(0)}>
            <IfrsTable lang={lang} groups={[
              { title: t('Actifs non courants', 'Non-current assets'), lines: c.sofp.nonCurrentAssets },
              { title: t('Actifs courants', 'Current assets'), lines: c.sofp.currentAssets },
              { title: t('Capitaux propres', 'Equity'), lines: c.sofp.equity },
              { title: t('Passifs non courants', 'Non-current liabilities'), lines: c.sofp.nonCurrentLiabilities },
              { title: t('Passifs courants', 'Current liabilities'), lines: c.sofp.currentLiabilities },
            ]} pick={L} />
            <div className="flex justify-between mt-2 pt-2 border-t border-primary-200 dark:border-primary-700 text-[12px] font-bold">
              <span>{t('Total actif', 'Total assets')}</span>
              <span className="num">{fmtFull(c.sofp.totalAssets)}</span>
            </div>
            <div className="flex justify-between text-[12px] font-bold text-primary-500">
              <span>{t('Total CP + passif', 'Total equity & liabilities')}</span>
              <span className="num">{fmtFull(c.sofp.totalEquityAndLiabilities)}</span>
            </div>
          </ChartCard>

          <ChartCard title={t('Compte de résultat', 'Statement of Profit or Loss')} subtitle={t('Par nature — HAO fusionné', 'By nature — extraordinary items merged')} accent={ct.at(3)}>
            <table className="w-full text-sm">
              <tbody>
                {c.pnl.map((l) => (
                  <tr key={l.code} className={l.total ? 'border-t border-primary-200 dark:border-primary-700 font-bold' : ''}>
                    <td className={`py-1.5 ${l.indent ? 'pl-4 text-primary-600 dark:text-primary-300' : ''}`}>{L(l)}</td>
                    <td className={`py-1.5 text-right num ${l.value < 0 ? 'text-error' : ''}`}>{fmtFull(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('Pont des capitaux propres', 'Equity reconciliation')} subtitle={t('SYSCOHADA → IFRS (type IFRS 1)', 'SYSCOHADA → IFRS (IFRS 1 style)')} accent={ct.at(0)}>
            <ReconTable lines={c.reconEquity} pick={L} />
          </ChartCard>
          <ChartCard title={t('Pont du résultat', 'Profit reconciliation')} subtitle="SYSCOHADA → IFRS" accent={ct.at(3)}>
            <ReconTable lines={c.reconResult} pick={L} />
          </ChartCard>
        </div>
      )}

      {tab === 'retraitements' && (
        <ChartCard title={t('Retraitements de conversion', 'Conversion adjustments')} subtitle={t(`Auto-détectés depuis la balance · impôt ${(c.taxRate * 100).toFixed(0)} %`, `Auto-detected from the trial balance · tax ${(c.taxRate * 100).toFixed(0)}%`)} accent={ct.at(0)}>
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
                {c.adjustments.map((a) => (
                  <tr key={a.id} className="hover:bg-primary-50/60 dark:hover:bg-primary-900/40">
                    <td className="py-2 px-2"><span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">{a.norme}</span></td>
                    <td className="py-2 px-2">
                      <p className="font-medium">{lang === 'fr' ? a.fr : a.en}</p>
                      <p className="text-[11px] text-primary-400">{a.detail}</p>
                    </td>
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

      {tab === 'mapping' && (
        <ChartCard title={t('Correspondance SYSCOHADA ↔ IFRS', 'SYSCOHADA ↔ IFRS mapping')} subtitle={t('Reclassement de présentation (IAS 1)', 'Presentation reclassification (IAS 1)')} accent={ct.at(0)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                  <th className="text-left py-2 px-2">SYSCOHADA</th>
                  <th className="text-left py-2 px-2 w-8"></th>
                  <th className="text-left py-2 px-2">IFRS</th>
                  <th className="text-right py-2 px-2">{t('Norme', 'Standard')}</th>
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

      {tab === 'parametres' && (
        <ChartCard title={t('Retraitements manuels & paramètres', 'Manual adjustments & settings')} subtitle={t('Alimentez les retraitements nécessitant des données externes — persistés localement par entité', 'Feed the adjustments requiring external data — stored locally per entity')} accent={ct.at(0)}>
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
            <p className="text-[10px] text-primary-400 flex items-center gap-1"><SlidersHorizontal className="w-3 h-3" /> {t('Les états et ponts se recalculent en temps réel.', 'Statements and bridges recompute in real time.')}</p>
            <button className="btn-outline text-xs" onClick={() => { setManual(DEFAULT_MANUAL); setTaxRate(IFRS_TAX_RATE); }}>{t('Réinitialiser', 'Reset')}</button>
          </div>
        </ChartCard>
      )}

      {tab === 'notes' && (
        <ChartCard title={t('Notes méthodologiques', 'Methodology notes')} subtitle={t('Portée et limites de la conversion', 'Scope & limitations')} accent={ct.at(0)}>
          <div className="space-y-3 text-[12px] text-primary-600 dark:text-primary-300 leading-relaxed">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border-l-2 border-accent">
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p>{t(
                "La révision 2017 de l'AUDCIF (SYSCOHADA révisé) est déjà largement convergée avec les IFRS. Cette conversion applique un reclassement de présentation (IAS 1) et 4 retraitements de fond auto-détectables depuis la balance.",
                'The 2017 AUDCIF revision (revised SYSCOHADA) is already largely converged with IFRS. This conversion applies IAS 1 presentation reclassification and 4 substantive adjustments auto-detected from the trial balance.',
              )}</p>
            </div>
            <p><strong>{t('Retraitements appliqués', 'Applied adjustments')} :</strong> IAS 38 ({t("frais d'établissement", 'establishment costs')}), IAS 21 ({t('change latent', 'unrealised FX')}), IAS 20 ({t('subventions', 'grants')}), IAS 12 ({t('impôt différé sur provisions réglementées', 'deferred tax on regulated provisions')}), IAS 1 (HAO).</p>
            <p><strong>{t('Retraitements sur saisie', 'Input-driven adjustments')} ({t("onglet Paramètres", 'Settings tab')}) :</strong> IFRS 16 ({t('contrats de location', 'leases')}), IAS 19 ({t('engagements de retraite', 'employee benefits')}), IFRS 9 ({t('dépréciation ECL', 'ECL impairment')}), IAS 12 {t('différences temporelles', 'temporary differences')}. {t('Appliqués dès que renseignés, avec impact équilibré sur le SoFP et les ponts.', 'Applied as soon as entered, with a balanced impact on the SoFP and bridges.')}</p>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border-l-2 border-warning">
              <GitCompareArrows className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p>{t(
                `Impôt différé estimé au taux de ${(c.taxRate * 100).toFixed(0)} %. Ces états sont une conversion indicative de gestion — pour un reporting IFRS audité, faites valider les retraitements et compléter les postes manquants par un cabinet.`,
                `Deferred tax estimated at ${(c.taxRate * 100).toFixed(0)}%. These statements are an indicative management conversion — for audited IFRS reporting, have the adjustments validated and the missing items completed by an audit firm.`,
              )}</p>
            </div>
          </div>
        </ChartCard>
      )}
    </div>
  );
}

function IfrsTable({ groups, pick }: { lang: Lang; groups: { title: string; lines: IfrsLine[] }[]; pick: (l: IfrsLine) => string }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {groups.map((grp) => (
          <Fragment key={grp.title}>
            <tr><td colSpan={2} className="pt-3 pb-1 text-[10px] uppercase tracking-wider text-primary-400 font-semibold">{grp.title}</td></tr>
            {grp.lines.map((l) => (
              <tr key={l.code} className={l.total ? 'font-semibold border-t border-primary-100 dark:border-primary-800' : ''}>
                <td className={`py-1 ${l.indent ? 'pl-4 text-primary-600 dark:text-primary-300' : ''}`}>{pick(l)}</td>
                <td className="py-1 text-right num">{fmtFull(l.value)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function ReconTable({ lines, pick }: { lines: IfrsLine[]; pick: (l: IfrsLine) => string }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l, i) => {
          const isTotal = l.total;
          const isFirst = i === 0;
          const isLast = i === lines.length - 1;
          return (
            <tr key={l.code} className={isTotal ? `font-bold ${isLast ? 'border-t-2 border-primary-300 dark:border-primary-600' : ''} ${isFirst ? 'text-primary-500' : ''}` : ''}>
              <td className={`py-1.5 ${l.indent ? 'pl-4' : ''}`}>{pick(l)}</td>
              <td className={`py-1.5 text-right num ${!isTotal && l.value < 0 ? 'text-error' : !isTotal && l.value > 0 ? 'text-success' : ''}`}>
                {!isTotal && l.value > 0 ? '+' : ''}{fmtFull(l.value)}
              </td>
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
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full mt-1 px-3 py-1.5 rounded-lg border border-primary-200 dark:border-primary-700 bg-transparent text-sm num focus:outline-none focus:border-accent"
      />
    </label>
  );
}
