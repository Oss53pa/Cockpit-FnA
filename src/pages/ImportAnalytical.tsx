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
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Download, FileWarning, Layers, Plus,
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
import type { ImportLog, AnalyticAxis, AnalyticCode, AnalyticBranch } from '../db/schema';
import { BRANCH_COLORS } from '../engine/analyticBranch';

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
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [refreshAxes, setRefreshAxes] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    void dataProvider.getAnalyticAxes(orgId).then(setAxes).catch(() => setAxes([]));
  }, [orgId, refreshAxes]);

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
      setRefreshAxes((r) => r + 1);
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

      {/* Plan analytique courant — table des axes configurés */}
      <div className="lg:col-span-2">
        <Card
          title={`Axes configurés (${axes.length})`}
          subtitle="Plan analytique courant — modifiable dans /analytical?tab=axes"
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-3">N° Axe</th>
                  <th className="text-left py-2 px-3">Nom</th>
                  <th className="text-left py-2 px-3">Nom du code</th>
                  <th className="text-center py-2 px-3">Obligatoire</th>
                  <th className="text-center py-2 px-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {axes.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-primary-500 text-xs">
                    Aucun axe configuré. Créez ou importez vos axes ci-dessus.
                  </td></tr>
                )}
                {axes.sort((a, b) => a.number - b.number).map((axis) => (
                  <tr key={axis.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                    <td className="py-2 px-3 font-mono font-bold">Axe {axis.number}</td>
                    <td className="py-2 px-3 font-semibold">{axis.name}</td>
                    <td className="py-2 px-3 text-primary-600 dark:text-primary-400">{axis.codeName}</td>
                    <td className="py-2 px-3 text-center">
                      {axis.required
                        ? <Badge variant="warning">Obligatoire</Badge>
                        : <span className="text-[10px] text-primary-400">Optionnel</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {axis.active
                        ? <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                        : <Badge>Inactif</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <HistoryTable orgId={orgId} kind="ANALYTIC_AXES" emptyMessage="Aucun import d'axes" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL CODES
// ════════════════════════════════════════════════════════════════════════════
/**
 * Matrice WBS — sémantique (axe × branche) demandée par l'utilisateur :
 *
 *              | Revenus            | Coûts projets               | Frais généraux             |
 *   Axe 1      | Code Projet        | Code Projet                 | Code Projet (ou hors)      |
 *   Axe 2      | Centre de revenu   | Centre de coût / Tâche      | Centre de coût FG          |
 *   Axe 3      | Type centre revenu | Code ressource projet       | Code gestion FG            |
 */
const WBS_MATRIX: Record<'revenue' | 'project_cost' | 'overhead', Record<1 | 2 | 3, string>> = {
  revenue: {
    1: 'Code Projet',
    2: 'Centre de revenu',
    3: 'Type de centre revenu',
  },
  project_cost: {
    1: 'Code Projet',
    2: 'Centre de coût / Tâche projet',
    3: 'Code ressource projet',
  },
  overhead: {
    1: 'Code Projet (ou « hors projet »)',
    2: 'Centre de coût FG',
    3: 'Code gestion FG',
  },
};

function CodesPanel({ orgId }: { orgId: string }) {
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<AnalyticCodeImportReport | null>(null);
  const [codes, setCodes] = useState<AnalyticCode[]>([]);
  const [axes, setAxes] = useState<AnalyticAxis[]>([]);
  const [refreshCodes, setRefreshCodes] = useState(0);
  const [branchTab, setBranchTab] = useState<AnalyticBranch>('revenue');

  useEffect(() => {
    if (!orgId) return;
    void Promise.all([
      dataProvider.getAnalyticCodes(orgId),
      dataProvider.getAnalyticAxes(orgId),
    ]).then(([c, a]) => { setCodes(c); setAxes(a); }).catch(() => { setCodes([]); setAxes([]); });
  }, [orgId, refreshCodes]);

  const counts = {
    revenue: codes.filter((c) => c.branch === 'revenue').length,
    project_cost: codes.filter((c) => c.branch === 'project_cost').length,
    overhead: codes.filter((c) => c.branch === 'overhead').length,
    universel: codes.filter((c) => !c.branch).length,
  };
  const axisByNumber = new Map(axes.map((a) => [a.number, a]));

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
      setRefreshCodes((r) => r + 1);
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

      {/* Matrice WBS — codes classés par branche puis par axe */}
      <div className="lg:col-span-2 space-y-3">
        <div>
          <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
            Plan analytique courant — vue matrice WBS
          </h3>
          <p className="text-xs text-primary-500">
            Codes classés par branche × axe selon la sémantique conditionnelle WBS Cockpit FnA.
          </p>
        </div>

        {/* Onglets par branche */}
        <div className="flex gap-1 border-b border-primary-200 dark:border-primary-800 overflow-x-auto">
          {([
            { key: 'revenue' as AnalyticBranch, label: 'Branche Revenus', count: counts.revenue },
            { key: 'project_cost' as AnalyticBranch, label: 'Branche Coûts Projets', count: counts.project_cost },
            { key: 'overhead' as AnalyticBranch, label: 'Branche Frais Généraux', count: counts.overhead },
          ]).map((t) => {
            const active = branchTab === t.key;
            const colorClass = t.key === 'revenue' ? 'border-success text-success'
              : t.key === 'project_cost' ? 'border-accent text-accent'
              : 'border-warning text-warning';
            return (
              <button
                key={t.key}
                className={clsx(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap inline-flex items-center gap-2',
                  active
                    ? colorClass
                    : 'border-transparent text-primary-500 hover:text-primary-900',
                )}
                onClick={() => setBranchTab(t.key)}
              >
                {t.label}
                <Badge variant={active ? (BRANCH_COLORS[t.key] as 'success' | 'warning' | 'default') : 'default'}>
                  {t.count}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* 3 sections — une par axe — pour la branche sélectionnée */}
        {([1, 2, 3] as const).map((axisNum) => {
          const axisLabelInBranch = WBS_MATRIX[branchTab][axisNum];
          const axis = axisByNumber.get(axisNum);
          const codesInCell = codes
            .filter((c) => c.branch === branchTab && axis && c.axisId === axis.id)
            .sort((a, b) => a.code.localeCompare(b.code));

          return (
            <Card
              key={axisNum}
              title={`Axe ${axisNum} — ${axisLabelInBranch}`}
              subtitle={
                axis
                  ? `${codesInCell.length} code(s) · Axe défini : « ${axis.name} »`
                  : `Axe ${axisNum} non configuré dans le plan`
              }
              padded={false}
            >
              {!axis ? (
                <div className="px-4 py-6 text-center text-xs text-primary-400">
                  L'axe {axisNum} n'existe pas encore. Créez-le dans l'onglet « Axes analytiques ».
                </div>
              ) : codesInCell.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-primary-400">
                  Aucun code « {axisLabelInBranch.toLowerCase()} » dans cette branche.
                  Importez le modèle Excel ou créez-les manuellement.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                      <tr>
                        <th className="text-left py-2 px-3">Code</th>
                        <th className="text-left py-2 px-3">Libellé court</th>
                        <th className="text-left py-2 px-3">Libellé long</th>
                        <th className="text-left py-2 px-3">Code parent</th>
                        <th className="text-center py-2 px-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                      {codesInCell.map((c) => {
                        const parent = c.parentId ? codes.find((p) => p.id === c.parentId) : undefined;
                        return (
                          <tr key={c.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                            <td className="py-2 px-3 font-mono font-semibold">{c.code}</td>
                            <td className="py-2 px-3">{c.shortLabel}</td>
                            <td className="py-2 px-3 text-primary-500">{c.longLabel || '—'}</td>
                            <td className="py-2 px-3 font-mono text-xs text-primary-500">{parent?.code ?? '—'}</td>
                            <td className="py-2 px-3 text-center">
                              {c.active
                                ? <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                                : <Badge>Inactif</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}

        {/* Codes universels — non typés, ne suivent pas la matrice WBS */}
        {counts.universel > 0 && (
          <Card
            title={`Codes universels (${counts.universel})`}
            subtitle="Codes sans branche WBS — compatibles avec toutes les lignes (legacy)"
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
                  <tr>
                    <th className="text-left py-2 px-3">Axe</th>
                    <th className="text-left py-2 px-3">Code</th>
                    <th className="text-left py-2 px-3">Libellé court</th>
                    <th className="text-center py-2 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                  {codes.filter((c) => !c.branch).sort((a, b) => a.code.localeCompare(b.code)).map((c) => {
                    const ax = axes.find((a) => a.id === c.axisId);
                    return (
                      <tr key={c.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                        <td className="py-2 px-3 font-mono">Axe {ax?.number ?? '?'} — {ax?.name ?? ''}</td>
                        <td className="py-2 px-3 font-mono font-semibold">{c.code}</td>
                        <td className="py-2 px-3">{c.shortLabel}</td>
                        <td className="py-2 px-3 text-center">
                          {c.active
                            ? <Badge variant="success">Actif</Badge>
                            : <Badge>Inactif</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

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
