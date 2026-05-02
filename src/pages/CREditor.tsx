/**
 * CR Editor v3 — Personnalisation du Compte de Résultat avec Drag & Drop
 *
 * Layout 2 colonnes :
 *  - GAUCHE : Plan comptable arborescent (Classe > sous-classe > compte)
 *    avec + pour expand chaque niveau. Chaque nœud est DRAGGABLE.
 *  - DROITE : Modèle CR avec sections/sous-sections, chacune ACCEPTE LES
 *    DROPS du panneau gauche. Boutons Edit/Delete/Add toujours visibles.
 *
 * UX :
 *  - Auto-save sur chaque action
 *  - Modal pour créer/éditer une section avec son nom + type
 *  - Drag d'un compte ou d'une classe sur une section → ajout du préfixe
 *  - Chip de compte cliquable pour le retirer
 *  - Highlight + scroll auto sur la nouvelle section
 *  - Validation temps réel (doublons, orphelins)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Eye, Trash2, Copy, Star, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, FolderTree, FileEdit, History, Settings as SettingsIcon,
  X, Calculator, Edit2, Check, GripVertical, Search,
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
  deleteModel, addSection, updateSection, removeSection, validateModel,
  evaluateFormula, getModelHistory, listCRAccounts,
  type CRModel, type CRSectionNode, type CRIntermediateNode, type ValidationReport,
} from '../engine/crModels';
import clsx from 'clsx';

// ─────────────────────────────────────────────────────────────────────
// Types pour la hiérarchie du plan comptable
// ─────────────────────────────────────────────────────────────────────
type COANode = {
  code: string;
  label: string;
  level: 'class' | 'subclass' | 'group' | 'account'; // 1, 2, 3+ digits
  children: COANode[];
  isLeaf: boolean;
};

// Tracking du drag courant via une variable module-level (les events
// "dragover/drop" du HTML5 ne donnent pas un accès fiable aux dataTransfer
// pendant dragover, on stocke donc l'information dans React state).
type DragPayload = {
  code: string;
  label: string;
  level: COANode['level'];
};

// ─────────────────────────────────────────────────────────────────────
// Modal générique
// ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-primary-900 rounded-2xl shadow-2xl border border-primary-200 dark:border-primary-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-200 dark:border-primary-700 sticky top-0 bg-white dark:bg-primary-900 z-10">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-primary-400 hover:text-error">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-primary-200 dark:border-primary-700 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-primary-900">{footer}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal d'édition de section (nom, type)
// ─────────────────────────────────────────────────────────────────────
function SectionEditModal({ open, onClose, onSave, initial, parentLabel }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { label: string; isCharge: boolean }) => void;
  initial?: { label: string; isCharge: boolean };
  parentLabel?: string;
}) {
  const [label, setLabel] = useState('');
  const [isCharge, setIsCharge] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setIsCharge(initial?.isCharge ?? false);
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!label.trim()) { toast.warning('Nom requis', 'Saisissez un nom pour la section.'); return; }
    onSave({ label: label.trim(), isCharge });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Modifier la section' : 'Nouvelle section'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleSave}>
            <Check className="w-4 h-4" /> {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {parentLabel && <p className="text-xs text-primary-500 italic">Sous-section de : <strong>{parentLabel}</strong></p>}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nom</label>
          <input
            className="input mt-1 w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: Charges d'exploitation directe…"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Type</label>
          <div className="flex gap-2 mt-1">
            <button type="button" className={clsx('flex-1 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all', !isCharge ? 'border-success bg-success/10 text-success' : 'border-primary-200 dark:border-primary-700 text-primary-500')} onClick={() => setIsCharge(false)}>
              Produit (classe 7)
            </button>
            <button type="button" className={clsx('flex-1 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all', isCharge ? 'border-error bg-error/10 text-error' : 'border-primary-200 dark:border-primary-700 text-primary-500')} onClick={() => setIsCharge(true)}>
              Charge (classe 6)
            </button>
          </div>
        </div>
        <p className="text-xs text-primary-500 italic bg-primary-100/60 dark:bg-primary-800/60 p-3 rounded-lg">
          💡 Une fois créée, glissez les classes ou comptes du <strong>plan comptable à gauche</strong> sur cette section pour les rattacher.
        </p>
      </div>
    </Modal>
  );
}

function ConfirmModal({ open, onClose, onConfirm, title, message }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-primary !bg-error hover:!bg-error/90" onClick={() => { onConfirm(); onClose(); }}>Confirmer</button>
        </>
      }>
      <p className="text-sm text-primary-700 dark:text-primary-300">{message}</p>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Page principale
// ═════════════════════════════════════════════════════════════════════

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
  const [coaSearch, setCoaSearch] = useState('');

  const [editingSection, setEditingSection] = useState<{ section?: CRSectionNode; parentId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'section' | 'model'; id: string; label: string } | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [forceExpand, setForceExpand] = useState<Set<string>>(new Set());

  // Drag state (utilisé pendant le drag pour permettre les "dragover" feedback)
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const [dragHoverSectionId, setDragHoverSectionId] = useState<string | null>(null);

  // ── Chargement ──
  useEffect(() => {
    if (!currentOrgId) return;
    const list = listModels(currentOrgId);
    setModels(list);
    const active = list.find((m) => m.isActive) ?? list[0];
    if (active) {
      setSelectedId(active.id);
      setModel(JSON.parse(JSON.stringify(active)));
    }
    listCRAccounts(currentOrgId).then(setAccounts);
    db.gl.where('orgId').equals(currentOrgId).toArray()
      .then((entries) => setGlAccounts([...new Set(entries.map((e) => e.account))]));
  }, [currentOrgId]);

  useEffect(() => {
    if (!model) { setValidation(null); return; }
    setValidation(validateModel(model, glAccounts));
  }, [model, glAccounts]);

  // ── Construction de l'arbre du plan comptable ──
  const coaTree = useMemo<COANode[]>(() => buildCOATree(accounts), [accounts]);

  // ── Persistence ──
  const persistModel = (updated: CRModel) => {
    setModel(updated);
    saveModel(updated);
    setModels(listModels(currentOrgId!));
  };

  const handleSelectModel = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setSelectedId(id);
    setModel(JSON.parse(JSON.stringify(m)));
  };

  const handlePublish = () => {
    if (!model || !validation) return;
    if (!validation.valid) { toast.warning('Corrigez les avertissements', 'Doublons ou comptes orphelins.'); return; }
    saveModel(model);
    publishModel(currentOrgId!, model.id);
    setModels(listModels(currentOrgId!));
    toast.success('Modèle publié', `"${model.name}" v${model.version + 1} appliqué.`);
  };

  const handleActivate = (id: string) => {
    if (!currentOrgId) return;
    activateModel(currentOrgId, id);
    setModels(listModels(currentOrgId));
    toast.success('Modèle activé', 'Tous les dashboards et rapports utilisent désormais ce modèle.');
  };

  const handleDuplicate = () => {
    if (!model || !currentOrgId || !duplicateName.trim()) return;
    const dup = duplicateModel(currentOrgId, model.id, duplicateName.trim());
    if (dup) {
      setModels(listModels(currentOrgId));
      setSelectedId(dup.id);
      setModel(JSON.parse(JSON.stringify(dup)));
      toast.success('Modèle dupliqué', `"${dup.name}" créé.`);
    }
    setDuplicateModalOpen(false);
    setDuplicateName('');
  };

  const handleDeleteModel = () => {
    if (!model || !currentOrgId) return;
    const result = deleteModel(currentOrgId, model.id);
    if (result.success) {
      const list = listModels(currentOrgId);
      setModels(list);
      const fallback = list[0];
      if (fallback) { setSelectedId(fallback.id); setModel(JSON.parse(JSON.stringify(fallback))); }
      toast.success('Modèle supprimé');
    } else toast.error('Suppression impossible', result.reason);
  };

  const handleSaveSection = (data: { label: string; isCharge: boolean }) => {
    if (!model || !editingSection) return;
    if (editingSection.section) {
      const updated = updateSection(model, editingSection.section.id, data);
      persistModel(updated);
      setLastAddedId(editingSection.section.id);
      toast.success('Section modifiée', data.label);
    } else {
      const updated = addSection(model, { ...data, prefixes: [] }, editingSection.parentId);
      const newSection = updated.sections[updated.sections.length - 1];
      persistModel(updated);
      setLastAddedId(newSection?.id ?? null);
      if (editingSection.parentId) {
        const ancestors = new Set<string>();
        let pid: string | undefined = editingSection.parentId;
        while (pid) {
          ancestors.add(pid);
          pid = updated.sections.find((s) => s.id === pid)?.parentId;
        }
        setForceExpand(ancestors);
      }
      toast.success(`Section "${data.label}" ajoutée`, 'Glissez maintenant des comptes du plan à gauche');
      setTimeout(() => {
        document.getElementById(`section-row-${newSection?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setTimeout(() => setLastAddedId(null), 3000);
    }
    setEditingSection(null);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!model) return;
    persistModel(removeSection(model, sectionId));
    toast.success('Section supprimée');
  };

  // Drag & drop : un compte ou une classe est déposée sur une section
  const handleDropOnSection = (sectionId: string) => {
    if (!model) return;
    const payload = dragPayloadRef.current;
    dragPayloadRef.current = null;
    setDragHoverSectionId(null);
    if (!payload) return;

    const section = model.sections.find((s) => s.id === sectionId);
    if (!section) return;

    if (section.prefixes.includes(payload.code)) {
      toast.warning('Déjà rattaché', `Le code ${payload.code} est déjà dans cette section.`);
      return;
    }

    const updated = updateSection(model, sectionId, {
      prefixes: [...section.prefixes, payload.code],
    });
    persistModel(updated);
    toast.success(
      `${payload.level === 'account' ? 'Compte' : 'Classe'} ${payload.code} ajouté`,
      `→ "${section.label}"`,
    );
  };

  const handleRemovePrefix = (sectionId: string, prefix: string) => {
    if (!model) return;
    const section = model.sections.find((s) => s.id === sectionId);
    if (!section) return;
    persistModel(updateSection(model, sectionId, {
      prefixes: section.prefixes.filter((p) => p !== prefix),
    }));
    toast.success(`Code ${prefix} retiré`);
  };

  const handleAddIntermediate = () => {
    if (!model) return;
    persistModel({
      ...model,
      intermediates: [...model.intermediates, {
        id: `inter-${Date.now()}`,
        label: 'Nouveau sous-total',
        formula: '',
        format: 'currency',
        order: model.intermediates.length,
      }],
    });
  };

  const handleUpdateIntermediate = (id: string, patch: Partial<CRIntermediateNode>) => {
    if (!model) return;
    persistModel({
      ...model,
      intermediates: model.intermediates.map((x) => x.id === id ? { ...x, ...patch } : x),
    });
  };

  const handleDeleteIntermediate = (id: string) => {
    if (!model) return;
    persistModel({
      ...model,
      intermediates: model.intermediates.filter((x) => x.id !== id),
    });
  };

  const handleUpdateModelField = (patch: Partial<CRModel>) => {
    if (!model) return;
    persistModel({ ...model, ...patch });
  };

  // États de chargement distincts :
  //  - pas de currentOrgId → CTA explicite vers la sélection
  //  - currentOrgId mais org pas encore chargé (live query Dexie) → loader
  if (!currentOrgId) {
    return (
      <div className="py-20 text-center">
        <FolderTree className="w-12 h-12 text-primary-300 mx-auto mb-3" />
        <p className="text-sm text-primary-500 mb-3">Sélectionnez une société dans le menu en haut à gauche pour personnaliser son CR.</p>
      </div>
    );
  }
  if (!org) {
    // Org en cours de chargement OU introuvable — on rend quand même la page
    // avec un fallback minimal pour ne pas bloquer.
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Personnaliser le Compte de Résultat"
        subtitle={`${org?.name ?? 'Société'} · Drag & Drop des comptes du plan vers les sections`}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setShowHistory(!showHistory)}><History className="w-4 h-4" /> Historique</button>
            <button className="btn-outline" onClick={() => setPreviewMode(!previewMode)}><Eye className="w-4 h-4" /> {previewMode ? 'Quitter aperçu' : 'Aperçu'}</button>
            <button className="btn-outline" onClick={() => { setDuplicateName(`${model?.name ?? 'Modèle'} (copie)`); setDuplicateModalOpen(true); }} disabled={!model}><Copy className="w-4 h-4" /> Dupliquer</button>
            <button className="btn-primary" onClick={handlePublish} disabled={!model || !validation?.valid}><CheckCircle2 className="w-4 h-4" /> Publier</button>
          </div>
        }
      />

      {/* Sélecteur de modèles */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">
          <FolderTree className="w-3.5 h-3.5" /> Modèles ({models.length})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {models.map((m) => (
            <div key={m.id} className={clsx('p-3 rounded-xl border-2 transition-all', selectedId === m.id ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400')}>
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
                {m.isActive && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">Actif</span>}
              </div>
              {!m.isActive && (
                <button className="mt-2 w-full text-xs px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 hover:border-accent hover:text-accent transition-colors" onClick={() => handleActivate(m.id)}>
                  Activer ce modèle
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Validation */}
      {validation && model && validation.warnings.length > 0 && (
        <Card className="p-4 border-l-4 border-l-warning">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <p className="text-sm font-semibold text-warning">Avertissements</p>
          </div>
          <ul className="text-xs text-primary-700 dark:text-primary-300 space-y-1">
            {validation.warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </Card>
      )}

      {/* Preview Mode */}
      {model && previewMode && <ModelPreview model={model} accounts={accounts} />}

      {/* Editor Mode — 2 colonnes */}
      {model && !previewMode && (
        <>
          {/* Métadonnées du modèle */}
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">
              <FileEdit className="w-3.5 h-3.5 inline mr-1" /> Modèle (auto-sauvegardé)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Nom</label>
                <input className="input mt-1" value={model.name} onChange={(e) => handleUpdateModelField({ name: e.target.value })} disabled={model.isDefault} />
              </div>
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Description</label>
                <input className="input mt-1" value={model.description ?? ''} onChange={(e) => handleUpdateModelField({ description: e.target.value })} />
              </div>
            </div>
          </Card>

          {/* GRID 2 colonnes : COA gauche / Sections droite */}
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
            {/* ─── PANNEAU GAUCHE : Plan comptable ─── */}
            <ChartCard title="Plan comptable" subtitle={`${accounts.length} comptes · glissez vers les sections →`} accent="rgb(var(--accent))">
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
                <input className="input w-full pl-9 !py-1.5 text-xs" placeholder="Rechercher (ex: 60, 706, ventes…)" value={coaSearch} onChange={(e) => setCoaSearch(e.target.value)} />
                {coaSearch && <button onClick={() => setCoaSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-error"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <div className="max-h-[600px] overflow-y-auto pr-1">
                {coaTree.length === 0 ? (
                  <p className="text-xs text-primary-400 italic text-center py-4">Aucun compte chargé. Importez votre plan comptable d'abord.</p>
                ) : (
                  coaTree.map((node) => (
                    <COATreeNode
                      key={node.code}
                      node={node}
                      depth={0}
                      search={coaSearch}
                      onDragStart={(payload) => { dragPayloadRef.current = payload; }}
                      onDragEnd={() => { dragPayloadRef.current = null; setDragHoverSectionId(null); }}
                    />
                  ))
                )}
              </div>
            </ChartCard>

            {/* ─── PANNEAU DROITE : Sections du modèle ─── */}
            <ChartCard
              title={`Sections du modèle (${model.sections.length})`}
              subtitle="Déposez les classes/comptes du plan ici · Modifier/Supprimer/Sous-section sur chaque ligne"
              accent="rgb(var(--accent))"
            >
              <div className="flex justify-end mb-3">
                <button className="btn-primary" onClick={() => setEditingSection({ parentId: undefined })}>
                  <Plus className="w-4 h-4" /> Nouvelle section
                </button>
              </div>

              {model.sections.length === 0 ? (
                <div className="py-12 text-center">
                  <FolderTree className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                  <p className="text-sm text-primary-500 mb-3">Aucune section.</p>
                  <button className="btn-primary" onClick={() => setEditingSection({ parentId: undefined })}>
                    <Plus className="w-4 h-4" /> Créer la première section
                  </button>
                </div>
              ) : (
                <SectionTree
                  sections={model.sections}
                  parentId={undefined}
                  accounts={accounts}
                  onEdit={(section) => setEditingSection({ section: { label: section.label, isCharge: section.isCharge } as any, parentId: section.parentId })}
                  onAddChild={(parentId) => setEditingSection({ parentId })}
                  onDelete={(section) => setConfirmDelete({ type: 'section', id: section.id, label: section.label })}
                  onDrop={handleDropOnSection}
                  onRemovePrefix={handleRemovePrefix}
                  onUpdateSection={(id, patch) => persistModel(updateSection(model, id, patch))}
                  onEditSection={(section) => setEditingSection({ section })}
                  lastAddedId={lastAddedId}
                  forceExpand={forceExpand}
                  dragHoverSectionId={dragHoverSectionId}
                  setDragHoverSectionId={setDragHoverSectionId}
                />
              )}
            </ChartCard>
          </div>

          {/* Intermédiaires */}
          <ChartCard title="Sous-totaux intermédiaires" subtitle="Marge Brute, EBITDA, Résultat Net…" accent="rgb(var(--accent))">
            <div className="space-y-2">
              {model.intermediates.map((it) => (
                <IntermediateEditor key={it.id} intermediate={it} sections={model.sections}
                  onChange={(patch) => handleUpdateIntermediate(it.id, patch)}
                  onRemove={() => handleDeleteIntermediate(it.id)} />
              ))}
              <button className="w-full p-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-700 text-xs text-primary-500 hover:border-accent hover:text-accent transition-colors" onClick={handleAddIntermediate}>
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Ajouter un sous-total
              </button>
            </div>
          </ChartCard>

          {!model.isDefault && (
            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Actions</p>
                <p className="text-xs text-primary-500 mt-0.5">{model.isActive ? 'Modèle actif — désactivez avant de supprimer.' : 'Inactif — peut être supprimé.'}</p>
              </div>
              <button className="btn-outline text-error" disabled={model.isActive} onClick={() => setConfirmDelete({ type: 'model', id: model.id, label: model.name })}>
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
            </Card>
          )}
        </>
      )}

      {/* Historique */}
      {showHistory && model && (
        <ChartCard title="Historique des modifications" accent="rgb(var(--accent))">
          <ul className="space-y-1.5 text-xs">
            {getModelHistory(currentOrgId, model.id).slice(0, 30).map((h) => (
              <li key={h.id ?? h.timestamp} className="flex items-center gap-3 py-1 border-b border-primary-100/60 dark:border-primary-800/40">
                <span className="text-primary-400 num shrink-0">{new Date(h.timestamp).toLocaleString('fr-FR')}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-200/60 text-primary-600">{h.action}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      {/* Aide */}
      <Card className="p-4 border-l-4 border-l-accent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">
          <SettingsIcon className="w-3.5 h-3.5" /> Comment ça marche
        </div>
        <ul className="text-xs text-primary-500 space-y-1">
          <li>• <strong>Drag & Drop</strong> : tirez une <strong>classe</strong> (60, 70…) ou un <strong>compte précis</strong> (601100…) du panneau gauche vers une section à droite.</li>
          <li>• <strong>+</strong> à côté d'une classe : développe pour voir les sous-classes et comptes individuels.</li>
          <li>• <strong>Modifier / Supprimer / Sous-section</strong> : boutons sur chaque ligne de section.</li>
          <li>• <strong>Auto-sauvegarde</strong> à chaque action.</li>
          <li>• Le modèle <strong>actif</strong> propage automatiquement à tous les dashboards et rapports.</li>
        </ul>
      </Card>

      {/* Modals */}
      <SectionEditModal
        open={!!editingSection}
        onClose={() => setEditingSection(null)}
        onSave={handleSaveSection}
        initial={editingSection?.section ? { label: editingSection.section.label, isCharge: editingSection.section.isCharge } : undefined}
        parentLabel={editingSection?.parentId ? model?.sections.find((s) => s.id === editingSection.parentId)?.label : undefined}
      />
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          if (confirmDelete.type === 'section') handleDeleteSection(confirmDelete.id);
          else handleDeleteModel();
        }}
        title={`Supprimer ${confirmDelete?.type === 'model' ? 'le modèle' : 'la section'}`}
        message={`Confirmer la suppression de "${confirmDelete?.label}" ${confirmDelete?.type === 'section' ? 'et toutes ses sous-sections' : ''} ?`}
      />
      <Modal open={duplicateModalOpen} onClose={() => setDuplicateModalOpen(false)} title="Dupliquer ce modèle"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDuplicateModalOpen(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleDuplicate} disabled={!duplicateName.trim()}><Copy className="w-4 h-4" /> Dupliquer</button>
          </>
        }>
        <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nom du nouveau modèle</label>
        <input className="input mt-1 w-full" value={duplicateName} onChange={(e) => setDuplicateName(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && duplicateName.trim()) handleDuplicate(); }} />
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Construction de l'arbre du plan comptable
// ─────────────────────────────────────────────────────────────────────

function buildCOATree(accounts: { code: string; label: string; class: string }[]): COANode[] {
  // Niveaux : Classe (1 chiffre) > Sous-classe (2 chiffres) > Groupe (3 chiffres) > Compte
  const CLASS_LABELS: Record<string, string> = {
    '1': 'Classe 1 — Capitaux',
    '2': 'Classe 2 — Immobilisations',
    '3': 'Classe 3 — Stocks',
    '4': 'Classe 4 — Tiers',
    '5': 'Classe 5 — Trésorerie',
    '6': 'Classe 6 — Charges',
    '7': 'Classe 7 — Produits',
    '8': 'Classe 8 — HAO',
    '9': 'Classe 9 — Analytique',
  };

  const root: Map<string, COANode> = new Map();

  for (const acc of accounts) {
    const c1 = acc.code[0]; if (!c1) continue;
    if (!root.has(c1)) {
      root.set(c1, { code: c1, label: CLASS_LABELS[c1] ?? `Classe ${c1}`, level: 'class', children: [], isLeaf: false });
    }
    const cls = root.get(c1)!;

    if (acc.code.length >= 2) {
      const c2 = acc.code.substring(0, 2);
      let sub = cls.children.find((n) => n.code === c2);
      if (!sub) {
        sub = { code: c2, label: `Sous-classe ${c2}`, level: 'subclass', children: [], isLeaf: false };
        cls.children.push(sub);
      }

      if (acc.code.length >= 3) {
        const c3 = acc.code.substring(0, 3);
        let grp = sub.children.find((n) => n.code === c3);
        if (!grp) {
          grp = { code: c3, label: `Groupe ${c3}`, level: 'group', children: [], isLeaf: false };
          sub.children.push(grp);
        }

        if (acc.code.length > 3) {
          const exists = grp.children.find((n) => n.code === acc.code);
          if (!exists) {
            grp.children.push({ code: acc.code, label: acc.label, level: 'account', children: [], isLeaf: true });
          }
        } else {
          // Le compte EST le groupe (3 chiffres exactement)
          grp.label = acc.label;
          grp.isLeaf = true;
        }
      }
    }
  }

  // Trie chaque niveau par code
  const sortRec = (node: COANode) => {
    node.children.sort((a, b) => a.code.localeCompare(b.code));
    node.children.forEach(sortRec);
  };
  const list = Array.from(root.values()).sort((a, b) => a.code.localeCompare(b.code));
  list.forEach(sortRec);
  return list;
}

// ─────────────────────────────────────────────────────────────────────
// Nœud de l'arbre du plan comptable (gauche)
// ─────────────────────────────────────────────────────────────────────

function COATreeNode({ node, depth, search, onDragStart, onDragEnd }: {
  node: COANode;
  depth: number;
  search: string;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  // Filtrage par recherche : montre le nœud si lui ou un descendant matche
  const matchesSelf = !search || node.code.includes(search) || node.label.toLowerCase().includes(search.toLowerCase());
  const matchesDeep = (n: COANode): boolean =>
    !search || n.code.includes(search) || n.label.toLowerCase().includes(search.toLowerCase()) || n.children.some(matchesDeep);
  const visible = matchesSelf || node.children.some(matchesDeep);
  if (!visible) return null;
  // En mode recherche, on auto-expand
  const effectiveExpanded = expanded || (search && node.children.some(matchesDeep));

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', node.code);
    onDragStart({ code: node.code, label: node.label, level: node.level });
  };

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        className={clsx(
          'flex items-center gap-1.5 py-1 px-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-accent/10 transition-colors',
          depth === 0 && 'font-semibold text-sm',
          depth === 1 && 'text-xs',
          depth >= 2 && 'text-[11px]',
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        title={`Glisser ${node.code} vers une section`}
      >
        {node.children.length > 0 ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-primary-500 hover:text-accent shrink-0">
            {effectiveExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <GripVertical className="w-3 h-3 text-primary-300 shrink-0" />
        <span className={clsx('num shrink-0 font-mono', node.level === 'class' ? 'text-accent' : node.level === 'subclass' ? 'text-primary-700 dark:text-primary-300' : 'text-primary-500')}>
          {node.code}
        </span>
        <span className="truncate text-primary-700 dark:text-primary-300">{node.label}</span>
      </div>
      {effectiveExpanded && node.children.map((child) => (
        <COATreeNode key={child.code} node={child} depth={depth + 1} search={search} onDragStart={onDragStart} onDragEnd={onDragEnd} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section Tree (droite, drop targets)
// ─────────────────────────────────────────────────────────────────────

interface SectionTreeProps {
  sections: CRSectionNode[];
  parentId?: string;
  accounts: { code: string; label: string; class: string }[];
  onEdit: (section: CRSectionNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (section: CRSectionNode) => void;
  onDrop: (sectionId: string) => void;
  onRemovePrefix: (sectionId: string, prefix: string) => void;
  onUpdateSection: (sectionId: string, patch: Partial<CRSectionNode>) => void;
  onEditSection: (section: CRSectionNode) => void;
  lastAddedId?: string | null;
  forceExpand?: Set<string>;
  dragHoverSectionId: string | null;
  setDragHoverSectionId: (id: string | null) => void;
}

function SectionTree(props: SectionTreeProps) {
  const children = props.sections.filter((s) => s.parentId === props.parentId).sort((a, b) => a.order - b.order);
  return (
    <div className={clsx('space-y-1.5', props.parentId && 'pl-6 border-l-2 border-primary-200 dark:border-primary-700 ml-3 mt-1.5')}>
      {children.map((s) => (
        <SectionRow key={s.id} {...props} section={s} />
      ))}
    </div>
  );
}

function SectionRow({ section, sections, accounts, onAddChild, onDelete, onDrop, onRemovePrefix, onEditSection, lastAddedId, forceExpand, dragHoverSectionId, setDragHoverSectionId, ...rest }: SectionTreeProps & { section: CRSectionNode }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = sections.some((s) => s.parentId === section.id);
  const matchingCount = useMemo(() =>
    accounts.filter((a) => section.prefixes.some((p) => a.code.startsWith(p))).length,
  [accounts, section.prefixes]);

  useEffect(() => {
    if (forceExpand?.has(section.id)) setExpanded(true);
  }, [forceExpand, section.id]);

  const isHighlighted = lastAddedId === section.id;
  const isDropTarget = dragHoverSectionId === section.id;

  return (
    <div
      id={`section-row-${section.id}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragHoverSectionId(section.id); }}
      onDragLeave={(e) => { e.stopPropagation(); if (dragHoverSectionId === section.id) setDragHoverSectionId(null); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(section.id); }}
      className={clsx(
        'rounded-xl border-2 transition-all',
        isDropTarget ? 'border-accent ring-2 ring-accent/40 bg-accent/10' :
        isHighlighted ? 'border-accent ring-2 ring-accent/40 bg-accent/5 animate-pulse-soft' :
        'border-primary-200 dark:border-primary-700 hover:border-accent/50',
      )}
    >
      <div className="flex items-center gap-2 p-3">
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="text-primary-500 hover:text-accent shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <div className={clsx('shrink-0 w-2 h-2 rounded-full', section.isCharge ? 'bg-error' : 'bg-success')} title={section.isCharge ? 'Charge' : 'Produit'} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{section.label}</p>
          <p className="text-[11px] text-primary-500 truncate">
            {section.prefixes.length > 0 ? <>{section.prefixes.length} préfixe(s) · {matchingCount} compte(s)</> : <span className="text-warning">⚠ Aucun préfixe — glissez-y des comptes</span>}
          </p>
        </div>
        <button className="btn-outline !py-1 !px-2 text-xs shrink-0" onClick={() => onEditSection(section)} title="Modifier"><Edit2 className="w-3 h-3" /> Modifier</button>
        <button className="btn-outline !py-1 !px-2 text-xs shrink-0" onClick={() => onAddChild(section.id)} title="Ajouter une sous-section"><Plus className="w-3 h-3" /> Sous-section</button>
        <button className="btn-outline !py-1 !px-2 text-xs text-error shrink-0" onClick={() => onDelete(section)} title="Supprimer"><Trash2 className="w-3 h-3" /></button>
      </div>

      {/* Chips des préfixes/comptes attachés */}
      {section.prefixes.length > 0 && (
        <div className="px-3 pb-3 -mt-1">
          <div className="flex flex-wrap gap-1">
            {section.prefixes.map((p) => {
              const acc = accounts.find((a) => a.code === p);
              return (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[11px] font-semibold">
                  <span className="num">{p}</span>
                  {acc && <span className="text-primary-500 truncate max-w-[120px]" title={acc.label}>· {acc.label}</span>}
                  <button onClick={(e) => { e.stopPropagation(); onRemovePrefix(section.id, p); }} className="hover:text-error" title="Retirer">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {expanded && hasChildren && (
        <div className="pb-2 pr-2">
          <SectionTree
            sections={sections}
            parentId={section.id}
            accounts={accounts}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onDrop={onDrop}
            onRemovePrefix={onRemovePrefix}
            onEditSection={onEditSection}
            lastAddedId={lastAddedId}
            forceExpand={forceExpand}
            dragHoverSectionId={dragHoverSectionId}
            setDragHoverSectionId={setDragHoverSectionId}
            {...rest}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Intermediate Editor
// ─────────────────────────────────────────────────────────────────────

function IntermediateEditor({ intermediate, sections, onChange, onRemove }: {
  intermediate: CRIntermediateNode;
  sections: CRSectionNode[];
  onChange: (patch: Partial<CRIntermediateNode>) => void;
  onRemove: () => void;
}) {
  const formulaValid = useMemo(() => {
    if (!intermediate.formula.trim()) return null;
    try {
      const values: Record<string, number> = {};
      for (const s of sections) values[s.id] = 100;
      evaluateFormula(intermediate.formula, values);
      return true;
    } catch { return false; }
  }, [intermediate.formula, sections]);

  return (
    <div className="p-3 rounded-xl border border-primary-200 dark:border-primary-700">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-3.5 h-3.5 text-accent shrink-0" />
        <input className="flex-1 bg-transparent border-0 text-sm font-medium focus:outline-none" value={intermediate.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Libellé du sous-total" />
        <select className="text-[10px] px-2 py-1 rounded-lg border border-primary-200 dark:border-primary-700 bg-transparent" value={intermediate.format ?? 'currency'} onChange={(e) => onChange({ format: e.target.value as any })}>
          <option value="currency">Montant</option>
          <option value="percent">Pourcentage</option>
          <option value="ratio">Ratio</option>
        </select>
        <button onClick={onRemove} className="text-primary-400 hover:text-error" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <input className="input !py-1.5 text-xs font-mono" value={intermediate.formula} onChange={(e) => onChange({ formula: e.target.value })} placeholder="Formule : produits_expl - charges_expl" />
      <div className="flex items-center justify-between mt-1.5 text-[10px]">
        <span className={clsx(formulaValid === null ? 'text-primary-400' : formulaValid ? 'text-success' : 'text-error')}>
          {formulaValid === null ? 'Saisissez une formule' : formulaValid ? '✓ Syntaxe valide' : '✗ Formule invalide'}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Preview Mode
// ─────────────────────────────────────────────────────────────────────

function ModelPreview({ model, accounts }: { model: CRModel; accounts: { code: string; label: string; class: string }[] }) {
  return (
    <ChartCard title="Aperçu du modèle" subtitle="Structure finale" accent="rgb(var(--accent))">
      <div className="space-y-4">
        {model.sections.filter((s) => !s.parentId).sort((a, b) => a.order - b.order).map((root) => (
          <PreviewSection key={root.id} section={root} allSections={model.sections} accounts={accounts} level={0} />
        ))}
        {model.intermediates.length > 0 && (
          <div className="mt-6 pt-4 border-t-2 border-primary-200 dark:border-primary-700">
            <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">Sous-totaux</p>
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
  section: CRSectionNode; allSections: CRSectionNode[];
  accounts: { code: string; label: string; class: string }[]; level: number;
}) {
  const children = allSections.filter((s) => s.parentId === section.id).sort((a, b) => a.order - b.order);
  const matchingAccounts = accounts.filter((a) => section.prefixes.some((p) => a.code.startsWith(p)));
  return (
    <div className={clsx(level > 0 && 'ml-4 pl-3 border-l border-primary-200 dark:border-primary-700')}>
      <div className="flex items-center justify-between py-1.5">
        <p className={clsx('font-semibold', level === 0 ? 'text-base' : 'text-sm')}>{section.label}</p>
        <span className="text-[10px] uppercase tracking-wider text-primary-500">{section.isCharge ? 'Charge' : 'Produit'} · {matchingAccounts.length} compte(s)</span>
      </div>
      {children.map((c) => <PreviewSection key={c.id} section={c} allSections={allSections} accounts={accounts} level={level + 1} />)}
    </div>
  );
}
