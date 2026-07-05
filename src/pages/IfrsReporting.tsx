// Module Reporting IFRS — conversion SYSCOHADA révisé → IFRS
// Sous-onglets : Mapping · Retraitements · États IFRS · Réconciliation · Notes.
// Bilingue FR/EN. S'appuie sur src/engine/ifrs.ts (retraitements auto-détectés).
import { Fragment, useMemo, useState } from 'react';
import { Globe, ArrowRightLeft, FileText, Scale, GitCompareArrows, Info } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { TabSwitch } from '../components/ui/TabSwitch';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';
import { computeIfrsConversion, type IfrsLine } from '../engine/ifrs';

type Tab = 'mapping' | 'retraitements' | 'etats' | 'reconciliation' | 'notes';
type Lang = 'fr' | 'en';

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
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const { balance } = useStatements();
  const [tab, setTab] = useState<Tab>('etats');
  const [lang, setLang] = useState<Lang>('fr');

  const conv = useMemo(() => (balance && balance.length ? computeIfrsConversion(balance) : null), [balance]);
  const L = (l: IfrsLine) => (lang === 'fr' ? l.fr : l.en);

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
          <button className="btn-outline" onClick={() => setLang((p) => (p === 'fr' ? 'en' : 'fr'))}>
            <Globe className="w-4 h-4" /> {lang === 'fr' ? 'English' : 'Français'}
          </button>
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
            <p><strong>{t('Retraitements NON appliqués', 'NOT applied')} ({t('nécessitent des inputs externes', 'require external inputs')}) :</strong> IFRS 16 ({t('contrats de location', 'leases')}), IAS 19 ({t('engagements de retraite', 'employee benefits')}), IFRS 9 ({t('dépréciation ECL', 'ECL impairment')}), IAS 12 {t('complet', 'full scope')}.</p>
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
