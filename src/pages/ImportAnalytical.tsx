/**
 * ImportAnalytical — page unifiée d'import du plan analytique.
 *
 * Modèle UX identique aux pages Grand Livre / GL Tiers :
 *   - L'utilisateur choisit entre CRÉER manuellement (lien vers /analytical?tab=...)
 *     ou IMPORTER un fichier (CSV / XLSX).
 *   - Deux sous-onglets : Axes analytiques / Codes analytiques.
 *   - Pour chaque, télécharge le modèle Excel + upload + rapport d'import.
 *
 * Pourquoi unifier ? L'admin importe rarement les axes seuls — il importe
 * la totalité du plan analytique en une seule fois (axes puis codes).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Download, FileSpreadsheet, FileWarning, Layers, Plus,
  Upload, Wand2, Trash2, FolderTree, XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { useImportsHistory } from '../hooks/useFinancials';
import { invalidateCloudData } from '../hooks/useCloudData';
import { dataProvider } from '../db/provider';
import {
  downloadAnalyticAxesTemplate, downloadAnalyticCodesTemplate,
} from '../engine/templates';
import { parseFile } from '../engine/importer';
import {
  importAnalyticAxes, importAnalyticCodes,
  type AnalyticAxisImportRow, type AnalyticCodeImportRow,
  type AnalyticAxisImportReport, type AnalyticCodeImportReport,
} from '../engine/analyticalEngine';
import type { ImportLog } from '../db/schema';

type Tab = 'axes' | 'codes';

export default function ImportAnalytical() {
  const { currentOrgId } = useApp();
  const [tab, setTab] = useState<Tab>('axes');

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Plan analytique — Import"
        subtitle="Configurez les axes et codes analytiques par création manuelle ou import de fichier"
        icon={<FolderTree className="w-5 h-5" />}
      />

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 overflow-x-auto">
        {([
          { key: 'axes' as Tab, label: 'Axes analytiques', icon: Layers },
          { key: 'codes' as Tab, label: 'Codes analytiques', icon: FolderTree },
        ]).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap inline-flex items-center gap-2',
                active
                  ? 'border-primary-900 dark:border-primary-100 text-primary-900 dark:text-primary-100'
                  : 'border-transparent text-primary-500 hover:text-primary-900',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'axes' && <AxesPanel orgId={currentOrgId} />}
      {tab === 'codes' && <CodesPanel orgId={currentOrgId} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL AXES
// ════════════════════════════════════════════════════════════════════════════
function AxesPanel({ orgId }: { orgId: string }) {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<AnalyticAxisImportReport | null>(null);

  const handleImport = async (file: File) => {
    setImporting(true);
    setReport(null);
    try {
      const { rows: rawRows } = await parseFile(file);
      const mapped: AnalyticAxisImportRow[] = rawRows.map((r: Record<string, unknown>) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        const number = parseInt(get('Numéro', 'Numero', 'number', 'axe', 'Axe') || '0', 10);
        const name = get('Nom', 'name', 'libellé', 'libelle');
        const codeName = get('Nom du code', 'codeName', 'code_name');
        const required = ['1', 'true', 'oui'].includes(get('Obligatoire', 'required').toLowerCase());
        const activeRaw = get('Actif', 'active');
        const active = activeRaw === '' ? true : !['0', 'false', 'non'].includes(activeRaw.toLowerCase());
        return { number, name, codeName, required, active };
      }).filter((r) => r.name);
      const result = await importAnalyticAxes(orgId, mapped, {
        fileName: file.name, source: file.name.endsWith('.csv') ? 'CSV' : 'Excel',
      });
      setReport(result);
      invalidateCloudData('imports');
      if (result.errors.length === 0) {
        toast.success(`Axes importés : ${result.inserted} créés, ${result.updated} mis à jour`);
      } else {
        toast.warning(
          `Import partiel : ${result.inserted + result.updated} OK, ${result.rejected} rejetés`,
          'Voir le détail dans le rapport ci-dessous',
        );
      }
    } catch (e) {
      toast.error('Échec de l\'import', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Carte Création manuelle */}
      <Card padded>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Plus className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
              Créer manuellement
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400 mb-4">
              Configurez vos axes analytiques un par un dans l'éditeur dédié.
              Convention recommandée : Axe 1 = Projet, Axe 2 = Centre, Axe 3 = Ressource.
            </p>
            <Link to="/analytical?tab=axes" className="btn-primary inline-flex items-center gap-1.5 text-sm">
              Ouvrir l'éditeur d'axes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </Card>

      {/* Carte Import fichier */}
      <Card padded>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-200/60 dark:bg-primary-800/60 flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-primary-700 dark:text-primary-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
              Importer un fichier
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400 mb-4">
              Téléchargez le modèle Excel, complétez vos axes (jusqu'à 5), puis importez.
              Idempotent : un axe déjà existant sera mis à jour.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-outline text-sm"
                onClick={() => downloadAnalyticAxesTemplate()}
              >
                <Download className="w-4 h-4" /> Télécharger le modèle
              </button>
              <label className="btn-primary text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                {importing ? 'Import…' : 'Importer un fichier'}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {report && (
        <div className="lg:col-span-2">
          <ImportReportCard
            title="Rapport d'import — Axes"
            report={report}
            onDismiss={() => setReport(null)}
          />
        </div>
      )}

      <div className="lg:col-span-2">
        <HistoryTable orgId={orgId} kind="ANALYTIC_AXES" emptyMessage="Aucun import d'axes" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL CODES
