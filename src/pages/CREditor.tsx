/**
 * CR Editor v2 — Personnalisation du Compte de Résultat
 *
 * UX améliorée :
 *  - AUTO-SAVE : chaque modification est persistée immédiatement (plus de confusion brouillon/sauvegardé)
 *  - MODAL explicite pour créer/éditer une section
 *  - Boutons Edit / Delete visibles sur chaque ligne (plus d'icônes cachées)
 *  - Toast de confirmation sur chaque action
 *  - Picker de comptes intégré au modal
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Eye, Trash2, Copy, Star, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, FolderTree, FileEdit, History, Settings as SettingsIcon,
  Search, X, Calculator, Edit2, Check,
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
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-primary-900 rounded-2xl shadow-2xl border border-primary-200 dark:border-primary-700"
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
// Section Edit Modal (création + édition)
// ─────────────────────────────────────────────────────────────────────
function SectionEditModal({ open, onClose, onSave, initial, accounts, parentLabel }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { label: string; prefixes: string[]; isCharge: boolean }) => void;
  initial?: { label: string; prefixes: string[]; isCharge: boolean };
  accounts: { code: string; label: string; class: string }[];
  parentLabel?: string;
}) {
  const [label, setLabel] = useState('');
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [isCharge, setIsCharge] = useState(false);
  const [prefixInput, setPrefixInput] = useState('');
  const [accountSearch, setAccountSearch] = useState('');

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setPrefixes(initial?.prefixes ?? []);
      setIsCharge(initial?.isCharge ?? false);
      setPrefixInput('');
      setAccountSearch('');
    }
  }, [open, initial]);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts.slice(0, 50);
    const q = accountSearch.toLowerCase();
    return accounts.filter((a) => a.code.startsWith(accountSearch) || a.label.toLowerCase().includes(q)).slice(0, 50);
  }, [accounts, accountSearch]);

  const addPrefix = (p: string) => {
    const trimmed = p.trim();
    if (!trimmed || prefixes.includes(trimmed)) return;
    setPrefixes([...prefixes, trimmed]);
  };

  const handleSave = () => {
    if (!label.trim()) { toast.warning('Nom requis', 'Saisissez un nom pour la section.'); return; }
    onSave({ label: label.trim(), prefixes, isCharge });
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
        {parentLabel && (
          <p className="text-xs text-primary-500 italic">Sous-section de : <strong>{parentLabel}</strong></p>
        )}

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nom de la section</label>
          <input
            className="input mt-1 w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: Produits d'exploitation, Charges variables…"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Type</label>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              className={clsx(
                'flex-1 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all',
                !isCharge ? 'border-success bg-success/10 text-success' : 'border-primary-200 dark:border-primary-700 text-primary-500',
              )}
              onClick={() => setIsCharge(false)}
            >
              Produit (classe 7)
            </button>
            <button
              type="button"
              className={clsx(
                'flex-1 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all',
                isCharge ? 'border-error bg-error/10 text-error' : 'border-primary-200 dark:border-primary-700 text-primary-500',
              )}
              onClick={() => setIsCharge(true)}
            >
              Charge (classe 6)
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">
            Préfixes de comptes affectés ({prefixes.length})
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1 mb-2 min-h-[2rem]">
            {prefixes.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold num">
                {p}
                <button type="button" onClick={() => setPrefixes(prefixes.filter((x) => x !== p))} className="hover:text-error">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {prefixes.length === 0 && <span className="text-xs text-primary-400 italic">Aucun préfixe — la section sera vide.</span>}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={prefixInput}
              onChange={(e) => setPrefixInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addPrefix(prefixInput); setPrefixInput(''); }
              }}
              placeholder="ex: 70, 706, 7061…"
            />
            <button type="button" className="btn-outline" onClick={() => { addPrefix(prefixInput); setPrefixInput(''); }}>
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">
            Picker comptes du plan comptable
          </label>
          <div className="relative mt-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" />
            <input
              className="input w-full pl-9"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Rechercher un compte (ex: 706, ventes…)"
            />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto border border-primary-200 dark:border-primary-700 rounded-lg">
            {filteredAccounts.length === 0 ? (
              <p className="p-3 text-xs text-primary-400 italic text-center">Aucun compte trouvé</p>
            ) : (
              filteredAccounts.map((a) => {
                const matched = prefixes.some((p) => a.code.startsWith(p));
                return (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => { if (!prefixes.includes(a.code)) addPrefix(a.code); }}
                    className={clsx(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-primary-100 dark:hover:bg-primary-800 flex items-center gap-2 border-b border-primary-100/60 dark:border-primary-800/60 last:border-0',
                      matched && 'bg-accent/5',
                    )}
                  >
                    <span className="num font-semibold w-16 shrink-0">{a.code}</span>
                    <span className="flex-1 truncate text-primary-700 dark:text-primary-300">{a.label}</span>
                    {matched && <Check className="w-3 h-3 text-accent shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Confirm Modal
// ─────────────────────────────────────────────────────────────────────
function ConfirmModal({ open, onClose, onConfirm, title, message, danger }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button
            className={clsx(danger ? 'btn-primary !bg-error hover:!bg-error/90' : 'btn-primary')}
            onClick={() => { onConfirm(); onClose(); }}
          >
            Confirmer
          </button>
        </>
      }
    >
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

  // Modals
  const [editingSection, setEditingSection] = useState<{ section?: CRSectionNode; parentId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'section' | 'model' | 'intermediate'; id: string; label: string } | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  // Highlight de la dernière section ajoutée (visible 3s) + force-expand ancêtres
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [forceExpand, setForceExpand] = useState<Set<string>>(new Set());

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
    listCRAccounts(currentOrgId).then(setAccounts);
    db.gl.where('orgId').equals(currentOrgId).toArray()
      .then((entries) => setGlAccounts([...new Set(entries.map((e) => e.account))]));
  }, [currentOrgId]);

  // ── Validation temps réel ──
  useEffect(() => {
    if (!model) { setValidation(null); return; }
    setValidation(validateModel(model, glAccounts));
  }, [model, glAccounts]);

  // ── AUTO-SAVE : persiste chaque modification immédiatement ──
  // Évite la confusion brouillon/sauvegardé. L'utilisateur n'a plus à cliquer "Enregistrer".
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
    if (!validation.valid) {
      toast.warning('Corrigez les avertissements', 'Doublons ou comptes orphelins à régler avant publication.');
      return;
    }
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
    } else {
      toast.error('Suppression impossible', result.reason);
    }
  };

  const handleSaveSection = (data: { label: string; prefixes: string[]; isCharge: boolean }) => {
    if (!model || !editingSection) return;
    if (editingSection.section) {
      // Édition
      const updated = updateSection(model, editingSection.section.id, data);
      persistModel(updated);
      setLastAddedId(editingSection.section.id);
      toast.success('Section modifiée', data.label);
    } else {
      // Création — récupère l'id de la nouvelle section pour highlight + scroll
      const updated = addSection(model, data, editingSection.parentId);
      // La dernière section ajoutée est en fin de tableau
      const newSection = updated.sections[updated.sections.length - 1];
      persistModel(updated);
      setLastAddedId(newSection?.id ?? null);
      // Force-expand le parent et tous les ancêtres pour que la nouvelle section soit visible
      if (editingSection.parentId) {
        const ancestors = new Set<string>();
        let pid: string | undefined = editingSection.parentId;
        while (pid) {
          ancestors.add(pid);
          const parent = updated.sections.find((s) => s.id === pid);
          pid = parent?.parentId;
        }
        setForceExpand(ancestors);
      }
      toast.success(`Sous-section ajoutée à "${editingSection.parentId ? model.sections.find((s) => s.id === editingSection.parentId)?.label : 'racine'}"`, data.label);
      // Auto-scroll après le re-render
      setTimeout(() => {
        const el = document.getElementById(`section-row-${newSection?.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      // Le highlight disparaît après 3s
      setTimeout(() => setLastAddedId(null), 3000);
    }
    setEditingSection(null);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!model) return;
    const updated = removeSection(model, sectionId);
    persistModel(updated);
    toast.success('Section supprimée');
  };

  const handleAddIntermediate = () => {
    if (!model) return;
    const newInter: CRIntermediateNode = {
      id: `inter-${Date.now()}`,
      label: 'Nouveau sous-total',
      formula: '',
      format: 'currency',
      order: model.intermediates.length,
    };
    persistModel({ ...model, intermediates: [...model.intermediates, newInter] });
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
        subtitle={`${org.name} · Auto-sauvegarde — propagé à tous les dashboards et rapports`}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4" /> Historique
            </button>
            <button className="btn-outline" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="w-4 h-4" /> {previewMode ? 'Quitter aperçu' : 'Aperçu'}
            </button>
            <button className="btn-outline" onClick={() => { setDuplicateName(`${model?.name ?? 'Modèle'} (copie)`); setDuplicateModalOpen(true); }} disabled={!model}>
              <Copy className="w-4 h-4" /> Dupliquer
            </button>
            <button className="btn-primary" onClick={handlePublish} disabled={!model || !validation?.valid}>
              <CheckCircle2 className="w-4 h-4" /> Publier
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
              <><CheckCircle2 className="w-4 h-4 text-success" /><p className="text-sm font-semibold text-success">Modèle valide — prêt à publier</p></>
            ) : (
              <><AlertTriangle className="w-4 h-4 text-warning" /><p className="text-sm font-semibold text-warning">Avertissements de validation</p></>
            )}
          </div>
          {validation.warnings.length === 0 ? (
            <p className="text-xs text-primary-500">Aucun double comptage, aucun compte orphelin.</p>
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
                    <span className="num">{d.account}</span> dans : {d.sections.join(', ')}
                  </li>
                ))}
                {validation.duplicateAccounts.length > 5 && <li className="italic">…+ {validation.duplicateAccounts.length - 5} autre(s)</li>}
              </ul>
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
              Informations du modèle (auto-sauvegardé)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Nom</label>
                <input
                  className="input mt-1"
                  value={model.name}
                  onChange={(e) => handleUpdateModelField({ name: e.target.value })}
                  disabled={model.isDefault}
                  title={model.isDefault ? 'Le modèle SYSCOHADA par défaut ne peut pas être renommé. Dupliquez-le pour personnaliser.' : ''}
                />
              </div>
              <div>
                <label className="text-[11px] text-primary-500 font-semibold uppercase tracking-wider">Description</label>
                <input
                  className="input mt-1"
                  value={model.description ?? ''}
                  onChange={(e) => handleUpdateModelField({ description: e.target.value })}
                />
              </div>
            </div>
          </Card>

          {/* Sections */}
          <ChartCard
            title={`Sections (${model.sections.length})`}
            subtitle="Hiérarchie multi-niveaux · Cliquez sur une section pour la modifier"
            accent="rgb(var(--accent))"
          >
            <div className="flex justify-end mb-3">
              <button
                className="btn-primary"
                onClick={() => setEditingSection({ parentId: undefined })}
              >
                <Plus className="w-4 h-4" /> Ajouter une section
              </button>
            </div>

            {model.sections.length === 0 ? (
              <div className="py-12 text-center">
                <FolderTree className="w-12 h-12 text-primary-300 mx-auto mb-3" />
                <p className="text-sm text-primary-500 mb-3">Aucune section dans ce modèle.</p>
                <button className="btn-primary" onClick={() => setEditingSection({ parentId: undefined })}>
                  <Plus className="w-4 h-4" /> Créer la première section
                </button>
              </div>
            ) : (
              <SectionTree
                sections={model.sections}
                parentId={undefined}
                accounts={accounts}
                onEdit={(section) => setEditingSection({ section })}
                onAddChild={(parentId) => setEditingSection({ parentId })}
                onDelete={(section) => setConfirmDelete({ type: 'section', id: section.id, label: section.label })}
                lastAddedId={lastAddedId}
                forceExpand={forceExpand}
              />
            )}
          </ChartCard>

          {/* Intermédiaires & Formules */}
          <ChartCard title="Sous-totaux intermédiaires" subtitle="Résultats calculés automatiquement (Marge Brute, EBITDA, Résultat Net…)" accent="rgb(var(--accent))">
            <div className="space-y-2">
              {model.intermediates.map((it) => (
                <IntermediateEditor
                  key={it.id}
                  intermediate={it}
                  sections={model.sections}
                  onChange={(patch) => handleUpdateIntermediate(it.id, patch)}
                  onRemove={() => handleDeleteIntermediate(it.id)}
                />
              ))}
              <button
                className="w-full p-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-700 text-xs text-primary-500 hover:border-accent hover:text-accent transition-colors"
                onClick={handleAddIntermediate}
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Ajouter un sous-total intermédiaire
              </button>
            </div>
          </ChartCard>

          {/* Actions du modèle */}
          {!model.isDefault && (
            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Actions sur ce modèle</p>
                <p className="text-xs text-primary-500 mt-0.5">
                  {model.isActive ? 'Modèle actif — désactivez avant de supprimer.' : 'Modèle inactif — peut être supprimé.'}
                </p>
              </div>
              <button
                className="btn-outline text-error"
                disabled={model.isActive}
                onClick={() => setConfirmDelete({ type: 'model', id: model.id, label: model.name })}
              >
                <Trash2 className="w-4 h-4" /> Supprimer ce modèle
              </button>
            </Card>
          )}
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
          <li>• <strong>Auto-sauvegarde</strong> : chaque modification est persistée immédiatement.</li>
          <li>• Le modèle <strong>actif</strong> est consommé par tous les dashboards (KPIs, charts), tables CR (vues N/N-1, Budget vs Réalisé) et rapports/exports (PDF, Excel).</li>
          <li>• La validation détecte le double comptage et les comptes orphelins.</li>
          <li>• Les sous-totaux acceptent des formules : <code className="bg-primary-100 dark:bg-primary-800 px-1 rounded">produits_expl - charges_expl</code>.</li>
          <li>• Le modèle SYSCOHADA par défaut ne peut pas être supprimé mais peut être dupliqué.</li>
        </ul>
      </Card>

      {/* ─── Modals ─── */}
      <SectionEditModal
        open={!!editingSection}
        onClose={() => setEditingSection(null)}
        onSave={handleSaveSection}
        initial={editingSection?.section}
        accounts={accounts}
        parentLabel={editingSection?.parentId ? model?.sections.find((s) => s.id === editingSection.parentId)?.label : undefined}
      />

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          if (confirmDelete.type === 'section') handleDeleteSection(confirmDelete.id);
          else if (confirmDelete.type === 'model') handleDeleteModel();
        }}
        title={`Supprimer ${confirmDelete?.type === 'model' ? 'le modèle' : 'la section'}`}
        message={`Confirmer la suppression de "${confirmDelete?.label}" ${confirmDelete?.type === 'section' ? 'et toutes ses sous-sections' : ''} ? Cette action est irréversible.`}
        danger
      />

      <Modal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="Dupliquer ce modèle"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDuplicateModalOpen(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              <Copy className="w-4 h-4" /> Dupliquer
            </button>
          </>
        }
      >
        <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nom du nouveau modèle</label>
        <input
          className="input mt-1 w-full"
          value={duplicateName}
          onChange={(e) => setDuplicateName(e.target.value)}
          placeholder="ex: Vue Direction, Vue Investisseurs…"
          autoFocus
        />
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section Tree (récursif, avec boutons explicites)
// ─────────────────────────────────────────────────────────────────────

