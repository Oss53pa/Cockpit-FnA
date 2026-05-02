/**
 * CR Editor — Personnalisation du Compte de Résultat
 *
 * Interface complète pour gérer les modèles CR personnalisés :
 *  - Liste des modèles + sélecteur du modèle actif
 *  - Édition de la hiérarchie (sections, sous-sections)
 *  - Drag & drop pour réorganiser
 *  - Picker de comptes depuis le plan comptable
 *  - Validation anti-double comptage en temps réel
 *  - Formules personnalisées (entre sections)
 *  - Audit trail (journal des modifications)
 *  - Preview avant publication
 *
 * Connecté au Grand Livre via crModels.ts qui devient le point pivot unique
 * pour getSectionDefs() — tous les dashboards/rapports consomment le modèle
 * actif automatiquement.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Save, Eye, Trash2, Copy, Star, GripVertical, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, FolderTree, FileEdit, History, Settings as SettingsIcon,
  Search, X, Calculator,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { useCurrentOrg } from '../hooks/useFinancials';
import { db } from '../db/schema';
import {
  listModels, saveModel, publishModel, activateModel, duplicateModel,
  deleteModel, addSection, updateSection, removeSection, moveSection, validateModel,
  evaluateFormula, getModelHistory, listCRAccounts,
  type CRModel, type CRSectionNode, type CRIntermediateNode, type ValidationReport,
} from '../engine/crModels';
import clsx from 'clsx';

export default function CREditorPage() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();

  const [models, setModels] = useState<CRModel[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [model, setModel] = useState<CRModel | null>(null);
  const [accounts, setAccounts] = useState<{ code: string; label: string; class: string }[]>([]);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [glAccounts, setGlAccounts] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [search, setSearch] = useState('');

  // ── Chargement initial ──
  useEffect(() => {
    if (!currentOrgId) return;
    const list = listModels(currentOrgId);
    setModels(list);
    const active = list.find((m) => m.isActive) ?? list[0];
    if (active) {
      setSelectedId(active.id);
      setModel(JSON.parse(JSON.stringify(active)));
    }
    // Charger les comptes du plan comptable
    listCRAccounts(currentOrgId).then(setAccounts);
    // Charger les codes utilisés dans le GL pour la validation
    db.gl.where('orgId').equals(currentOrgId).toArray()
      .then((entries) => setGlAccounts([...new Set(entries.map((e) => e.account))]));
  }, [currentOrgId]);

  // ── Validation temps réel ──
  useEffect(() => {
    if (!model) { setValidation(null); return; }
    setValidation(validateModel(model, glAccounts));
  }, [model, glAccounts]);

  const handleSelectModel = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setSelectedId(id);
    setModel(JSON.parse(JSON.stringify(m)));
  };

  const handleSave = () => {
    if (!model) return;
    const saved = saveModel({ ...model, status: 'draft' });
    setModels(listModels(currentOrgId!));
    setModel(JSON.parse(JSON.stringify(saved)));
    toast.success('Modèle enregistré', `"${saved.name}" sauvegardé en brouillon`);
  };

  const handlePublish = () => {
    if (!model || !validation) return;
    if (!validation.valid) {
      toast.warning('Validation requise', 'Corrigez les doublons et orphelins avant de publier.');
      return;
    }
    saveModel(model);
    publishModel(currentOrgId!, model.id);
    setModels(listModels(currentOrgId!));
    toast.success('Modèle publié', `"${model.name}" v${model.version + 1} publié et appliqué.`);
  };

  const handleActivate = (id: string) => {
    if (!currentOrgId) return;
    activateModel(currentOrgId, id);
    setModels(listModels(currentOrgId));
    toast.success('Modèle activé', 'Tous les dashboards et rapports utiliseront ce modèle.');
  };

  const handleDuplicate = () => {
    if (!model || !currentOrgId) return;
    const name = prompt('Nom du nouveau modèle ?', `${model.name} (copie)`);
    if (!name) return;
    const dup = duplicateModel(currentOrgId, model.id, name);
    if (dup) {
      setModels(listModels(currentOrgId));
      setSelectedId(dup.id);
      setModel(JSON.parse(JSON.stringify(dup)));
      toast.success('Modèle dupliqué', `"${name}" créé en brouillon.`);
    }
  };

  const handleDelete = () => {
    if (!model || !currentOrgId) return;
    if (!confirm(`Supprimer le modèle "${model.name}" ?`)) return;
    const result = deleteModel(currentOrgId, model.id);
    if (result.success) {
      const list = listModels(currentOrgId);
      setModels(list);
      const fallback = list[0];
      if (fallback) { setSelectedId(fallback.id); setModel(JSON.parse(JSON.stringify(fallback))); }
      toast.success('Modèle supprimé');
    } else {
      toast.error('Suppression impossible', result.reason);
    }
  };

  const handleAddSection = (parentId?: string) => {
    if (!model) return;
    const next = addSection(model, {
      label: 'Nouvelle section',
      prefixes: [],
      isCharge: false,
    }, parentId);
    setModel(next);
  };

  const handleUpdateSection = (sectionId: string, patch: Partial<CRSectionNode>) => {
    if (!model) return;
    setModel(updateSection(model, sectionId, patch));
  };

  const handleRemoveSection = (sectionId: string) => {
    if (!model) return;
    if (!confirm('Supprimer cette section et toutes ses sous-sections ?')) return;
    setModel(removeSection(model, sectionId));
  };

  const handleMoveSection = (sectionId: string, newParentId: string | undefined, newOrder: number) => {
    if (!model) return;
    setModel(moveSection(model, sectionId, newParentId, newOrder));
  };

  if (!currentOrgId || !org) {
    return (
      <div className="py-20 text-center text-primary-400">
        Sélectionnez une société pour personnaliser le Compte de Résultat.
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Personnaliser le Compte de Résultat"
        subtitle={`${org.name} · Modèles CR personnalisés — propagés à tous les dashboards et rapports`}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4" /> Historique
            </button>
            <button className="btn-outline" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="w-4 h-4" /> {previewMode ? 'Quitter aperçu' : 'Aperçu'}
            </button>
            <button className="btn-outline" onClick={handleDuplicate} disabled={!model}>
              <Copy className="w-4 h-4" /> Dupliquer
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={!model || previewMode}>
              <Save className="w-4 h-4" /> Enregistrer
            </button>
          </div>
        }
      />

      {/* Sélecteur de modèles */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">
          <FolderTree className="w-3.5 h-3.5" />
          Modèles disponibles ({models.length})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {models.map((m) => (
            <div
              key={m.id}
              className={clsx(
                'p-3 rounded-xl border-2 transition-all',
                selectedId === m.id
                  ? 'border-accent bg-accent/5'
                  : 'border-primary-200 dark:border-primary-700 hover:border-primary-400',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => handleSelectModel(m.id)} className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {m.isDefault && <Star className="w-3.5 h-3.5 text-warning fill-warning shrink-0" />}
                    {m.name}
                  </p>
                  <p className="text-[11px] text-primary-500 mt-0.5">
                    v{m.version} · {m.status === 'published' ? '✓ Publié' : 'Brouillon'} · {m.sections.length} section(s)
                  </p>
                </button>
                {m.isActive && (
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">
                    Actif
                  </span>
                )}
              </div>
              {!m.isActive && (
                <button
                  className="mt-2 w-full text-xs px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 hover:border-accent hover:text-accent transition-colors"
                  onClick={() => handleActivate(m.id)}
                >
                  Activer ce modèle
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Validation report */}
      {validation && model && (
        <Card className={clsx('p-4 border-l-4', validation.valid ? 'border-l-success' : 'border-l-warning')}>
          <div className="flex items-center gap-2 mb-2">
            {validation.valid ? (
              <><CheckCircle2 className="w-4 h-4 text-success" /><p className="text-sm font-semibold text-success">Modèle valide</p></>
            ) : (
              <><AlertTriangle className="w-4 h-4 text-warning" /><p className="text-sm font-semibold text-warning">Avertissements de validation</p></>
            )}
          </div>
          {validation.warnings.length === 0 ? (
            <p className="text-xs text-primary-500">Aucun double comptage, aucun compte orphelin. Tous les comptes du Grand Livre sont rattachés.</p>
          ) : (
            <ul className="text-xs text-primary-700 dark:text-primary-300 space-y-1">
              {validation.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
          {validation.duplicateAccounts.length > 0 && (
            <div className="mt-2 text-[11px] text-error">
              <p className="font-semibold mb-1">Comptes en double :</p>
              <ul className="ml-3 space-y-0.5">
                {validation.duplicateAccounts.slice(0, 5).map((d) => (
                  <li key={d.account}>
                    <span className="num">{d.account}</span> dans {d.sections.length} sections : {d.sections.join(', ')}
                  </li>
                ))}
                {validation.duplicateAccounts.length > 5 && <li className="italic">…et {validation.duplicateAccounts.length - 5} autre(s)</li>}
              </ul>
            </div>
          )}
          {validation.orphanAccounts.length > 0 && (
            <div className="mt-2 text-[11px] text-warning">
              <p className="font-semibold mb-1">Comptes orphelins (non rattachés) :</p>
              <p className="ml-3 num">{validation.orphanAccounts.slice(0, 8).join(', ')}{validation.orphanAccounts.length > 8 ? '…' : ''}</p>
            </div>
          )}
        </Card>
      )}

      {/* Preview Mode */}
      {model && previewMode && (
        <ModelPreview model={model} accounts={accounts} />
      )}

      {/* Editor Mode */}
      {model && !previewMode && (
        <>
          {/* Métadonnées du modèle */}
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">
              <FileEdit className="w-3.5 h-3.5 inline mr-1" />
              Informations du modèle
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Nom</label>
                <input
                  className="input mt-1"
                  value={model.name}
                  onChange={(e) => setModel({ ...model, name: e.target.value })}
                  disabled={model.isDefault}
                />
              </div>
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Description</label>
                <input
                  className="input mt-1"
                  value={model.description ?? ''}
                  onChange={(e) => setModel({ ...model, description: e.target.value })}
                />
              </div>
            </div>
          </Card>

          {/* Sections — arbre hiérarchique */}
          <ChartCard
            title={`Sections (${model.sections.length})`}
            subtitle="Hiérarchie multi-niveaux · Drag & drop pour réorganiser"
            accent="rgb(var(--accent))"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                <input
                  className="input !py-1.5 text-xs"
                  placeholder="Rechercher une section…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && <button onClick={() => setSearch('')} className="text-primary-400 hover:text-error"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <button className="btn-primary !py-1.5 !text-xs" onClick={() => handleAddSection()}>
                <Plus className="w-3.5 h-3.5" /> Section racine
              </button>
            </div>
            <SectionTree
              sections={model.sections}
              parentId={undefined}
              accounts={accounts}
              search={search}
              onUpdate={handleUpdateSection}
              onRemove={handleRemoveSection}
              onMove={handleMoveSection}
              onAddChild={handleAddSection}
            />
          </ChartCard>

          {/* Intermédiaires & Formules */}
          <ChartCard title="Sous-totaux intermédiaires" subtitle="Résultats calculés automatiquement (Marge Brute, EBITDA, Résultat Net…)" accent="rgb(var(--accent))">
            <div className="space-y-2">
              {model.intermediates.map((it) => (
                <IntermediateEditor
                  key={it.id}
                  intermediate={it}
                  sections={model.sections}
                  onChange={(patch) => setModel({
                    ...model,
                    intermediates: model.intermediates.map((x) => x.id === it.id ? { ...x, ...patch } : x),
                  })}
                  onRemove={() => setModel({
                    ...model,
                    intermediates: model.intermediates.filter((x) => x.id !== it.id),
                  })}
                />
              ))}
              <button
                className="w-full p-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-700 text-xs text-primary-500 hover:border-accent hover:text-accent transition-colors"
                onClick={() => setModel({
                  ...model,
                  intermediates: [...model.intermediates, {
                    id: `inter-${Date.now()}`,
                    label: 'Nouveau sous-total',
                    formula: '',
                    format: 'currency',
                    order: model.intermediates.length,
                  }],
                })}
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Ajouter un sous-total intermédiaire
              </button>
            </div>
          </ChartCard>

          {/* Actions de publication */}
          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Publier le modèle</p>
              <p className="text-xs text-primary-500 mt-0.5">
                Une fois publié, ce modèle peut être activé pour qu'il s'applique automatiquement aux dashboards, tables CR et rapports.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!model.isActive && (
                <button className="btn-outline" onClick={() => handleActivate(model.id)}>
                  <Star className="w-4 h-4" /> Activer
                </button>
              )}
              <button className="btn-primary" onClick={handlePublish} disabled={!validation?.valid}>
                <CheckCircle2 className="w-4 h-4" /> Publier v{model.version + 1}
              </button>
              {!model.isDefault && !model.isActive && (
                <button className="btn-outline text-error" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Audit trail */}
      {showHistory && model && (
        <ChartCard title="Historique des modifications" accent="rgb(var(--accent))">
          <ul className="space-y-1.5 text-xs">
            {getModelHistory(currentOrgId, model.id).slice(0, 30).map((h) => (
              <li key={h.id ?? h.timestamp} className="flex items-center gap-3 py-1 border-b border-primary-100/60 dark:border-primary-800/40">
                <span className="text-primary-400 num shrink-0">{new Date(h.timestamp).toLocaleString('fr-FR')}</span>
                <span className={clsx(
                  'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
                  h.action === 'published' ? 'bg-success/10 text-success' :
                  h.action === 'activated' ? 'bg-accent/10 text-accent' :
                  h.action === 'created' ? 'bg-blue-500/10 text-blue-700' :
                  h.action === 'duplicated' ? 'bg-warning/10 text-warning' :
                  'bg-primary-200/60 text-primary-600',
                )}>{h.action}</span>
                <span className="flex-1 text-primary-700 dark:text-primary-300">
                  {h.author ? `par ${h.author}` : 'Système'}
                  {h.previousVersion !== undefined && ` (v${h.previousVersion} → v${h.previousVersion + 1})`}
                </span>
              </li>
            ))}
            {getModelHistory(currentOrgId, model.id).length === 0 && (
              <li className="py-4 text-center text-primary-400 italic">Aucune modification enregistrée</li>
            )}
          </ul>
        </ChartCard>
      )}

      {/* Méthodologie */}
      <Card className="p-4 border-l-4 border-l-accent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">
          <SettingsIcon className="w-3.5 h-3.5" />
          Comment ça marche
        </div>
        <ul className="text-xs text-primary-500 space-y-1">
          <li>• Le modèle <strong>actif</strong> est consommé par tous les dashboards (KPIs, charts), les tables CR (vues N/N-1, Budget vs Réalisé) et les rapports/exports (PDF, Excel).</li>
          <li>• La validation détecte le double comptage et les comptes du Grand Livre non rattachés (orphelins).</li>
          <li>• Les sous-totaux intermédiaires acceptent des formules : <code className="bg-primary-100 dark:bg-primary-800 px-1 rounded">produits_expl - charges_expl</code> ou <code className="bg-primary-100 dark:bg-primary-800 px-1 rounded">(ca - achats) / ca</code>.</li>
          <li>• Le modèle SYSCOHADA par défaut ne peut pas être supprimé mais peut être dupliqué comme base de travail.</li>
          <li>• L'historique trace chaque modification avec horodatage — preview avant publication via le bouton "Aperçu".</li>
        </ul>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section Tree (drag & drop hiérarchique)
// ─────────────────────────────────────────────────────────────────────

function SectionTree({ sections, parentId, accounts, search, onUpdate, onRemove, onMove, onAddChild }: {
  sections: CRSectionNode[];
  parentId?: string;
  accounts: { code: string; label: string; class: string }[];
  search: string;
  onUpdate: (id: string, patch: Partial<CRSectionNode>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, newParentId: string | undefined, newOrder: number) => void;
  onAddChild: (parentId: string) => void;
}) {
  const children = sections.filter((s) => s.parentId === parentId).sort((a, b) => a.order - b.order);
  return (
    <div className={clsx('space-y-1.5', parentId && 'pl-6 border-l border-primary-200 dark:border-primary-700 ml-3')}>
      {children.map((s) => {
        const visible = !search || s.label.toLowerCase().includes(search.toLowerCase()) || s.prefixes.some((p) => p.includes(search));
        if (!visible && !sections.some((x) => x.parentId === s.id && x.label.toLowerCase().includes(search.toLowerCase()))) return null;
        return (
          <SectionRow
            key={s.id}
            section={s}
            allSections={sections}
            accounts={accounts}
            search={search}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onMove={onMove}
            onAddChild={onAddChild}
          />
        );
      })}
    </div>
  );
}

function SectionRow({ section, allSections, accounts, search, onUpdate, onRemove, onMove, onAddChild }: {
  section: CRSectionNode;
  allSections: CRSectionNode[];
  accounts: { code: string; label: string; class: string }[];
  search: string;
  onUpdate: (id: string, patch: Partial<CRSectionNode>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, newParentId: string | undefined, newOrder: number) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const hasChildren = allSections.some((s) => s.parentId === section.id);
  const matchingAccounts = useMemo(() => {
    return accounts.filter((a) => section.prefixes.some((p) => a.code.startsWith(p)));
  }, [accounts, section.prefixes]);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', section.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingOver(false);
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== section.id) {
          const sameParentSiblings = allSections.filter((s) => s.parentId === section.parentId).sort((a, b) => a.order - b.order);
          const newOrder = sameParentSiblings.findIndex((s) => s.id === section.id);
          onMove(draggedId, section.parentId, newOrder);
        }
      }}
      className={clsx(
        'rounded-xl border transition-all',
        draggingOver ? 'border-accent ring-2 ring-accent/30' : 'border-primary-200 dark:border-primary-700',
      )}
    >
      <div className="flex items-center gap-2 p-2.5">
        <span className="cursor-move text-primary-400 hover:text-primary-600">
          <GripVertical className="w-4 h-4" />
        </span>
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="text-primary-500 hover:text-accent">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
        <input
          className="flex-1 bg-transparent border-0 text-sm font-medium focus:outline-none focus:ring-0"
          value={section.label}
          onChange={(e) => onUpdate(section.id, { label: e.target.value })}
          placeholder="Nom de la section"
        />
        <select
          className="text-[10px] px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 bg-transparent"
          value={section.isCharge ? 'charge' : 'produit'}
          onChange={(e) => onUpdate(section.id, { isCharge: e.target.value === 'charge' })}
        >
          <option value="produit">Produit</option>
          <option value="charge">Charge</option>
        </select>
        <button
          className="text-[10px] px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 hover:border-accent hover:text-accent"
          onClick={() => setShowAccountPicker(!showAccountPicker)}
        >
          {section.prefixes.length} compte(s)
        </button>
        <button
          className="text-primary-400 hover:text-accent"
          onClick={() => onAddChild(section.id)}
          title="Ajouter une sous-section"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          className="text-primary-400 hover:text-error"
          onClick={() => onRemove(section.id)}
          title="Supprimer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Account picker */}
      {showAccountPicker && (
        <div className="border-t border-primary-200/60 dark:border-primary-700/60 p-3 bg-primary-50/50 dark:bg-primary-900/30">
          <div className="flex flex-wrap gap-1 mb-2">
            {section.prefixes.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-semibold num">
                {p}
                <button onClick={() => onUpdate(section.id, { prefixes: section.prefixes.filter((x) => x !== p) })} className="hover:text-error">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {section.prefixes.length === 0 && (
              <span className="text-[10px] text-primary-400 italic">Aucun préfixe — section vide.</span>
            )}
          </div>
          <input
            className="input !py-1.5 text-xs mb-2"
            placeholder="Ajouter un préfixe (ex: 70, 706, 7061…) puis Entrée"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v && !section.prefixes.includes(v)) {
                  onUpdate(section.id, { prefixes: [...section.prefixes, v] });
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
          />
          {matchingAccounts.length > 0 && (
            <div className="text-[10px] text-primary-500">
              <p className="font-semibold mb-1">Comptes du plan comptable rattachés ({matchingAccounts.length}) :</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {matchingAccounts.slice(0, 30).map((a) => (
                  <p key={a.code} className="num">
                    <span className="font-semibold">{a.code}</span> — {a.label}
                  </p>
                ))}
                {matchingAccounts.length > 30 && <p className="italic">…+ {matchingAccounts.length - 30}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sous-sections récursives */}
      {expanded && hasChildren && (
        <div className="pb-2 pr-2">
          <SectionTree
            sections={allSections}
            parentId={section.id}
            accounts={accounts}
            search={search}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onMove={onMove}
            onAddChild={onAddChild}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Intermediate Editor (sous-totaux paramétrables)
// ─────────────────────────────────────────────────────────────────────

function IntermediateEditor({ intermediate, sections, onChange, onRemove }: {
  intermediate: CRIntermediateNode;
  sections: CRSectionNode[];
  onChange: (patch: Partial<CRIntermediateNode>) => void;
  onRemove: () => void;
}) {
  // Test de la formule avec valeurs fictives pour valider la syntaxe
  const formulaValid = useMemo(() => {
    if (!intermediate.formula.trim()) return null;
    try {
      const values: Record<string, number> = {};
      for (const s of sections) values[s.id] = 100;
      evaluateFormula(intermediate.formula, values);
      return true;
    } catch {
      return false;
    }
  }, [intermediate.formula, sections]);

  return (
    <div className="p-3 rounded-xl border border-primary-200 dark:border-primary-700">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-3.5 h-3.5 text-accent shrink-0" />
        <input
          className="flex-1 bg-transparent border-0 text-sm font-medium focus:outline-none"
          value={intermediate.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Libellé du sous-total"
        />
        <select
          className="text-[10px] px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 bg-transparent"
          value={intermediate.format ?? 'currency'}
          onChange={(e) => onChange({ format: e.target.value as any })}
        >
          <option value="currency">Montant</option>
          <option value="percent">Pourcentage</option>
          <option value="ratio">Ratio</option>
        </select>
        <button onClick={onRemove} className="text-primary-400 hover:text-error">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        className="input !py-1.5 text-xs font-mono"
        value={intermediate.formula}
        onChange={(e) => onChange({ formula: e.target.value })}
        placeholder="Formule : produits_expl - charges_expl"
      />
      <div className="flex items-center justify-between mt-1.5 text-[10px]">
        <span className={clsx(
          formulaValid === null ? 'text-primary-400' :
          formulaValid ? 'text-success' : 'text-error',
        )}>
          {formulaValid === null ? 'Saisissez une formule' : formulaValid ? '✓ Syntaxe valide' : '✗ Formule invalide'}
        </span>
        <span className="text-primary-400">
          Variables : {sections.slice(0, 3).map((s) => s.id).join(', ')}{sections.length > 3 ? '…' : ''}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Preview Mode (rendu du CR avant publication)
// ─────────────────────────────────────────────────────────────────────

function ModelPreview({ model, accounts }: { model: CRModel; accounts: { code: string; label: string; class: string }[] }) {
  return (
    <ChartCard title="Aperçu du modèle" subtitle="Structure finale qui sera appliquée aux dashboards et rapports" accent="rgb(var(--accent))">
      <div className="space-y-4">
        {model.sections.filter((s) => !s.parentId).sort((a, b) => a.order - b.order).map((root) => (
          <PreviewSection key={root.id} section={root} allSections={model.sections} accounts={accounts} level={0} />
        ))}
        {model.intermediates.length > 0 && (
          <div className="mt-6 pt-4 border-t-2 border-primary-200 dark:border-primary-700">
            <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">Sous-totaux calculés</p>
            <ul className="space-y-1 text-sm">
              {model.intermediates.map((it) => (
                <li key={it.id} className="flex items-center justify-between p-2 rounded-lg bg-primary-50 dark:bg-primary-900/30">
                  <span className="font-semibold">{it.label}</span>
                  <code className="text-xs text-primary-500 font-mono">{it.formula || '—'}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

function PreviewSection({ section, allSections, accounts, level }: {
  section: CRSectionNode;
  allSections: CRSectionNode[];
  accounts: { code: string; label: string; class: string }[];
  level: number;
}) {
  const children = allSections.filter((s) => s.parentId === section.id).sort((a, b) => a.order - b.order);
  const matchingAccounts = accounts.filter((a) => section.prefixes.some((p) => a.code.startsWith(p)));
  return (
    <div className={clsx(level > 0 && 'ml-4 pl-3 border-l border-primary-200 dark:border-primary-700')}>
      <div className="flex items-center justify-between py-1.5">
        <p className={clsx('font-semibold', level === 0 ? 'text-base' : 'text-sm')}>{section.label}</p>
        <span className="text-[10px] uppercase tracking-wider text-primary-500">
          {section.isCharge ? 'Charge' : 'Produit'} · {matchingAccounts.length} compte(s)
        </span>
      </div>
      {children.map((c) => <PreviewSection key={c.id} section={c} allSections={allSections} accounts={accounts} level={level + 1} />)}
    </div>
  );
}