// ════════════════════════════════════════════════════════════════════════════
function CodesPanel({ orgId }: { orgId: string }) {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<AnalyticCodeImportReport | null>(null);

  const handleImport = async (file: File) => {
    setImporting(true);
    setReport(null);
    try {
      const { rows: rawRows } = await parseFile(file);
      const mapped: AnalyticCodeImportRow[] = rawRows.map((r: Record<string, unknown>) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const v = r[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        };
        const axe = parseInt(get('Axe', 'axe', 'Axis') || '1', 10) || 1;
        const code = get('Code', 'code');
        const shortLabel = get('Libellé court', 'Libelle court', 'short_label', 'Libellé');
        const longLabel = get('Libellé long', 'Libelle long', 'long_label', 'Description');
        const parent = get('Code parent', 'parent', 'parent_code');
        const branchRaw = get('Branche WBS', 'Branche', 'branch', 'WBS');
        const activeRaw = get('Actif', 'active');
        const branch = branchRaw && ['revenue', 'project_cost', 'overhead'].includes(branchRaw)
          ? (branchRaw as 'revenue' | 'project_cost' | 'overhead')
          : undefined;
        const active = activeRaw === '' ? true : !['0', 'false', 'non'].includes(activeRaw.toLowerCase());
        return { axe, code, shortLabel, longLabel, parent: parent || undefined, branch, active };
      }).filter((r) => r.code);
      const result = await importAnalyticCodes(orgId, mapped, {
        fileName: file.name, source: file.name.endsWith('.csv') ? 'CSV' : 'Excel',
      });
      setReport(result);
      invalidateCloudData('imports');
      if (result.errors.length === 0) {
        toast.success(`Codes importés : ${result.inserted} créés, ${result.updated} mis à jour`);
      } else {
        toast.warning(
          `Import partiel : ${result.inserted + result.updated} OK, ${result.rejected} rejetés`,
          'Voir le détail dans le rapport ci-dessous',
        );
      }
    } catch (e) {
      toast.error('Échec de l\'import', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card padded>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Plus className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
              Créer manuellement
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400 mb-4">
              Créez vos codes analytiques (projets, centres, ressources) un par un.
              Avec sémantique WBS optionnelle (Revenus / Coûts projets / Frais généraux).
            </p>
            <Link to="/analytical?tab=codes" className="btn-primary inline-flex items-center gap-1.5 text-sm">
              Ouvrir l'éditeur de codes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </Card>

      <Card padded>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-200/60 dark:bg-primary-800/60 flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-primary-700 dark:text-primary-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
              Importer un fichier
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400 mb-4">
              Modèle Excel multi-feuilles (Axe / Code / Libellé / Parent / Branche WBS / Actif).
              Hiérarchie parent résolue automatiquement après import.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-outline text-sm"
                onClick={() => downloadAnalyticCodesTemplate()}
              >
                <Download className="w-4 h-4" /> Télécharger le modèle
              </button>
              <label className="btn-primary text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                {importing ? 'Import…' : 'Importer un fichier'}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {report && (
        <div className="lg:col-span-2">
          <ImportReportCard
            title="Rapport d'import — Codes"
            report={report}
            onDismiss={() => setReport(null)}
            extraActions={
              <Link to="/analytical?tab=rules" className="btn-outline text-xs inline-flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> Configurer les règles de mapping
              </Link>
            }
          />
        </div>
      )}

      <div className="lg:col-span-2">
        <HistoryTable orgId={orgId} kind="ANALYTIC_CODES" emptyMessage="Aucun import de codes" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HISTORIQUE des imports (sur le modèle GL Tiers)
// ════════════════════════════════════════════════════════════════════════════
function HistoryTable({
  orgId, kind, emptyMessage,
}: {
  orgId: string;
  kind: 'ANALYTIC_AXES' | 'ANALYTIC_CODES';
  emptyMessage: string;
}) {
  const history = useImportsHistory(orgId, kind);

  const deleteImport = async (imp: ImportLog) => {
    if (!imp.id) return;
    if (!confirm(`Supprimer cet import historique ?\n\nNote : seul le journal d'import est supprimé.\nLes axes/codes déjà créés restent en place.`)) return;
    try {
      await dataProvider.deleteImport(imp.id);
      invalidateCloudData('imports');
      toast.success('Import supprimé du journal');
    } catch (e) {
      toast.error('Suppression impossible', (e as Error).message);
    }
  };

  return (
    <Card title="Historique des imports" subtitle="Traçabilité complète — modèle Grand Livre Tiers" padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
            <tr>
              <th className="text-left py-2 px-3">Date</th>
              <th className="text-left py-2 px-3">Utilisateur</th>
              <th className="text-left py-2 px-3">Fichier</th>
              <th className="text-left py-2 px-3">Source</th>
              <th className="text-right py-2 px-3">Lignes</th>
              <th className="text-right py-2 px-3">Rejetées</th>
              <th className="text-left py-2 px-3">Statut</th>
              <th className="text-center py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {history.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-primary-500 text-xs">{emptyMessage}</td></tr>
            )}
            {history.map((i) => (
              <tr key={i.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                <td className="py-2 px-3 num text-xs">{new Date(i.date).toLocaleString('fr-FR')}</td>
                <td className="py-2 px-3">{i.user}</td>
                <td className="py-2 px-3 font-mono text-xs">{i.fileName}</td>
                <td className="py-2 px-3"><Badge>{i.source}</Badge></td>
                <td className="py-2 px-3 text-right num">{i.count.toLocaleString('fr-FR')}</td>
                <td className="py-2 px-3 text-right num">{i.rejected}</td>
                <td className="py-2 px-3">
                  {i.status === 'success' && <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Succès</Badge>}
                  {i.status === 'partial' && <Badge variant="warning"><FileWarning className="w-3 h-3" /> Partiel</Badge>}
                  {i.status === 'error' && <Badge variant="error"><XCircle className="w-3 h-3" /> Échec</Badge>}
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10"
                    onClick={() => deleteImport(i)}
                    title="Supprimer cet import du journal (les données restent)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER : carte de rapport
// ════════════════════════════════════════════════════════════════════════════
function ImportReportCard({
  title, report, onDismiss, extraActions,
}: {
  title: string;
  report: AnalyticAxisImportReport | AnalyticCodeImportReport;
  onDismiss: () => void;
  extraActions?: React.ReactNode;
}) {
  return (
    <Card padded>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{title}</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
            {report.total} ligne(s) traitée(s) · {report.inserted} créé(s) ·{' '}
            {report.updated} mis à jour · {report.rejected} rejeté(s)
          </p>
          {report.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-error cursor-pointer hover:underline">
                Voir les {report.errors.length} erreur(s)
              </summary>
              <ul className="text-[11px] text-primary-600 dark:text-primary-400 mt-2 space-y-1 max-h-40 overflow-y-auto">
                {report.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>Ligne {e.row} : {e.reason}</li>
                ))}
                {report.errors.length > 50 && (
                  <li className="italic">… et {report.errors.length - 50} autres</li>
                )}
              </ul>
            </details>
          )}
          {extraActions && <div className="mt-3">{extraActions}</div>}
        </div>
        <button className="btn-ghost !p-1" onClick={onDismiss} title="Fermer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