function SectionTree({ sections, parentId, accounts, onEdit, onAddChild, onDelete, lastAddedId, forceExpand }: {
  sections: CRSectionNode[];
  parentId?: string;
  accounts: { code: string; label: string; class: string }[];
  onEdit: (section: CRSectionNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (section: CRSectionNode) => void;
  lastAddedId?: string | null;
  forceExpand?: Set<string>;
}) {
  const children = sections.filter((s) => s.parentId === parentId).sort((a, b) => a.order - b.order);
  return (
    <div className={clsx('space-y-1.5', parentId && 'pl-6 border-l border-primary-200 dark:border-primary-700 ml-3')}>
      {children.map((s) => (
        <SectionRow
          key={s.id}
          section={s}
          allSections={sections}
          accounts={accounts}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          lastAddedId={lastAddedId}
          forceExpand={forceExpand}
        />
      ))}
    </div>
  );
}

function SectionRow({ section, allSections, accounts, onEdit, onAddChild, onDelete, lastAddedId, forceExpand }: {
  section: CRSectionNode;
  allSections: CRSectionNode[];
  accounts: { code: string; label: string; class: string }[];
  onEdit: (section: CRSectionNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (section: CRSectionNode) => void;
  lastAddedId?: string | null;
  forceExpand?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = allSections.some((s) => s.parentId === section.id);
  const matchingCount = useMemo(() =>
    accounts.filter((a) => section.prefixes.some((p) => a.code.startsWith(p))).length,
  [accounts, section.prefixes]);

  // Force-expand quand un descendant vient d'être ajouté
  useEffect(() => {
    if (forceExpand?.has(section.id)) setExpanded(true);
  }, [forceExpand, section.id]);

  const isHighlighted = lastAddedId === section.id;

  return (
    <div
      id={`section-row-${section.id}`}
      className={clsx(
        'rounded-xl border transition-all',
        isHighlighted
          ? 'border-accent ring-2 ring-accent/40 bg-accent/5 animate-pulse-soft'
          : 'border-primary-200 dark:border-primary-700 hover:border-accent/50',
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

        <div className={clsx(
          'shrink-0 w-2 h-2 rounded-full',
          section.isCharge ? 'bg-error' : 'bg-success',
        )} title={section.isCharge ? 'Charge' : 'Produit'} />

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{section.label}</p>
          <p className="text-[11px] text-primary-500 truncate">
            {section.prefixes.length > 0 ? (
              <>Préfixes : <span className="num">{section.prefixes.join(', ')}</span> · {matchingCount} compte(s)</>
            ) : (
              <span className="text-warning">⚠ Aucun préfixe affecté</span>
            )}
          </p>
        </div>

        <button
          className="btn-outline !py-1 !px-2 text-xs shrink-0"
          onClick={() => onEdit(section)}
          title="Modifier cette section"
        >
          <Edit2 className="w-3 h-3" /> Modifier
        </button>
        <button
          className="btn-outline !py-1 !px-2 text-xs shrink-0"
          onClick={() => onAddChild(section.id)}
          title="Ajouter une sous-section"
        >
          <Plus className="w-3 h-3" /> Sous-section
        </button>
        <button
          className="btn-outline !py-1 !px-2 text-xs text-error shrink-0"
          onClick={() => onDelete(section)}
          title="Supprimer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {expanded && hasChildren && (
        <div className="pb-2 pr-2">
          <SectionTree
            sections={allSections}
            parentId={section.id}
            accounts={accounts}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onDelete={onDelete}
            lastAddedId={lastAddedId}
            forceExpand={forceExpand}
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
        <button onClick={onRemove} className="text-primary-400 hover:text-error" title="Supprimer">
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
        <span className="text-primary-400 truncate">
          Variables : {sections.slice(0, 3).map((s) => s.id).join(', ')}{sections.length > 3 ? '…' : ''}
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
