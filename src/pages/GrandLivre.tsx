import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { TabSwitch } from '../components/ui/TabSwitch';
import { toast } from '../components/ui/Toast';
import { VirtualTable, type Column } from '../components/ui/VirtualTable';
import { useApp } from '../store/app';
import type { GLEntry, ImportLog, TiersRule } from '../db/schema';
import { dataProvider } from '../db/provider';
import { useCloudData, invalidateCloudData } from '../hooks/useCloudData';
import { computeBalance, computeAuxBalance, computeTiersReconciliation, matchesDrill, type BalanceRow, type AuxBalanceRow, type GLDrillFilter, type TiersReconRow } from '../engine/balance';
import { applyTiersRules, loadTiersRules } from '../engine/tiersRules';
import { agedBalance, type AgedTier } from '../engine/analytics';
import { fmtFull } from '../lib/format';
import { verifyChain } from '../lib/auditHash';
import Imports from './Imports';

type Tab = 'import' | 'gl' | 'bg' | 'baC' | 'baF' | 'recon' | 'ageeC' | 'ageeF';

const TABS: { key: Tab; label: string }[] = [
  { key: 'import', label: 'Import' },
  { key: 'gl',     label: 'Grand Livre' },
  { key: 'bg',     label: 'Balance générale' },
  { key: 'baC',    label: 'Bal. aux. Clients' },
  { key: 'baF',    label: 'Bal. aux. Fournisseurs' },
  { key: 'recon',  label: 'Rapprochement tiers' },
  { key: 'ageeC',  label: 'Bal. âgée Clients' },
  { key: 'ageeF',  label: 'Bal. âgée Fournisseurs' },
];

// Décrit un filtre de drill-down GL en texte court (pour la puce retirable).
function describeDrill(d: GLDrillFilter): string {
  const parts: string[] = [];
  if (d.tiers) parts.push(`Tiers ${d.tiers}`);
  if (d.account) parts.push(`Compte ${d.account}`);
  else if (d.accountPrefix) parts.push(`Comptes ${d.accountPrefix}*`);
  else if (d.accountIn) parts.push(d.accountIn.length === 1 ? `Compte ${d.accountIn[0]}` : `${d.accountIn.length} compte(s)`);
  if (d.label) parts.push(`« ${d.label} »`);
  if (d.noTiers) parts.push('sans code tiers');
  return parts.join(' · ') || 'Filtre actif';
}

// ─── Page racine ──────────────────────────────────────────────────
export default function GrandLivre() {
  const { currentOrgId, currentYear } = useApp();
  // Si on arrive via "?account=XXX" (depuis le modal d'écart de balance), on
  // ouvre directement l'onglet Grand Livre. Sinon, onglet Import par défaut.
  const initialTab: Tab = (() => {
    if (typeof window === 'undefined') return 'import';
    const params = new URLSearchParams(window.location.search);
    return params.has('account') ? 'gl' : 'import';
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [importId, setImportId] = useState<string>('all');
  // Drill-down : filtre GL posé en cliquant un tiers dans une balance auxiliaire
  // ou la vue de rapprochement. Bascule automatiquement sur l'onglet Grand Livre.
  const [drill, setDrill] = useState<GLDrillFilter | null>(null);
  const drillToGL = (d: GLDrillFilter) => { setDrill(d); setTab('gl'); };
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditReport, setAuditReport] = useState<any | null>(null);
  const [auditing, setAuditing] = useState(false);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const { auditGL } = await import('../engine/glAudit');
      const report = await auditGL(currentOrgId, currentYear);
      setAuditReport(report);
      setAuditOpen(true);
    } catch (e: any) {
      toast.error('Erreur audit', e.message);
    } finally {
      setAuditing(false);
    }
  };

  // (UI Audit) Vérification d'intégrité de la chaîne SHA-256 sur tout le GL
  const [verifying, setVerifying] = useState(false);
  const runVerifyChain = async () => {
    setVerifying(true);
    try {
      const all = await dataProvider.getGLEntries({ orgId: currentOrgId });
      const entries = [...all].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      const chain = entries.map((e) => ({
        id: e.id ?? '',
        date: e.date,
        journal: e.journal,
        piece: e.piece,
        account: e.account,
        label: e.label,
        debit: e.debit,
        credit: e.credit,
        tiers: e.tiers,
        hash: e.hash,
        previousHash: e.previousHash,
      }));
      const result = await verifyChain(chain);
      if (result.valid) {
        toast.success(
          'Intégrité vérifiée ✓',
          `${result.count} écritures — chaîne SHA-256 cohérente. Aucune altération détectée.`,
        );
      } else {
        toast.error(
          'Chaîne d\'intégrité cassée',
          `Altération détectée à l'écriture #${result.brokenAt} (position ${result.brokenIndex}). Une modification a posteriori a été effectuée.`,
        );
      }
    } catch (e: any) {
      toast.error('Erreur vérification', e.message);
    } finally {
      setVerifying(false);
    }
  };

  const { data: imports = [] as ImportLog[] } = useCloudData<ImportLog[]>(
    async () => {
      if (!currentOrgId) return [] as ImportLog[];
      const list = await dataProvider.getImports(currentOrgId);
      return list.filter((i) => i.kind === 'GL').sort((a, b) => b.date - a.date);
    },
    [currentOrgId],
    { initial: [] as ImportLog[], tag: 'imports' },
  );

  const showVersionPicker = tab !== 'import' && imports.length > 0;

  return (
    <div>
      <PageHeader
        title="Grand Livre"
        subtitle="Source unique : le Grand Livre — toutes les balances en sont calculées automatiquement"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {imports.length > 0 && (
              <>
                <button className="btn-outline" onClick={runVerifyChain} disabled={verifying} title="Vérifier la chaîne SHA-256 — détecte toute altération a posteriori des écritures">
                  <ShieldCheck className="w-4 h-4" />
                  {verifying ? 'Vérification…' : 'Vérifier intégrité'}
                </button>
                <button className="btn-primary" onClick={runAudit} disabled={auditing} title="Audit complet du Grand Livre : intégrité, cohérence, qualité, risques">
                  <Search className="w-4 h-4" />
                  {auditing ? 'Analyse…' : 'Auditer le GL'}
                </button>
              </>
            )}
            {showVersionPicker && (
              <>
                <label className="text-xs text-primary-500 font-semibold">Version :</label>
                <select className="input !w-auto !py-1.5 text-xs" value={importId} onChange={(e) => setImportId(e.target.value)}>
                  <option value="all">Toutes les versions ({imports.reduce((s, i) => s + i.count, 0).toLocaleString('fr-FR')} écr.)</option>
                  {imports.map((i) => (
                    <option key={i.id} value={String(i.id)}>
                      {new Date(i.date).toLocaleDateString('fr-FR')} · {i.fileName} · {i.count.toLocaleString('fr-FR')} écr.
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        }
      />
      {auditOpen && auditReport && <AuditModal report={auditReport} onClose={() => setAuditOpen(false)} />}

      <TabSwitch tabs={TABS} value={tab} onChange={setTab} />

      {tab !== 'import' && imports.length === 0 && (
        <Card>
          <p className="text-sm text-primary-500 text-center py-6">
            Aucun Grand Livre importé — bascule sur l'onglet <strong>Import</strong> pour charger un fichier.
          </p>
        </Card>
      )}

      {tab === 'import' && <Imports />}
      {tab === 'gl'     && imports.length > 0 && <GLView      orgId={currentOrgId} year={currentYear} importId={importId} drill={drill} onClearDrill={() => setDrill(null)} />}
      {tab === 'bg'     && imports.length > 0 && <BGView      orgId={currentOrgId} year={currentYear} importId={importId} />}
      {tab === 'baC'    && imports.length > 0 && <AuxView     orgId={currentOrgId} year={currentYear} importId={importId} kind="client" onDrill={drillToGL} />}
      {tab === 'baF'    && imports.length > 0 && <AuxView     orgId={currentOrgId} year={currentYear} importId={importId} kind="fournisseur" onDrill={drillToGL} />}
      {tab === 'recon'  && imports.length > 0 && <ReconView   orgId={currentOrgId} year={currentYear} importId={importId} onDrill={drillToGL} />}
      {tab === 'ageeC'  && imports.length > 0 && <AgedView    orgId={currentOrgId} year={currentYear} importId={importId} kind="client" />}
      {tab === 'ageeF'  && imports.length > 0 && <AgedView    orgId={currentOrgId} year={currentYear} importId={importId} kind="fournisseur" />}
    </div>
  );
}

// ─── AUDIT GL — modale de rapport complet ─────────────────────────
function AuditModal({ report, onClose }: { report: any; onClose: () => void }) {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const findings = report.findings.filter((f: any) => filterSeverity === 'all' || f.severity === filterSeverity);

  const sevColor = (s: string) => s === 'critical' ? '#dc2626' : s === 'major' ? '#d97706' : s === 'minor' ? '#0891b2' : '#6b7280';
  const sevLabel = (s: string) => s === 'critical' ? '⛔ Critique' : s === 'major' ? '⚠ Majeur' : s === 'minor' ? '· Mineur' : 'ℹ Info';
  const scoreColor = report.scoreGlobal >= 90 ? '#16a34a' : report.scoreGlobal >= 70 ? '#d97706' : '#dc2626';

  const exportReport = () => {
    const lines = [
      `RAPPORT D'AUDIT — GRAND LIVRE`,
      `Généré le : ${new Date(report.generatedAt).toLocaleString('fr-FR')}`,
      `Score global : ${report.scoreGlobal} / 100`,
      `Écritures analysées : ${report.totalEntries.toLocaleString('fr-FR')}`,
      `Total Débit : ${report.totalDebit.toLocaleString('fr-FR')} XOF`,
      `Total Crédit : ${report.totalCredit.toLocaleString('fr-FR')} XOF`,
      `Écart : ${report.delta.toLocaleString('fr-FR')} XOF`,
      ``,
      `═══ ANOMALIES (${report.findings.length}) ═══`,
      ``,
    ];
    for (const f of report.findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`  Catégorie : ${f.category}`);
      lines.push(`  Description : ${f.description}`);
      if (f.total) lines.push(`  Montant impacté : ${f.total.toLocaleString('fr-FR')} XOF`);
      lines.push(`  Recommandation : ${f.recommendation}`);
      if (f.examples?.length) {
        lines.push(`  Exemples :`);
        for (const ex of f.examples) {
          const parts = [];
          if (ex.date) parts.push(`Date: ${ex.date}`);
          if (ex.account) parts.push(`Compte: ${ex.account}`);
          if (ex.label) parts.push(`Libellé: ${ex.label}`);
          if (ex.amount) parts.push(`Montant: ${ex.amount.toLocaleString('fr-FR')}`);
          lines.push(`    - ${parts.join(' | ')}`);
        }
      }
      lines.push(``);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-gl-${new Date().toISOString().substring(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-primary-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="p-5 border-b border-primary-200 dark:border-primary-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">🔍 Rapport d'audit Grand Livre</h2>
            <p className="text-xs text-primary-500 mt-1">Généré le {new Date(report.generatedAt).toLocaleString('fr-FR')} · {report.totalEntries.toLocaleString('fr-FR')} écritures analysées</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={exportReport}>📥 Exporter TXT</button>
            <button className="btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* SCORECARD */}
        <div className="p-5 border-b border-primary-200 dark:border-primary-800 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-3" style={{ borderLeft: `4px solid ${scoreColor}` }}>
            <p className="text-[10px] uppercase text-primary-500 font-semibold">Score global</p>
            <p className="num text-2xl font-bold" style={{ color: scoreColor }}>{report.scoreGlobal} / 100</p>
            <p className="text-[10px] text-primary-500">{report.scoreGlobal >= 90 ? 'Excellent' : report.scoreGlobal >= 70 ? 'À améliorer' : 'Critique'}</p>
          </div>
          <div className="card p-3" style={{ borderLeft: `4px solid ${sevColor('critical')}` }}>
            <p className="text-[10px] uppercase text-primary-500 font-semibold">Critique</p>
            <p className="num text-2xl font-bold" style={{ color: sevColor('critical') }}>{report.byseverity.critical}</p>
          </div>
          <div className="card p-3" style={{ borderLeft: `4px solid ${sevColor('major')}` }}>
            <p className="text-[10px] uppercase text-primary-500 font-semibold">Majeur</p>
            <p className="num text-2xl font-bold" style={{ color: sevColor('major') }}>{report.byseverity.major}</p>
          </div>
          <div className="card p-3" style={{ borderLeft: `4px solid ${sevColor('minor')}` }}>
            <p className="text-[10px] uppercase text-primary-500 font-semibold">Mineur</p>
            <p className="num text-2xl font-bold" style={{ color: sevColor('minor') }}>{report.byseverity.minor}</p>
          </div>
          <div className="card p-3" style={{ borderLeft: `4px solid ${sevColor('info')}` }}>
            <p className="text-[10px] uppercase text-primary-500 font-semibold">Info</p>
            <p className="num text-2xl font-bold" style={{ color: sevColor('info') }}>{report.byseverity.info}</p>
          </div>
        </div>

        {/* FILTRES */}
        <div className="px-5 py-3 border-b border-primary-200 dark:border-primary-800 flex gap-2 items-center">
          <span className="text-xs uppercase text-primary-500 font-semibold">Filtrer :</span>
          {['all', 'critical', 'major', 'minor', 'info'].map((s) => (
            <button key={s} onClick={() => setFilterSeverity(s)}
              className={clsx('px-2 py-1 rounded text-xs font-semibold transition',
                filterSeverity === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800')}>
              {s === 'all' ? 'Tous' : sevLabel(s).split(' ')[1]}
            </button>
          ))}
          <span className="ml-auto text-xs text-primary-500">{findings.length} anomalie(s)</span>
        </div>

        {/* FINDINGS */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {findings.length === 0 ? (
            <div className="text-center py-12 text-success">
              <p className="text-3xl">✓</p>
              <p className="font-semibold mt-2">Aucune anomalie détectée pour ce filtre.</p>
            </div>
          ) : findings.map((f: any) => (
            <div key={f.id} className="card p-4" style={{ borderLeft: `4px solid ${sevColor(f.severity)}` }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: sevColor(f.severity) + '20', color: sevColor(f.severity) }}>
                      {sevLabel(f.severity)}
                    </span>
                    <span className="text-[10px] text-primary-500 uppercase tracking-wider">{f.category}</span>
                  </div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                </div>
                {f.total && <span className="num text-xs text-primary-500">{f.total.toLocaleString('fr-FR')} XOF</span>}
              </div>
              <p className="text-xs text-primary-700 dark:text-primary-300 mb-2">{f.description}</p>
              {f.examples && f.examples.length > 0 && (
                <details className="mb-2">
                  <summary className="text-[10px] text-primary-500 cursor-pointer hover:text-primary-900 dark:hover:text-primary-100">Voir {f.examples.length} exemple(s)</summary>
                  <div className="mt-2 space-y-1 pl-3 border-l-2 border-primary-200 dark:border-primary-800">
                    {f.examples.map((ex: any, i: number) => (
                      <div key={i} className="text-[10px] text-primary-600 dark:text-primary-400 font-mono">
                        {ex.date && `${ex.date} · `}
                        {ex.account && <strong>{ex.account}</strong>}
                        {ex.label && ` · ${ex.label}`}
                        {ex.piece && ` · #${ex.piece}`}
                        {ex.amount !== undefined && ` · ${ex.amount.toLocaleString('fr-FR')}`}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded text-[11px] text-primary-700 dark:text-primary-300">
                <strong>💡 Recommandation :</strong> {f.recommendation}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 1. GRAND LIVRE — table avec SOLDE PROGRESSIF ─────────────────
type GLRow = GLEntry & { soldeProgressif: number; solde: number };

const glColumns: Column<GLRow>[] = [
  { header: 'Compte',          width: '110px', cell: (e) => <span className="num font-mono">{e.account}</span> },
  { header: 'Libellé',         width: '180px', cell: (e) => <span className="text-xs truncate">{e.label}</span> },
  { header: 'Date',            width: '100px', cell: (e) => <span className="num text-xs">{e.date}</span> },
  { header: 'Journal',         width: '70px',  cell: (e) => <span className="text-xs font-mono">{e.journal}</span> },
  { header: 'N° saisi',        width: '100px', cell: (e) => <span className="text-xs font-mono">{e.piece}</span> },
  { header: 'Description',     width: '1fr',   cell: (e) => <span className="text-xs truncate">{e.label}</span> },
  { header: 'Tiers',           width: '110px', cell: (e) => <span className="text-xs font-mono">{e.tiers ?? ''}</span> },
  { header: 'Code analytique', width: '120px', cell: (e) => <span className="text-xs font-mono">{e.analyticalAxis ?? e.analyticalSection ?? ''}</span> },
  { header: 'Lettrage',        width: '70px',  cell: (e) => <span className="text-xs font-mono">{e.lettrage ?? ''}</span> },
  { header: 'Débit',           width: '110px', align: 'right', cell: (e) => <span className="num">{e.debit > 0 ? fmtFull(e.debit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Crédit',          width: '110px', align: 'right', cell: (e) => <span className="num">{e.credit > 0 ? fmtFull(e.credit) : <span className="text-primary-400">—</span>}</span> },
  { header: 'Solde progressif',width: '130px', align: 'right', cell: (e) => <span className={clsx('num', e.soldeProgressif < 0 ? 'text-error' : '')}>{fmtFull(e.soldeProgressif)}</span> },
  { header: 'Solde',           width: '110px', align: 'right', cell: (e) => <span className={clsx('num', e.solde < 0 ? 'text-error' : '')}>{fmtFull(e.solde)}</span> },
];

function GLView({ orgId, year, importId, drill, onClearDrill }: { orgId: string; year: number; importId: string; drill?: GLDrillFilter | null; onClearDrill?: () => void }) {
  const [search, setSearch] = useState('');
  const [journal, setJournal] = useState('all');
  const [accountPrefix, setAccountPrefix] = useState('');

  // Si on arrive via "?account=XXX" (depuis le modal d'écart de balance dans Reports),
  // on préfiltre automatiquement le GL sur ce compte.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accountParam = params.get('account');
    if (accountParam) {
      setAccountPrefix(accountParam);
      // Nettoie l'URL pour que le filtre persiste sans rester dans l'URL
      const url = new URL(window.location.href);
      url.searchParams.delete('account');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const { data: periodIds = new Set<string>() } = useCloudData<Set<string>>(
    async () => {
      if (!orgId) return new Set<string>();
      const periods = await dataProvider.getPeriods(orgId);
      return new Set(periods.filter((p) => p.year === year).map((p) => p.id));
    },
    [orgId, year],
    { initial: new Set<string>(), tag: 'periods' },
  );

  const { data: entries = [] as GLEntry[] } = useCloudData<GLEntry[]>(
    () => orgId ? dataProvider.getGLEntries({ orgId }) : Promise.resolve([] as GLEntry[]),
    [orgId],
    { initial: [] as GLEntry[], tag: 'gl' },
  );

  const journals = useMemo(() => Array.from(new Set(entries.map((e) => e.journal))).sort(), [entries]);

  // Filtre + tri + calcul SOLDE PROGRESSIF par compte
  const rows: GLRow[] = useMemo(() => {
    const filtered = entries
      .filter((e) => periodIds.has(e.periodId))
      .filter((e) => importId === 'all' || String(e.importId) === String(importId))
      .filter((e) => journal === 'all' || e.journal === journal)
      .filter((e) => !accountPrefix || e.account.startsWith(accountPrefix))
      .filter((e) => !drill || matchesDrill(e, drill))
      .filter((e) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return e.label.toLowerCase().includes(q) || e.account.includes(search) || (e.piece || '').toLowerCase().includes(q) || (e.tiers || '').toLowerCase().includes(q);
      });
    // Tri compte → date pour calcul du progressif
    const sorted = [...filtered].sort((a, b) => a.account.localeCompare(b.account) || a.date.localeCompare(b.date));
    const running = new Map<string, number>();
    return sorted.map((e) => {
      const cur = (running.get(e.account) ?? 0) + e.debit - e.credit;
      running.set(e.account, cur);
      return { ...e, soldeProgressif: cur, solde: e.debit - e.credit };
    });
  }, [entries, periodIds, importId, journal, accountPrefix, search, drill]);

  const totD = rows.reduce((s, e) => s + e.debit, 0);
  const totC = rows.reduce((s, e) => s + e.credit, 0);
  const balanced = Math.abs(totD - totC) < 1;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-2 items-end">
          <input className="input !py-1.5 max-w-sm" placeholder="Rechercher libellé / compte / pièce / tiers…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input !w-auto !py-1.5" value={journal} onChange={(e) => setJournal(e.target.value)}>
            <option value="all">Tous journaux</option>
            {journals.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <input className="input !w-32 !py-1.5 num font-mono" placeholder="Compte…"
            value={accountPrefix} onChange={(e) => setAccountPrefix(e.target.value)} />
          <span className="ml-auto text-xs text-primary-500">
            <span className="num font-semibold">{rows.length}</span> écriture(s) sur <span className="num">{entries.length}</span>
          </span>
          <EquilibreBadge balanced={balanced} delta={totD - totC} />
        </div>
        {drill && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-primary-500">Filtre tiers actif :</span>
            <span className="inline-flex items-center gap-1.5 bg-accent/10 text-accent rounded-full px-2.5 py-1 font-semibold">
              {describeDrill(drill)}
              {onClearDrill && (
                <button onClick={onClearDrill} className="hover:text-accent-dark" title="Retirer le filtre tiers" aria-label="Retirer le filtre tiers">✕</button>
              )}
            </span>
          </div>
        )}
      </Card>

      <Card padded={false}>
        <VirtualTable
          rows={rows} rowKey={(_, i) => i} rowHeight={28} height={620}
          empty="Aucune écriture pour ces filtres" columns={glColumns}
          footer={<>
            <div className="py-2 px-3 col-span-9">TOTAUX</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totC)}</div>
            <div className="py-2 px-3 text-right num"></div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD - totC)}</div>
          </>}
        />
      </Card>
    </div>
  );
}

// ─── 2. BALANCE GÉNÉRALE (avec regroupement par classe collapsible) ──
const CLASS_LABELS: Record<string, string> = {
  '1': 'Classe 1 — Ressources durables',
  '2': 'Classe 2 — Actif immobilisé',
  '3': 'Classe 3 — Stocks',
  '4': 'Classe 4 — Tiers',
  '5': 'Classe 5 — Trésorerie',
  '6': 'Classe 6 — Charges',
  '7': 'Classe 7 — Produits',
  '8': 'Classe 8 — Autres',
};

function BGView({ orgId, year, importId }: { orgId: string; year: number; importId: string }) {
  const [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [diagEntries, setDiagEntries] = useState<GLEntry[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true });
  useEffect(() => { if (orgId) computeBalance({ orgId, year, importId }).then(setRows); }, [orgId, year, importId]);

  // Charge les écritures pour le diagnostic (pièces déséquilibrées)
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [periods, all] = await Promise.all([
        dataProvider.getPeriods(orgId),
        dataProvider.getGLEntries({ orgId }),
      ]);
      const periodIds = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
      const filtered = all.filter((e) => periodIds.has(e.periodId) && (!importId || importId === 'all' || String(e.importId) === String(importId)));
      setDiagEntries(filtered);
    })();
  }, [orgId, year, importId]);

  const filtered = rows
    .filter((r) => classFilter === 'all' || r.account[0] === classFilter)
    .filter((r) => !search || r.account.includes(search) || r.label.toLowerCase().includes(search.toLowerCase()));
  const totD = filtered.reduce((s, r) => s + r.debit, 0);
  const totC = filtered.reduce((s, r) => s + r.credit, 0);
  const totSD = filtered.reduce((s, r) => s + r.soldeD, 0);
  const totSC = filtered.reduce((s, r) => s + r.soldeC, 0);

  // ─── Diagnostic de l'écart ───────────────────────────────────
  // On calcule TOUJOURS sur les données brutes (rows, pas filtered) — l'écart
  // est une propriété de l'import, pas de la vue filtrée.
  const globalDelta = useMemo(() => {
    return rows.reduce((s, r) => s + r.debit - r.credit, 0);
  }, [rows]);

  const isDiscrepancy = Math.abs(globalDelta) >= 1;

  // Identification des pièces et comptes suspects
  const { topUnbalancedPieces, problematicAccounts, fallbackAccounts } = useMemo(() => {
    const pieceMap = new Map<string, { journal: string; piece: string; debit: number; credit: number; accounts: Set<string>; dates: Set<string>; count: number }>();
    for (const e of diagEntries) {
      // Clé : journal||piece. Entrées sans piece/journal groupées sous "∅||∅"
      const key = `${e.journal || '∅'}||${e.piece || '∅'}`;
      let p = pieceMap.get(key);
      if (!p) {
        p = { journal: e.journal || '(sans journal)', piece: e.piece || '(sans n°)', debit: 0, credit: 0, accounts: new Set(), dates: new Set(), count: 0 };
        pieceMap.set(key, p);
      }
      p.debit += e.debit;
      p.credit += e.credit;
      p.accounts.add(e.account);
      p.dates.add(e.date);
      p.count++;
    }
    const unbalanced = Array.from(pieceMap.values())
      .map((p) => ({ ...p, gap: p.debit - p.credit }))
      .filter((p) => Math.abs(p.gap) > 0.5)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    // Comptes touchés par au moins une pièce déséquilibrée
    const suspects = new Set<string>();
    for (const p of unbalanced) for (const a of p.accounts) suspects.add(a);
    // Si aucune pièce n'est déséquilibrée mais qu'il y a un écart, on marque
    // comme suspects les comptes avec le plus grand écart D-C (fallback).
    if (suspects.size === 0 && Math.abs(totD - totC) >= 1) {
      [...rows]
        .filter((r) => Math.abs(r.debit - r.credit) > 0.5)
        .sort((a, b) => Math.abs(b.debit - b.credit) - Math.abs(a.debit - a.credit))
        .slice(0, 10)
        .forEach((r) => suspects.add(r.account));
    }

    // FALLBACK : si AUCUNE pièce n'est détectée comme déséquilibrée mais qu'il
    // y a un écart global, on expose les comptes qui contribuent le plus à
    // l'écart (D-C net non nul qui ne se compense pas).
    const fallback = [...rows]
      .map((r) => ({ account: r.account, label: r.label, debit: r.debit, credit: r.credit, delta: r.debit - r.credit }))
      .filter((r) => Math.abs(r.delta) > 0.5)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10);

    return {
      topUnbalancedPieces: unbalanced.slice(0, 10),
      problematicAccounts: suspects,
      fallbackAccounts: fallback,
    };
  }, [diagEntries, rows]);

  // Groupement par classe
  const byClass = new Map<string, BalanceRow[]>();
  filtered.forEach((r) => {
    const k = r.account[0];
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  });
  const classes = Array.from(byClass.keys()).sort();

  const expandAll = () => setExpanded(Object.fromEntries(classes.map((c) => [c, true])));
  const collapseAll = () => setExpanded({});

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2 items-center flex-wrap">
          <input className="input !py-1.5 max-w-xs" placeholder="Compte / libellé…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input !w-auto !py-1.5" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="all">Toutes classes</option>
            {['1','2','3','4','5','6','7','8'].map((c) => <option key={c} value={c}>Classe {c}</option>)}
          </select>
          <button onClick={expandAll} className="text-[11px] text-primary-500 hover:text-primary-900 px-2">Tout déplier</button>
          <span className="text-primary-300">·</span>
          <button onClick={collapseAll} className="text-[11px] text-primary-500 hover:text-primary-900 px-2">Tout replier</button>
          <span className="ml-auto text-xs text-primary-500"><span className="num font-semibold">{filtered.length}</span> compte(s) sur <span className="num">{rows.length}</span></span>
          <EquilibreBadge
            balanced={Math.abs(totD - totC) < 1}
            delta={totD - totC}
            onOpen={() => setDiagOpen(true)}
          />
        </div>
      </Card>

      {/* Bannière de diagnostic : affichée automatiquement quand la balance est déséquilibrée */}
      {isDiscrepancy && (
        <div className="card border-l-4 !border-l-error bg-error/5 p-4">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-error">⚠ Balance déséquilibrée — écart de {fmtFull(globalDelta)} XOF</p>
              <p className="text-[11px] text-primary-600 dark:text-primary-300 mt-0.5">
                {topUnbalancedPieces.length > 0
                  ? <><strong>{topUnbalancedPieces.length}</strong> pièce(s) à l'origine de l'écart · <strong>{problematicAccounts.size}</strong> compte(s) impliqué(s) (surlignés en rouge ci-dessous)</>
                  : <>Aucune pièce déséquilibrée individuellement détectée — l'écart résulte d'un import incomplet. <strong>Voici les {fallbackAccounts.length} comptes</strong> qui contribuent le plus à l'écart :</>}
              </p>
            </div>
            <button className="btn-outline !py-1 text-xs" onClick={() => setDiagOpen(true)}>
              Voir tout le diagnostic →
            </button>
          </div>

          {/* TABLEAU A : pièces déséquilibrées (quand détectées) */}
          {topUnbalancedPieces.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                  <tr>
                    <th className="text-left py-1.5 px-2">#</th>
                    <th className="text-left py-1.5 px-2">Journal</th>
                    <th className="text-left py-1.5 px-2">N° pièce</th>
                    <th className="text-left py-1.5 px-2">Date</th>
                    <th className="text-right py-1.5 px-2">Débit</th>
                    <th className="text-right py-1.5 px-2">Crédit</th>
                    <th className="text-right py-1.5 px-2">Écart</th>
                    <th className="text-left py-1.5 px-2">Comptes impliqués</th>
                  </tr>
                </thead>
                <tbody>
                  {topUnbalancedPieces.slice(0, 5).map((p, i) => (
                    <tr key={i} className="border-b border-primary-200/40 dark:border-primary-800/40 hover:bg-error/10">
                      <td className="py-1 px-2 num text-primary-500">{i + 1}</td>
                      <td className="py-1 px-2"><span className="inline-block bg-primary-200 dark:bg-primary-800 rounded px-1.5 py-0.5 font-mono text-[10px]">{p.journal}</span></td>
                      <td className="py-1 px-2 num font-mono font-semibold">{p.piece}</td>
                      <td className="py-1 px-2 text-[10px] text-primary-500 num">{Array.from(p.dates).slice(0, 1).join('')}{p.dates.size > 1 ? ` (+${p.dates.size - 1})` : ''}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(p.debit)}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(p.credit)}</td>
                      <td className="py-1 px-2 text-right num font-bold text-error">{p.gap > 0 ? '+' : ''}{fmtFull(p.gap)}</td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(p.accounts).slice(0, 6).map((a) => (
                            <span key={a} className="inline-block bg-error/15 text-error rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">{a}</span>
                          ))}
                          {p.accounts.size > 6 && <span className="text-[10px] text-primary-400">+{p.accounts.size - 6}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-primary-400 italic mt-2">
                💡 Ces écritures doivent être corrigées dans votre logiciel source (Sage / Cegid / etc.) puis le fichier réimporté. Les comptes surlignés en rouge dans le tableau ci-dessous sont impactés.
              </p>
            </div>
          )}

          {/* TABLEAU B (fallback) : comptes qui contribuent à l'écart quand aucune pièce n'est déséquilibrée */}
          {topUnbalancedPieces.length === 0 && fallbackAccounts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                  <tr>
                    <th className="text-left py-1.5 px-2">#</th>
                    <th className="text-left py-1.5 px-2">Compte</th>
                    <th className="text-left py-1.5 px-2">Libellé</th>
                    <th className="text-right py-1.5 px-2">Débit</th>
                    <th className="text-right py-1.5 px-2">Crédit</th>
                    <th className="text-right py-1.5 px-2">Δ (D − C)</th>
                  </tr>
                </thead>
                <tbody>
                  {fallbackAccounts.map((r, i) => (
                    <tr key={r.account} className="border-b border-primary-200/40 dark:border-primary-800/40 hover:bg-error/10">
                      <td className="py-1 px-2 num text-primary-500">{i + 1}</td>
                      <td className="py-1 px-2 num font-mono font-semibold text-error">{r.account}</td>
                      <td className="py-1 px-2">{r.label}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.debit)}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.credit)}</td>
                      <td className={clsx('py-1 px-2 text-right num font-bold', r.delta > 0 ? 'text-primary-700 dark:text-primary-200' : 'text-error')}>
                        {r.delta > 0 ? '+' : ''}{fmtFull(r.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-primary-400 italic mt-2">
                💡 Causes possibles : écritures importées sans contrepartie, fichier GL partiel, ou comptes d'opening balance (AN) mal équilibrés. Vérifiez votre fichier source.
              </p>
            </div>
          )}
        </div>
      )}

      <DiscrepancyModal open={diagOpen} onClose={() => setDiagOpen(false)} rows={rows} entries={diagEntries} />

      <Card padded={false}>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700 sticky top-0 bg-primary-100 dark:bg-primary-900 z-10">
              <tr>
                <th className="text-left py-2 w-8"></th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Débit</th>
                <th className="text-right py-2 px-3">Crédit</th>
                <th className="text-right py-2 px-3">Solde D</th>
                <th className="text-right py-2 px-3">Solde C</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {classes.map((c) => {
                const cRows = byClass.get(c) ?? [];
                const cD = cRows.reduce((s, r) => s + r.debit, 0);
                const cC = cRows.reduce((s, r) => s + r.credit, 0);
                const cSD = cRows.reduce((s, r) => s + r.soldeD, 0);
                const cSC = cRows.reduce((s, r) => s + r.soldeC, 0);
                const isOpen = expanded[c];
                return [
                  <tr key={`h-${c}`} className="bg-primary-200 dark:bg-primary-800 font-semibold">
                    <td className="py-2 pl-2 w-8 text-center">
                      <button onClick={() => setExpanded((e) => ({ ...e, [c]: !e[c] }))} className="w-5 h-5 rounded hover:bg-primary-300 dark:hover:bg-primary-700 text-xs font-bold">
                        {isOpen ? '−' : '+'}
                      </button>
                    </td>
                    <td className="py-2 px-3 num font-mono">Cl. {c}</td>
                    <td className="py-2 px-3">{CLASS_LABELS[c] ?? `Classe ${c}`} <span className="text-[10px] text-primary-500 font-normal">({cRows.length} comptes)</span></td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cD)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cC)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cSD)}</td>
                    <td className="py-2 px-3 text-right num">{fmtFull(cSC)}</td>
                  </tr>,
                  ...(isOpen ? cRows.map((r) => {
                    const isSuspect = problematicAccounts.has(r.account);
                    return (
                      <tr
                        key={r.account}
                        className={clsx(
                          'hover:bg-primary-100/50 dark:hover:bg-primary-900/50',
                          isSuspect && 'bg-error/5 border-l-2 border-error',
                        )}
                        title={isSuspect ? "⚠ Ce compte est impliqué dans une pièce déséquilibrée — voir la bannière rouge en haut" : undefined}
                      >
                        <td className="text-center">
                          {isSuspect && <span className="text-error text-xs font-bold" aria-label="Compte suspect">⚠</span>}
                        </td>
                        <td className={clsx('py-1.5 px-3 num font-mono text-xs', isSuspect && 'font-bold text-error')}>{r.account}</td>
                        <td className="py-1.5 px-3 text-xs">{r.label}</td>
                        <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.debit)}</td>
                        <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.credit)}</td>
                        <td className="py-1.5 px-3 text-right num text-xs">{r.soldeD ? fmtFull(r.soldeD) : ''}</td>
                        <td className="py-1.5 px-3 text-right num text-xs">{r.soldeC ? fmtFull(r.soldeC) : ''}</td>
                      </tr>
                    );
                  }) : []),
                ];
              })}
            </tbody>
            <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 sticky bottom-0">
              <tr className="font-bold">
                <td></td>
                <td colSpan={2} className="py-2 px-3">TOTAUX</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totD)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totC)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totSD)}</td>
                <td className="py-2 px-3 text-right num">{fmtFull(totSC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── 3. BALANCE AUXILIAIRE (Clients ou Fournisseurs) ──────────────
const auxColumns: Column<AuxBalanceRow>[] = [
  { header: 'Tiers',   width: '140px', cell: (r) => <span className="num font-mono">{r.tier}</span> },
  { header: 'Libellé', width: '1fr',   cell: (r) => <span className="text-xs">{r.label}</span> },
  { header: 'Compte',  width: '110px', cell: (r) => <span className="num font-mono text-xs text-primary-500">{r.account}</span> },
  { header: 'Débit',   width: '150px', align: 'right', cell: (r) => <span className="num">{r.debit > 0 ? fmtFull(r.debit) : ''}</span> },
  { header: 'Crédit',  width: '150px', align: 'right', cell: (r) => <span className="num">{r.credit > 0 ? fmtFull(r.credit) : ''}</span> },
  { header: 'Solde',   width: '150px', align: 'right', cell: (r) => <span className={clsx('num font-semibold', r.solde < 0 ? 'text-error' : 'text-success')}>{fmtFull(r.solde)}</span> },
];

function AuxView({ orgId, year, importId, kind, onDrill }: { orgId: string; year: number; importId: string; kind: 'client' | 'fournisseur'; onDrill: (d: GLDrillFilter) => void }) {
  const [rows, setRows] = useState<AuxBalanceRow[]>([]);
  const [search, setSearch] = useState('');
  // Diagnostic data quality : pour détecter "0 tier renseigné" et afficher
  // une bannière "Import GL Tiers requis" au lieu d'une ligne aggrégée mystérieuse.
  const [diag, setDiag] = useState<{ totalEntries: number; withTiers: number; distinctAccounts: number } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void computeAuxBalance({ orgId, year, kind, importId }).then(setRows);
    // Diagnostic indépendant pour la bannière info
    const prefix = kind === 'client' ? '411' : '401';
    void dataProvider.getGLEntries({ orgId }).then((entries) => {
      const sub = entries.filter((e) => e.account.startsWith(prefix));
      const withTiers = sub.filter((e) => !!e.tiers).length;
      const distinctAccounts = new Set(sub.map((e) => e.account)).size;
      setDiag({ totalEntries: sub.length, withTiers, distinctAccounts });
    });
  }, [orgId, year, kind, importId]);

  const filtered = rows.filter((r) => !search || r.tier.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()) || r.account.includes(search));
  const totD = filtered.reduce((s, r) => s + r.debit, 0);
  const totC = filtered.reduce((s, r) => s + r.credit, 0);
  const totS = filtered.reduce((s, r) => s + r.solde, 0);
  const balanced = Math.abs(totD - totC - totS) < 1;

  // Détection : aucun tier code n'est renseigné dans le GL pour ces comptes.
  // C'est le cas typique où :
  //   - L'import GL est OK (entries > 0)
  //   - Mais l'import GL Tiers n'a pas été lancé (ou ses enrichissements
  //     ont été perdus suite à un cleanup / re-import GL).
  // Dans ce cas, la balance auxiliaire fallback sur "agrégation par libellé"
  // (1 seule ligne "CLIENTS" pour 2930 écritures) — pas utile pour l'utilisateur.
  const noTiersEnriched = diag !== null && diag.totalEntries > 0 && diag.withTiers === 0;

  return (
    <div className="space-y-4">
      {noTiersEnriched && (
        <Card>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border-l-4 border-warning">
            <svg className="w-5 h-5 text-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 text-xs">
              <p className="font-semibold text-warning-dark">Import GL Tiers requis pour le détail par {kind === 'client' ? 'client' : 'fournisseur'}</p>
              <p className="mt-1 text-primary-700 dark:text-primary-300 leading-relaxed">
                Votre Grand Livre contient <strong className="num">{diag.totalEntries.toLocaleString('fr-FR')}</strong> écritures
                sur les comptes {kind === 'client' ? '411' : '401'}, mais <strong>aucune n'a de code tiers renseigné</strong>.
                La balance ne peut donc afficher qu'une ligne agrégée par compte parent.
              </p>
              <p className="mt-2 text-primary-600 dark:text-primary-400">
                → Allez sur <strong>Imports Tiers</strong> et déposez votre fichier GL Tiers. L'algorithme va enrichir
                automatiquement les écritures GL existantes avec le code tiers individuel
                (CLI001, CLI002, FRN042…), et cette balance affichera enfin le détail par tier.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex gap-2 items-center">
          <input className="input !py-1.5 max-w-xs" placeholder={`Tiers / libellé ${kind === 'client' ? 'client' : 'fournisseur'}…`}
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="ml-auto text-xs text-primary-500">
            <span className="num font-semibold">{filtered.length}</span> tiers sur <span className="num">{rows.length}</span>
          </span>
          <EquilibreBadge balanced={balanced} delta={totD - totC} />
        </div>
        <p className="mt-2 text-[11px] text-primary-400">💡 Cliquez une ligne pour ouvrir le Grand Livre filtré sur ce tiers.</p>
      </Card>
      <Card padded={false}>
        <VirtualTable
          rows={filtered} rowKey={(r) => r.tier} rowHeight={30} height={560}
          onRowClick={(r) => onDrill(r.drill)}
          empty={`Aucun tiers ${kind} avec un solde non nul — vérifie que des écritures ${kind === 'client' ? '411' : '401'} existent.`}
          columns={auxColumns}
          footer={<>
            <div className="py-2 px-3 col-span-3">TOTAUX</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totD)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totC)}</div>
            <div className="py-2 px-3 text-right num">{fmtFull(totS)}</div>
          </>}
        />
      </Card>
    </div>
  );
}

// ─── Badge équilibre — réutilisé partout ─────────────────────────
function EquilibreBadge({ balanced, delta, onOpen }: { balanced: boolean; delta: number; onOpen?: () => void }) {
  if (balanced) {
    return <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-full">✓ Équilibré</span>;
  }
  if (!onOpen) {
    return <span className="text-xs font-semibold text-error bg-error/10 px-2 py-1 rounded-full">⚠ Écart : {fmtFull(delta)}</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-xs font-semibold text-error bg-error/10 hover:bg-error/20 px-2 py-1 rounded-full transition cursor-pointer"
      title="Cliquer pour voir les comptes & pièces à l'origine de l'écart"
    >
      ⚠ Écart : {fmtFull(delta)} — diagnostiquer
    </button>
  );
}

// ─── Modale : comptes et pièces contribuant à l'écart ────────────
function DiscrepancyModal({ open, onClose, rows, entries }: {
  open: boolean;
  onClose: () => void;
  rows: BalanceRow[];
  entries: GLEntry[];
}) {
  if (!open) return null;

  // Top 20 comptes contribuant à l'écart (net D-C)
  const topContrib = [...rows]
    .map((r) => ({ account: r.account, label: r.label, debit: r.debit, credit: r.credit, delta: r.debit - r.credit }))
    .filter((r) => Math.abs(r.delta) > 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 50);

  // Pièces déséquilibrées (journal + piece doit avoir D = C)
  const pieceMap = new Map<string, { journal: string; piece: string; debit: number; credit: number; accounts: Set<string>; count: number; dates: Set<string> }>();
  for (const e of entries) {
    const key = `${e.journal}||${e.piece}`;
    let p = pieceMap.get(key);
    if (!p) {
      p = { journal: e.journal, piece: e.piece, debit: 0, credit: 0, accounts: new Set(), count: 0, dates: new Set() };
      pieceMap.set(key, p);
    }
    p.debit += e.debit;
    p.credit += e.credit;
    p.accounts.add(e.account);
    p.dates.add(e.date);
    p.count++;
  }
  const unbalanced = Array.from(pieceMap.values())
    .map((p) => ({ ...p, gap: p.debit - p.credit }))
    .filter((p) => Math.abs(p.gap) > 0.5)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 30);
  const totalPiecesUnbalanced = Array.from(pieceMap.values()).filter((p) => Math.abs(p.debit - p.credit) > 0.5).length;

  const totalDelta = rows.reduce((s, r) => s + r.debit - r.credit, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-primary-50 dark:bg-primary-900 rounded-xl border border-primary-200 dark:border-primary-800 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-primary-200 dark:border-primary-800">
          <div>
            <h3 className="font-semibold text-primary-900 dark:text-primary-100">Diagnostic de l'écart de balance</h3>
            <p className="text-xs text-primary-500 mt-0.5">Écart total Débit − Crédit&nbsp;: <span className="font-semibold text-error num">{fmtFull(totalDelta)}</span> · {totalPiecesUnbalanced} pièce(s) déséquilibrée(s)</p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-primary-500 mb-2">Top comptes avec écart D − C ≠ 0</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                  <tr>
                    <th className="text-left py-1.5 px-2">Compte</th>
                    <th className="text-left py-1.5 px-2">Libellé</th>
                    <th className="text-right py-1.5 px-2">Débit</th>
                    <th className="text-right py-1.5 px-2">Crédit</th>
                    <th className="text-right py-1.5 px-2">Δ (D − C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                  {topContrib.map((r) => (
                    <tr key={r.account} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                      <td className="py-1 px-2 num font-mono">{r.account}</td>
                      <td className="py-1 px-2">{r.label}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.debit)}</td>
                      <td className="py-1 px-2 text-right num">{fmtFull(r.credit)}</td>
                      <td className={clsx('py-1 px-2 text-right num font-semibold', r.delta > 0 ? 'text-primary-700 dark:text-primary-200' : 'text-error')}>{fmtFull(r.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-primary-400 mt-2">
              En comptabilité équilibrée, chaque compte peut avoir un solde (D − C), mais la <strong>somme globale</strong> doit être zéro. Si ce n'est pas le cas, ce sont souvent des pièces déséquilibrées à l'import (ci-dessous).
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-primary-500 mb-2">Pièces déséquilibrées (journal + n° pièce)</h4>
            {unbalanced.length === 0 ? (
              <p className="text-xs text-primary-500 py-4">Aucune pièce déséquilibrée détectée — l'écart provient uniquement des soldes d'ouverture / comptes non-balancés individuellement.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                    <tr>
                      <th className="text-left py-1.5 px-2">Journal</th>
                      <th className="text-left py-1.5 px-2">Pièce</th>
                      <th className="text-left py-1.5 px-2">Dates</th>
                      <th className="text-right py-1.5 px-2">Nb lignes</th>
                      <th className="text-right py-1.5 px-2">Débit</th>
                      <th className="text-right py-1.5 px-2">Crédit</th>
                      <th className="text-right py-1.5 px-2">Écart</th>
                      <th className="text-left py-1.5 px-2">Comptes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                    {unbalanced.map((p, i) => (
                      <tr key={i} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                        <td className="py-1 px-2"><span className="inline-block bg-primary-200 dark:bg-primary-800 rounded px-1.5 py-0.5 font-mono text-[10px]">{p.journal}</span></td>
                        <td className="py-1 px-2 num font-mono">{p.piece || '—'}</td>
                        <td className="py-1 px-2 text-[10px]">{Array.from(p.dates).slice(0, 2).join(', ')}{p.dates.size > 2 ? '…' : ''}</td>
                        <td className="py-1 px-2 text-right num">{p.count}</td>
                        <td className="py-1 px-2 text-right num">{fmtFull(p.debit)}</td>
                        <td className="py-1 px-2 text-right num">{fmtFull(p.credit)}</td>
                        <td className="py-1 px-2 text-right num font-semibold text-error">{fmtFull(p.gap)}</td>
                        <td className="py-1 px-2">
                          <div className="flex flex-wrap gap-0.5">
                            {Array.from(p.accounts).slice(0, 5).map((a) => (
                              <span key={a} className="inline-block bg-primary-100 dark:bg-primary-800 rounded px-1 py-0.5 font-mono text-[9px]">{a}</span>
                            ))}
                            {p.accounts.size > 5 && <span className="text-[9px] text-primary-400">+{p.accounts.size - 5}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3bis. RAPPROCHEMENT TIERS (Balance auxiliaire ↔ Grand Livre) ──
// Pour chaque compte collectif de la classe 4, décompose le solde GL en
// rattaché aux tiers / centralisation / écart (réellement sans tiers). L'écart
// est ce qui empêche les deux balances de « communier ».
function ReconView({ orgId, year, importId, onDrill }: { orgId: string; year: number; importId: string; onDrill: (d: GLDrillFilter) => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TiersReconRow[]>([]);
  const [rules, setRules] = useState<TiersRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [correctionRow, setCorrectionRow] = useState<TiersReconRow | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [applying, setApplying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      computeTiersReconciliation({ orgId, year, importId }),
      loadTiersRules(orgId),
    ])
      .then(([recon, rls]) => { setRows(recon); setRules(rls); })
      .finally(() => setLoading(false));
  }, [orgId, year, importId, refreshKey]);

  // Recalcule le rapprochement + invalide le cache GL (les corrections ont
  // muté des écritures / créé des règles).
  const refresh = () => { invalidateCloudData('gl'); setRefreshKey((k) => k + 1); };

  const reapplyRules = async () => {
    setApplying(true);
    try {
      const { updated } = await applyTiersRules(orgId);
      toast.success('Règles réappliquées', `${updated} écriture(s) rattachée(s)`);
      refresh();
    } catch (e: any) {
      toast.error('Échec de la réapplication', e.message);
    } finally {
      setApplying(false);
    }
  };

  const deleteRule = async (id?: number) => {
    if (id === undefined) return;
    if (!confirm('Supprimer cette règle de correction ?\nLes écritures déjà corrigées ne sont PAS annulées (seules les futures imports / réapplications cessent de l\'utiliser ; les justifications réapparaîtront en écart).')) return;
    try {
      await dataProvider.deleteTiersRule(id);
      toast.success('Règle supprimée');
      refresh();
    } catch (e: any) {
      toast.error('Suppression impossible', e.message);
    }
  };

  // Regroupe les collectifs par catégorie (Clients / Fournisseurs / …) en
  // conservant l'ordre des préfixes (déjà triés par le moteur).
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: TiersReconRow[] }>();
    for (const r of rows) {
      const g = m.get(r.category) ?? { label: r.categoryLabel, rows: [] };
      g.rows.push(r);
      m.set(r.category, g);
    }
    return Array.from(m.values());
  }, [rows]);

  const totalEcart = useMemo(() => rows.reduce((s, r) => s + r.ecart, 0), [rows]);

  if (loading) {
    return <Card><p className="text-sm text-primary-500 text-center py-6">Calcul du rapprochement…</p></Card>;
  }
  if (rows.length === 0) {
    return <Card><p className="text-sm text-primary-500 text-center py-6">Aucun compte tiers (classe 4) trouvé sur l'exercice.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="card border-l-4 !border-l-accent bg-accent/5 p-4 text-xs text-primary-700 dark:text-primary-300">
        <p className="text-sm font-semibold text-accent mb-1">Communion Balance auxiliaire ↔ Grand Livre</p>
        <p>
          Le solde GL de chaque collectif se décompose en <strong>rattaché aux tiers</strong>,
          {' '}<strong>centralisation</strong> (écritures sur le compte collectif parent, qui dupliquent le détail)
          {' '}et <strong>écart</strong> = la part <strong>réellement non rattachée</strong> à un tiers individuel.
          {' '}Un écart nul = communion parfaite. Pour le réduire, importez le{' '}
          <button className="text-accent underline font-semibold" onClick={() => navigate('/import-tiers')}>Grand Livre Tiers</button>.
        </p>
        <p className="mt-2">
          Écart total non rattaché :{' '}
          <span className={clsx('num font-bold', Math.round(Math.abs(totalEcart)) >= 1 ? 'text-error' : 'text-success')}>{fmtFull(totalEcart)}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-outline !py-1 text-xs" onClick={() => setShowRules((v) => !v)}>
            {showRules ? 'Masquer' : 'Voir'} les règles mémorisées ({rules.length})
          </button>
          <button className="btn-outline !py-1 text-xs" onClick={reapplyRules} disabled={applying || rules.length === 0}>
            {applying ? 'Application…' : 'Réappliquer les règles'}
          </button>
          <span className="text-[11px] text-primary-400">💡 Cliquez un écart pour corriger les écritures sans tiers et mémoriser la règle.</span>
        </div>
      </div>

      {showRules && <RulesPanel rules={rules} onDelete={deleteRule} />}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 sticky top-0 z-10">
              <tr>
                <th className="text-left py-2 w-8"></th>
                <th className="text-left py-2 px-3">Compte collectif</th>
                <th className="text-right py-2 px-3">Solde GL</th>
                <th className="text-right py-2 px-3">Rattaché tiers</th>
                <th className="text-right py-2 px-3">Centralisation</th>
                <th className="text-right py-2 px-3">Écart (sans tiers)</th>
                <th className="text-right py-2 px-3">Tiers</th>
                <th className="text-center py-2 px-3">Statut</th>
                <th className="text-right py-2 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {groups.map((g) => {
                const gGL = g.rows.reduce((s, r) => s + r.soldeGL, 0);
                const gEcart = g.rows.reduce((s, r) => s + r.ecart, 0);
                return [
                  <tr key={`cat-${g.label}`} className="bg-primary-200 dark:bg-primary-800 font-semibold">
                    <td className="py-1.5 pl-2 w-8"></td>
                    <td className="py-1.5 px-3">{g.label} <span className="text-[10px] text-primary-500 font-normal">({g.rows.length} compte{g.rows.length > 1 ? 's' : ''})</span></td>
                    <td className="py-1.5 px-3 text-right num">{fmtFull(gGL)}</td>
                    <td className="py-1.5 px-3"></td>
                    <td className="py-1.5 px-3"></td>
                    <td className={clsx('py-1.5 px-3 text-right num', Math.round(Math.abs(gEcart)) >= 1 && 'text-error')}>{fmtFull(gEcart)}</td>
                    <td className="py-1.5 px-3"></td>
                    <td className="py-1.5 px-3"></td>
                    <td className="py-1.5 px-3"></td>
                  </tr>,
                  ...g.rows.flatMap((r) => {
                    const isOpen = expanded[r.collective];
                    const detailsShown = r.details.slice(0, 100);
                    return [
                      <tr key={`h-${r.collective}`} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                        <td className="py-2 pl-2 w-8 text-center">
                          <button onClick={() => setExpanded((e) => ({ ...e, [r.collective]: !e[r.collective] }))}
                            className="w-5 h-5 rounded hover:bg-primary-300 dark:hover:bg-primary-700 text-xs font-bold">
                            {isOpen ? '−' : '+'}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <span className="num font-mono font-semibold">{r.collective}</span>
                          <span className="text-xs text-primary-500 ml-2">{r.label}</span>
                          <span className="text-[10px] text-primary-400 ml-2">({r.nbEntries} écr.)</span>
                        </td>
                        <td className="py-2 px-3 text-right num font-semibold">{fmtFull(r.soldeGL)}</td>
                        <td className="py-2 px-3 text-right num">{fmtFull(r.soldeTiers)}</td>
                        <td className="py-2 px-3 text-right num">
                          {Math.round(Math.abs(r.soldeCentralisation)) >= 1 ? (
                            <button
                              className="text-primary-500 hover:text-accent hover:underline"
                              title={`Voir les ${r.nbEntriesCentralisation} écriture(s) de centralisation`}
                              onClick={() => onDrill(r.centralisationDrill)}
                            >
                              {fmtFull(r.soldeCentralisation)}
                            </button>
                          ) : <span className="text-primary-400">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right num">
                          {r.ok ? (
                            <span className="text-success">{fmtFull(0)}</span>
                          ) : (
                            <button
                              className="font-semibold text-error hover:underline"
                              title={`Corriger les ${r.nbEntriesSansTiers} écriture(s) sans code tiers`}
                              onClick={() => setCorrectionRow(r)}
                            >
                              {fmtFull(r.ecart)} · corriger
                            </button>
                          )}
                          {Math.round(Math.abs(r.soldeJustifie)) >= 1 && (
                            <div className="text-[10px] text-primary-400">
                              <button className="hover:text-accent hover:underline" title={`${r.nbEntriesJustifie} écriture(s) justifiée(s)`} onClick={() => onDrill(r.justifieDrill)}>
                                dont {fmtFull(r.soldeJustifie)} justifié
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right num">{r.nbTiers}</td>
                        <td className="py-2 px-3 text-center">
                          {r.ok
                            ? <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">✓ Communié</span>
                            : <span className="text-xs font-semibold text-error bg-error/10 px-2 py-0.5 rounded-full">⚠ {r.nbEntriesSansTiers} sans tiers</span>}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button className="text-xs text-accent hover:underline" onClick={() => onDrill(r.drill)}>Voir GL →</button>
                        </td>
                      </tr>,
                      ...(isOpen ? [
                        <tr key={`d-${r.collective}`}>
                          <td></td>
                          <td colSpan={8} className="py-2 px-3">
                            {detailsShown.length === 0 ? (
                              <p className="text-[11px] text-primary-400 italic py-1">Aucun tiers détaillé — l'intégralité du solde est centralisée ou sans code tiers.</p>
                            ) : (
                              <div className="rounded-lg border border-primary-200 dark:border-primary-800 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="text-[10px] uppercase tracking-wider text-primary-500 bg-primary-100/60 dark:bg-primary-900/40">
                                    <tr>
                                      <th className="text-left py-1.5 px-2">Tiers</th>
                                      <th className="text-left py-1.5 px-2">Libellé</th>
                                      <th className="text-right py-1.5 px-2">Débit</th>
                                      <th className="text-right py-1.5 px-2">Crédit</th>
                                      <th className="text-right py-1.5 px-2">Solde</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                                    {detailsShown.map((d) => (
                                      <tr key={d.tier}
                                        className="cursor-pointer hover:bg-accent/10"
                                        title="Voir les écritures de ce tiers au Grand Livre"
                                        onClick={() => onDrill(d.drill)}>
                                        <td className="py-1 px-2 num font-mono">{d.tier}</td>
                                        <td className="py-1 px-2 truncate max-w-[280px]">{d.label}</td>
                                        <td className="py-1 px-2 text-right num">{d.debit > 0 ? fmtFull(d.debit) : ''}</td>
                                        <td className="py-1 px-2 text-right num">{d.credit > 0 ? fmtFull(d.credit) : ''}</td>
                                        <td className={clsx('py-1 px-2 text-right num font-semibold', d.solde < 0 ? 'text-error' : 'text-success')}>{fmtFull(d.solde)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {r.details.length > detailsShown.length && (
                                  <p className="text-[10px] text-primary-400 italic py-1.5 px-2">
                                    … et {r.details.length - detailsShown.length} autres tiers
                                    {r.kind === 'client' ? " — voir l'onglet Bal. aux. Clients." : r.kind === 'fournisseur' ? " — voir l'onglet Bal. aux. Fournisseurs." : '.'}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>,
                      ] : []),
                    ];
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {correctionRow && (
        <CorrectionModal
          orgId={orgId}
          year={year}
          importId={importId}
          row={correctionRow}
          onClose={() => setCorrectionRow(null)}
          onApplied={() => { setCorrectionRow(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Panneau : règles de correction tiers mémorisées ──────────────
function RulesPanel({ rules, onDelete }: { rules: TiersRule[]; onDelete: (id?: number) => void }) {
  if (rules.length === 0) {
    return (
      <Card>
        <p className="text-xs text-primary-500 text-center py-3">Aucune règle mémorisée. Corrigez un écart et cochez « mémoriser » pour en créer une.</p>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800 bg-primary-100/60 dark:bg-primary-900/40">
            <tr>
              <th className="text-left py-2 px-3">Compte</th>
              <th className="text-left py-2 px-3">Si libellé contient</th>
              <th className="text-left py-2 px-3">Action</th>
              <th className="text-left py-2 px-3">Tiers / Motif</th>
              <th className="text-left py-2 px-3">Créée le</th>
              <th className="text-center py-2 px-3">—</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-primary-50 dark:hover:bg-primary-900/50">
                <td className="py-1.5 px-3 num font-mono">{r.account}</td>
                <td className="py-1.5 px-3">{r.labelContains ? `« ${r.labelContains} »` : <span className="text-primary-400">tout le compte</span>}</td>
                <td className="py-1.5 px-3">
                  {r.action === 'assign'
                    ? <span className="text-success font-semibold">Affecter</span>
                    : <span className="text-warning font-semibold">Justifier</span>}
                </td>
                <td className="py-1.5 px-3">{r.action === 'assign' ? <span className="num font-mono">{r.tiers}{r.tiersLabel ? ` — ${r.tiersLabel}` : ''}</span> : (r.reason || '—')}</td>
                <td className="py-1.5 px-3 text-primary-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="py-1.5 px-3 text-center">
                  <button className="btn-ghost !p-1 text-primary-500 hover:text-error" title="Supprimer la règle" onClick={() => onDelete(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Modale : correction des écritures sans tiers (écart) + mémorisation ──
function CorrectionModal({ orgId, year, importId, row, onClose, onApplied }: {
  orgId: string;
  year: number;
  importId: string;
  row: TiersReconRow;
  onClose: () => void;
  onApplied: () => void;
}) {
  // Écritures de l'écart (sans tiers, non centralisées/justifiées) du collectif,
  // groupées par compte + libellé pour la correction en lot.
  type Grp = { account: string; label: string; debit: number; credit: number; solde: number; count: number };
  const [groupsList, setGroupsList] = useState<Grp[]>([]);
  const [existingTiers, setExistingTiers] = useState<{ code: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // État de saisie par groupe (clé = account||label)
  const [draft, setDraft] = useState<Record<string, { action: 'assign' | 'ignore'; tiers: string; reason: string; scope: 'label' | 'account'; memorize: boolean }>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [periods, entries] = await Promise.all([
          dataProvider.getPeriods(orgId),
          dataProvider.getGLEntries({ orgId }),
        ]);
        const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
        const inScope = (e: GLEntry) => ids.has(e.periodId) && (!importId || importId === 'all' || String(e.importId) === String(importId));
        // Écart = écritures du collectif correspondant au filtre ecartDrill
        const ecartEntries = entries.filter((e) => inScope(e) && matchesDrill(e, row.ecartDrill));
        const map = new Map<string, Grp>();
        for (const e of ecartEntries) {
          const lbl = (e.label ?? '').trim();
          const key = `${e.account}||${lbl}`;
          const g = map.get(key) ?? { account: e.account, label: lbl, debit: 0, credit: 0, solde: 0, count: 0 };
          g.debit += e.debit; g.credit += e.credit; g.solde = g.debit - g.credit; g.count++;
          map.set(key, g);
        }
        // Tiers existants (pour autocomplétion)
        const tmap = new Map<string, string>();
        for (const e of entries) {
          if (e.tiers && !tmap.has(e.tiers)) tmap.set(e.tiers, (e.label ?? '').trim());
        }
        if (!alive) return;
        setGroupsList(Array.from(map.values()).sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde)));
        setExistingTiers(Array.from(tmap.entries()).map(([code, label]) => ({ code, label })).sort((a, b) => a.code.localeCompare(b.code)));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orgId, year, importId, row.collective]);

  const keyOf = (g: Grp) => `${g.account}||${g.label}`;
  const getDraft = (g: Grp) => draft[keyOf(g)] ?? { action: 'assign' as const, tiers: '', reason: '', scope: 'label' as const, memorize: true };
  const setGroupDraft = (g: Grp, patch: Partial<ReturnType<typeof getDraft>>) =>
    setDraft((d) => ({ ...d, [keyOf(g)]: { ...getDraft(g), ...patch } }));

  const applyGroup = async (g: Grp) => {
    const d = getDraft(g);
    if (d.action === 'assign' && !d.tiers.trim()) { toast.warning('Code tiers requis', 'Saisissez un code tiers à affecter.'); return; }
    if (d.action === 'ignore' && !d.reason.trim()) { toast.warning('Motif requis', 'Indiquez un motif de justification.'); return; }
    setSaving(true);
    try {
      const labelContains = d.scope === 'label' && g.label ? g.label : undefined;
      // 1) Mémoriser la règle (toujours, sauf si l'utilisateur décoche)
      if (d.memorize) {
        await dataProvider.upsertTiersRule({
          orgId,
          account: g.account,
          labelContains,
          action: d.action,
          tiers: d.action === 'assign' ? d.tiers.trim() : undefined,
          tiersLabel: d.action === 'assign' ? (existingTiers.find((t) => t.code === d.tiers.trim())?.label || g.label || undefined) : undefined,
          reason: d.action === 'ignore' ? d.reason.trim() : undefined,
          createdAt: Date.now(),
        });
      }
      // 2) Appliquer maintenant
      if (d.action === 'assign') {
        if (d.memorize) {
          // La règle persistée pose le tiers sur toutes les écritures correspondantes
          await applyTiersRules(orgId);
        } else {
          // Correction one-shot : poser le tiers directement sur les écritures du groupe
          await assignTiersToGroup(orgId, year, importId, g, d.tiers.trim());
        }
      }
      // action 'ignore' : pas de mutation — le rapprochement reclasse en « justifié »
      toast.success('Correction appliquée', d.action === 'assign' ? `${g.account} → ${d.tiers.trim()}` : `${g.account} justifié`);
      onApplied();
    } catch (e: any) {
      toast.error('Échec de la correction', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-primary-950 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-primary-200 dark:border-primary-800">
          <div>
            <h3 className="text-base font-semibold">Corriger l'écart — {row.collective} {row.label}</h3>
            <p className="text-xs text-primary-500 mt-1">
              {row.nbEntriesSansTiers} écriture(s) sans code tiers · écart <span className="num font-semibold text-error">{fmtFull(row.ecart)}</span>.
              Affectez un tiers ou justifiez. Cochez « mémoriser » pour ne plus y revenir aux prochains imports.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* datalist partagée pour autocomplétion des codes tiers existants */}
          <datalist id="tiers-codes">
            {existingTiers.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </datalist>

          {loading ? (
            <p className="text-sm text-primary-500 text-center py-8">Chargement des écritures…</p>
          ) : groupsList.length === 0 ? (
            <p className="text-sm text-primary-500 text-center py-8">Aucune écriture sans tiers à corriger.</p>
          ) : (
            <div className="space-y-2">
              {groupsList.map((g) => {
                const d = getDraft(g);
                return (
                  <div key={keyOf(g)} className="rounded-lg border border-primary-200 dark:border-primary-800 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div className="text-xs">
                        <span className="num font-mono font-semibold">{g.account}</span>
                        <span className="text-primary-600 dark:text-primary-300 ml-2">{g.label || <em className="text-primary-400">(sans libellé)</em>}</span>
                        <span className="text-[10px] text-primary-400 ml-2">{g.count} écr.</span>
                      </div>
                      <span className={clsx('num text-xs font-semibold', g.solde < 0 ? 'text-error' : '')}>{fmtFull(g.solde)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="input !w-auto !py-1 text-xs" value={d.action} onChange={(e) => setGroupDraft(g, { action: e.target.value as 'assign' | 'ignore' })}>
                        <option value="assign">Affecter un tiers</option>
                        <option value="ignore">Justifier / ignorer</option>
                      </select>
                      {d.action === 'assign' ? (
                        <input
                          className="input !w-44 !py-1 text-xs font-mono"
                          list="tiers-codes"
                          placeholder="Code tiers (ex CLI001)"
                          value={d.tiers}
                          onChange={(e) => setGroupDraft(g, { tiers: e.target.value })}
                        />
                      ) : (
                        <input
                          className="input !w-64 !py-1 text-xs"
                          placeholder="Motif (ex: régularisation, OD interne)"
                          value={d.reason}
                          onChange={(e) => setGroupDraft(g, { reason: e.target.value })}
                        />
                      )}
                      <select className="input !w-auto !py-1 text-xs" value={d.scope} onChange={(e) => setGroupDraft(g, { scope: e.target.value as 'label' | 'account' })} title="Portée de la règle mémorisée">
                        <option value="label">Ce libellé</option>
                        <option value="account">Tout le compte {g.account}</option>
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-primary-600 dark:text-primary-300">
                        <input type="checkbox" checked={d.memorize} onChange={(e) => setGroupDraft(g, { memorize: e.target.checked })} />
                        mémoriser
                      </label>
                      <button className="btn-primary !py-1 !px-3 text-xs" disabled={saving} onClick={() => applyGroup(g)}>Appliquer</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Correction one-shot (sans règle) : pose le code tiers sur les écritures sans
// tiers d'un compte + libellé donnés, avec trace dans l'audit log.
async function assignTiersToGroup(orgId: string, year: number, importId: string, g: { account: string; label: string }, tiers: string) {
  const [periods, entries] = await Promise.all([
    dataProvider.getPeriods(orgId),
    dataProvider.getGLEntries({ orgId }),
  ]);
  const ids = new Set(periods.filter((p) => p.year === year).map((p) => p.id));
  const targets = entries.filter((e) =>
    ids.has(e.periodId) &&
    (!importId || importId === 'all' || String(e.importId) === String(importId)) &&
    e.account === g.account &&
    (e.label ?? '').trim() === g.label &&
    !e.tiers &&
    e.id !== undefined,
  );
  const { logGLChanges } = await import('../lib/glAuditLog');
  type Change = Parameters<typeof logGLChanges>[1][number];
  const changes: Change[] = [];
  for (const e of targets) {
    await dataProvider.updateGLEntry(e.id!, { tiers });
    changes.push({ glEntryId: e.id!, field: 'tiers', oldValue: e.tiers, newValue: tiers, reason: 'manual_match', sourceKind: 'MANUAL' });
  }
  if (changes.length > 0) await logGLChanges(orgId, changes);
}

// ─── 4. BALANCE ÂGÉE (Clients ou Fournisseurs) ────────────────────
function AgedView({ orgId, year, importId, kind }: { orgId: string; year: number; importId: string; kind: 'client' | 'fournisseur' }) {
  const [data, setData] = useState<{ buckets: string[]; rows: AgedTier[] }>({ buckets: [], rows: [] });
  // Idem AuxView : détecte si aucun tier code n'est renseigné pour afficher
  // une bannière d'aide au lieu d'un tableau vide énigmatique.
  const [noTiersEnriched, setNoTiersEnriched] = useState(false);
  const [totalEntries, setTotalEntries] = useState(0);
  useEffect(() => {
    if (!orgId) return;
    void agedBalance(orgId, year, kind, importId).then(setData);
    const prefix = kind === 'client' ? '411' : '401';
    void dataProvider.getGLEntries({ orgId }).then((entries) => {
      const sub = entries.filter((e) => e.account.startsWith(prefix));
      setTotalEntries(sub.length);
      setNoTiersEnriched(sub.length > 0 && sub.filter((e) => !!e.tiers).length === 0);
    });
  }, [orgId, year, kind, importId]);

  if (data.rows.length === 0) {
    return (
      <div className="space-y-4">
        {noTiersEnriched && (
          <Card>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border-l-4 border-warning">
              <svg className="w-5 h-5 text-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-warning-dark">Balance âgée indisponible — import GL Tiers requis</p>
                <p className="mt-1 text-primary-700 dark:text-primary-300 leading-relaxed">
                  {totalEntries.toLocaleString('fr-FR')} écritures sur les comptes {kind === 'client' ? '411' : '401'}, mais
                  aucune n'a de code tiers. La balance âgée ne peut pas calculer l'antériorité par tier individuel
                  sans codes tiers.
                </p>
                <p className="mt-2 text-primary-600 dark:text-primary-400">
                  → Allez sur <strong>Imports Tiers</strong> et déposez votre fichier GL Tiers.
                </p>
              </div>
            </div>
          </Card>
        )}
        {!noTiersEnriched && <Card><p className="text-sm text-primary-500 text-center py-6">Aucune balance âgée à afficher.</p></Card>}
      </div>
    );
  }
  const totalsByBucket = data.buckets.map((_, i) => data.rows.reduce((s, r) => s + r.buckets[i], 0));
  const grandTotal = data.rows.reduce((s, r) => s + r.total, 0);
  // Cohérence : somme des buckets == total ligne pour chaque tiers
  const allRowsConsistent = data.rows.every((r) => Math.abs(r.buckets.reduce((s, v) => s + v, 0) - r.total) < 1);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-xs text-primary-500"><span className="num font-semibold">{data.rows.length}</span> tiers — Total : <span className="num font-semibold">{fmtFull(grandTotal)}</span></span>
          <EquilibreBadge balanced={allRowsConsistent} delta={data.rows.reduce((s, r) => s + r.buckets.reduce((a, v) => a + v, 0) - r.total, 0)} />
        </div>
      </Card>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="text-left py-2 px-3">Tiers</th>
                <th className="text-left py-2 px-3">Libellé</th>
                {data.buckets.map((b) => <th key={b} className="text-right py-2 px-3">{b}</th>)}
                <th className="text-right py-2 px-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {data.rows.map((r) => (
                <tr key={r.tier} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                  <td className="py-1.5 px-3 num font-mono">{r.tier}</td>
                  <td className="py-1.5 px-3 text-xs">{r.label}</td>
                  {r.buckets.map((v, i) => (
                    <td key={i} className="py-1.5 px-3 text-right num">{Math.abs(v) > 0.01 ? fmtFull(v) : <span className="text-primary-400">—</span>}</td>
                  ))}
                  <td className={clsx('py-1.5 px-3 text-right num font-semibold', r.total < 0 ? 'text-error' : '')}>{fmtFull(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 font-bold">
              <tr>
                <td className="py-2 px-3" colSpan={2}>TOTAUX</td>
                {totalsByBucket.map((v, i) => <td key={i} className="py-2 px-3 text-right num">{fmtFull(v)}</td>)}
                <td className="py-2 px-3 text-right num">{fmtFull(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
