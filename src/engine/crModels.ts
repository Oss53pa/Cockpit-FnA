/**
 * CR Models — Personnalisation du Compte de Résultat
 *
 * Architecture:
 *  - Modèle = ensemble cohérent de sections + sous-sections + intermédiaires + formules
 *  - Multi-modèles par société (Vue Direction, Vue Investisseurs, Vue Fiscale, etc.)
 *  - 1 modèle ACTIF par société à un instant T (les engines lisent l'actif)
 *  - Hiérarchie multi-niveaux : section → sous-section → comptes
 *  - Formules personnalisables : Section A − Section B, ratios, etc.
 *  - Audit trail : journal des modifications + preview avant publication
 *
 * Le module substitue progressivement le système localStorage de budgetActual.ts.
 * getSectionDefs(orgId) (point pivot) lit le modèle actif depuis Dexie.
 */
import { db } from '../db/schema';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface CRSectionNode {
  id: string;                    // unique dans le modèle
  parentId?: string;              // null si racine
  label: string;
  prefixes: string[];             // codes/sous-codes affectés (ex: ['70', '71'])
  accounts?: string[];            // comptes spécifiques explicitement attachés (override prefixes)
  isCharge: boolean;              // sens normal du solde (charge = débit, produit = crédit)
  order: number;                  // ordre d'affichage parmi les enfants du même parent
  collapsed?: boolean;            // état UI (replié)
}

export interface CRIntermediateNode {
  id: string;                    // ex: 'res_expl', 'ebitda', 'mb'
  label: string;
  /** Position dans le flux : id de la section APRÈS laquelle l'intermédiaire est calculé. */
  afterSectionId?: string;
  /** Formule en notation simple : références aux sections/intermédiaires + opérateurs.
   *  Ex: "produits_expl - charges_expl" ou "(ca - achats) / ca". */
  formula: string;
  /** 'currency' | 'percent' | 'ratio' — pilote l'affichage. */
  format?: 'currency' | 'percent' | 'ratio';
  order: number;
}

export interface CRFormula {
  id: string;
  label: string;
  expression: string;             // ex: "produits_expl - charges_expl"
  format?: 'currency' | 'percent' | 'ratio';
}

export interface CRModel {
  id: string;
  orgId: string;
  name: string;                   // 'Vue Direction', 'Vue Fiscale'…
  description?: string;
  isDefault: boolean;             // modèle par défaut SYSCOHADA — non supprimable
  isActive: boolean;              // 1 seul actif par orgId
  version: number;                // incrémenté à chaque publication
  status: 'draft' | 'published';  // draft = en cours d'édition, published = appliqué
  sections: CRSectionNode[];
  intermediates: CRIntermediateNode[];
  formulas: CRFormula[];
  createdAt: number;
  updatedAt: number;
  author?: string;                // userId
}

export interface CRModelHistoryEntry {
  id?: number;
  modelId: string;
  orgId: string;
  timestamp: number;
  author?: string;
  action: 'created' | 'updated' | 'published' | 'duplicated' | 'restored' | 'activated';
  diff?: string;                  // JSON diff serialisé
  previousVersion?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage (via Dexie)
// ═══════════════════════════════════════════════════════════════════════════

// On utilise localStorage pour la compatibilité immédiate (sans migration de schéma Dexie),
// avec une clé indexée par orgId. Les hooks d'écriture ajoutent le journal d'audit.
// Quand le projet sera prêt, on migrera vers Dexie via une nouvelle version().
const KEY_MODELS  = 'cockpit-cr-models';     // { [orgId]: CRModel[] }
const KEY_HISTORY = 'cockpit-cr-history';    // CRModelHistoryEntry[]

function loadAllModels(): Record<string, CRModel[]> {
  try {
    const raw = localStorage.getItem(KEY_MODELS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAllModels(data: Record<string, CRModel[]>) {
  try { localStorage.setItem(KEY_MODELS, JSON.stringify(data)); }
  catch (e) { console.warn('CR Models: quota localStorage atteint', e); }
}

function loadHistory(): CRModelHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entries: CRModelHistoryEntry[]) {
  // Limite à 500 entrées pour éviter explosion
  const trimmed = entries.slice(-500);
  try { localStorage.setItem(KEY_HISTORY, JSON.stringify(trimmed)); }
  catch { /* ignore */ }
}

function logHistory(entry: Omit<CRModelHistoryEntry, 'id' | 'timestamp'>) {
  const entries = loadHistory();
  entries.push({ ...entry, timestamp: Date.now() });
  saveHistory(entries);
}

// ═══════════════════════════════════════════════════════════════════════════
// Modèle par défaut SYSCOHADA (non supprimable, dupliquable)
// ═══════════════════════════════════════════════════════════════════════════

export function buildDefaultModel(orgId: string): CRModel {
  const now = Date.now();
  return {
    id: `default-${orgId}`,
    orgId,
    name: 'SYSCOHADA Standard',
    description: 'Modèle par défaut conforme SYSCOHADA révisé 2017',
    isDefault: true,
    isActive: true,
    version: 1,
    status: 'published',
    sections: [
      { id: 'produits_expl', label: "Produits d'exploitation",  prefixes: ['70','71','72','73','74','75','781','791'], isCharge: false, order: 0 },
      { id: 'charges_expl',  label: "Charges d'exploitation",   prefixes: ['60','61','62','63','64','65','66','681','691'], isCharge: true,  order: 1 },
      { id: 'produits_fin',  label: 'Produits financiers',       prefixes: ['77','786','797'], isCharge: false, order: 2 },
      { id: 'charges_fin',   label: 'Charges financières',       prefixes: ['67','687','697'], isCharge: true,  order: 3 },
      { id: 'produits_hao',  label: 'Produits exceptionnels',    prefixes: ['82','84','86','88'], isCharge: false, order: 4 },
      { id: 'charges_hao',   label: 'Charges exceptionnelles',   prefixes: ['81','83','85'], isCharge: true,  order: 5 },
      { id: 'impots',        label: 'Impôts sur les bénéfices',  prefixes: ['87','89'], isCharge: true,  order: 6 },
    ],
    intermediates: [
      { id: 'res_expl',    label: "Résultat d'exploitation",      afterSectionId: 'charges_expl', formula: 'produits_expl - charges_expl', format: 'currency', order: 0 },
      { id: 'res_fin',     label: 'Résultat financier',           afterSectionId: 'charges_fin',  formula: 'produits_fin - charges_fin',   format: 'currency', order: 1 },
      { id: 'res_courant', label: 'Résultat courant avant impôts', afterSectionId: 'charges_fin', formula: 'res_expl + res_fin',           format: 'currency', order: 2 },
      { id: 'res_except',  label: 'Résultat exceptionnel',        afterSectionId: 'charges_hao',  formula: 'produits_hao - charges_hao',   format: 'currency', order: 3 },
      { id: 'res_net',     label: "Résultat net de l'exercice",   afterSectionId: 'impots',       formula: 'res_courant + res_except - impots', format: 'currency', order: 4 },
    ],
    formulas: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD modèles
// ═══════════════════════════════════════════════════════════════════════════

export function listModels(orgId: string): CRModel[] {
  const all = loadAllModels();
  let models = all[orgId] ?? [];
  // Garantit qu'il existe toujours un modèle par défaut
  if (!models.find((m) => m.isDefault)) {
    const def = buildDefaultModel(orgId);
    models = [def, ...models];
    all[orgId] = models;
    saveAllModels(all);
  }
  // Garantit qu'il y a toujours exactement 1 actif (le défaut si aucun)
  if (!models.find((m) => m.isActive)) {
    const def = models.find((m) => m.isDefault);
    if (def) {
      def.isActive = true;
      all[orgId] = models;
      saveAllModels(all);
    }
  }
  return models;
}

export function getActiveModel(orgId: string): CRModel {
  const models = listModels(orgId);
  return models.find((m) => m.isActive) ?? models.find((m) => m.isDefault) ?? buildDefaultModel(orgId);
}

export function getModel(orgId: string, modelId: string): CRModel | null {
  return listModels(orgId).find((m) => m.id === modelId) ?? null;
}

export function saveModel(model: CRModel, author?: string): CRModel {
  const all = loadAllModels();
  const list = all[model.orgId] ?? [];
  const idx = list.findIndex((m) => m.id === model.id);
  const now = Date.now();
  const updated: CRModel = { ...model, updatedAt: now, author: author ?? model.author };
  if (idx === -1) {
    list.push(updated);
    logHistory({ modelId: updated.id, orgId: updated.orgId, action: 'created', author });
  } else {
    list[idx] = updated;
    logHistory({ modelId: updated.id, orgId: updated.orgId, action: 'updated', author });
  }
  all[model.orgId] = list;
  saveAllModels(all);
  return updated;
}

export function publishModel(orgId: string, modelId: string, author?: string): CRModel | null {
  const all = loadAllModels();
  const list = all[orgId] ?? [];
  const idx = list.findIndex((m) => m.id === modelId);
  if (idx === -1) return null;
  list[idx].status = 'published';
  list[idx].version += 1;
  list[idx].updatedAt = Date.now();
  all[orgId] = list;
  saveAllModels(all);
  logHistory({ modelId, orgId, action: 'published', author, previousVersion: list[idx].version - 1 });
  return list[idx];
}

export function activateModel(orgId: string, modelId: string, author?: string): boolean {
  const all = loadAllModels();
  const list = all[orgId] ?? [];
  const target = list.find((m) => m.id === modelId);
  if (!target) return false;
  for (const m of list) m.isActive = m.id === modelId;
  all[orgId] = list;
  saveAllModels(all);
  logHistory({ modelId, orgId, action: 'activated', author });
  return true;
}

export function duplicateModel(orgId: string, sourceId: string, newName: string, author?: string): CRModel | null {
  const source = getModel(orgId, sourceId);
  if (!source) return null;
  const now = Date.now();
  const dup: CRModel = {
    ...JSON.parse(JSON.stringify(source)),
    id: `model-${now}-${Math.random().toString(36).slice(2, 6)}`,
    name: newName,
    isDefault: false,       // un duplicata n'est jamais le défaut
    isActive: false,
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    author,
  };
  const all = loadAllModels();
  const list = all[orgId] ?? [];
  list.push(dup);
  all[orgId] = list;
  saveAllModels(all);
  logHistory({ modelId: dup.id, orgId, action: 'duplicated', author });
  return dup;
}

export function deleteModel(orgId: string, modelId: string): { success: boolean; reason?: string } {
  const all = loadAllModels();
  const list = all[orgId] ?? [];
  const target = list.find((m) => m.id === modelId);
  if (!target) return { success: false, reason: 'Modèle introuvable.' };
  if (target.isDefault) return { success: false, reason: 'Le modèle par défaut SYSCOHADA ne peut pas être supprimé. Vous pouvez le dupliquer.' };
  if (target.isActive) return { success: false, reason: 'Activez un autre modèle avant de supprimer celui-ci.' };
  all[orgId] = list.filter((m) => m.id !== modelId);
  saveAllModels(all);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Manipulation de la hiérarchie
// ═══════════════════════════════════════════════════════════════════════════

export function addSection(model: CRModel, section: Omit<CRSectionNode, 'id' | 'order'>, parentId?: string): CRModel {
  const id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const siblings = model.sections.filter((s) => s.parentId === parentId);
  const order = siblings.length;
  return { ...model, sections: [...model.sections, { ...section, id, parentId, order }] };
}

export function updateSection(model: CRModel, sectionId: string, patch: Partial<CRSectionNode>): CRModel {
  return { ...model, sections: model.sections.map((s) => s.id === sectionId ? { ...s, ...patch } : s) };
}

export function removeSection(model: CRModel, sectionId: string): CRModel {
  // Cascade : supprime les sous-sections aussi
  const toDelete = new Set([sectionId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of model.sections) if (s.parentId && toDelete.has(s.parentId) && !toDelete.has(s.id)) { toDelete.add(s.id); added = true; }
  }
  return { ...model, sections: model.sections.filter((s) => !toDelete.has(s.id)) };
}

export function moveSection(model: CRModel, sectionId: string, newParentId: string | undefined, newOrder: number): CRModel {
  const sections = model.sections.map((s) => {
    if (s.id === sectionId) return { ...s, parentId: newParentId, order: newOrder };
    return s;
  });
  // Renormalise les ordres dans le parent cible
  const siblings = sections.filter((s) => s.parentId === newParentId).sort((a, b) => a.order - b.order);
  siblings.forEach((s, i) => { s.order = i; });
  return { ...model, sections };
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation : anti-double comptage + détection orphelins
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationReport {
  valid: boolean;
  duplicateAccounts: { account: string; sections: string[] }[];
  orphanAccounts: string[];     // comptes du Grand Livre non couverts par aucune section
  emptyPrefixes: string[];      // sections sans prefixes ni accounts
  warnings: string[];
}

/**
 * Vérifie la cohérence du modèle :
 *  - Aucun compte affecté à 2 sections différentes (anti-double comptage)
 *  - Tous les comptes du Grand Livre sont rattachés à une section
 *  - Sections vides (warning)
 */
export function validateModel(model: CRModel, accountsFromGL: string[] = []): ValidationReport {
  const sectionByAccount = new Map<string, string[]>();
  const isCRAccount = (acc: string) => /^[6-8]/.test(acc); // classes 6, 7, 8 (CR + HAO)

  for (const sec of model.sections) {
    // Comptes explicites
    for (const acc of sec.accounts ?? []) {
      const list = sectionByAccount.get(acc) ?? [];
      list.push(sec.id);
      sectionByAccount.set(acc, list);
    }
    // Comptes via préfixes — on vérifie sur la base GL
    for (const acc of accountsFromGL.filter(isCRAccount)) {
      if (sec.prefixes.some((p) => acc.startsWith(p))) {
        const list = sectionByAccount.get(acc) ?? [];
        if (!list.includes(sec.id)) list.push(sec.id);
        sectionByAccount.set(acc, list);
      }
    }
  }

  const duplicateAccounts: ValidationReport['duplicateAccounts'] = [];
  for (const [acc, sections] of sectionByAccount) {
    if (sections.length > 1) duplicateAccounts.push({ account: acc, sections });
  }

  const covered = new Set(sectionByAccount.keys());
  const orphanAccounts = accountsFromGL.filter((acc) => isCRAccount(acc) && !covered.has(acc));

  const emptyPrefixes = model.sections.filter((s) => s.prefixes.length === 0 && (!s.accounts || s.accounts.length === 0)).map((s) => s.id);

  const warnings: string[] = [];
  if (duplicateAccounts.length > 0) warnings.push(`${duplicateAccounts.length} compte(s) en double comptage — risque de surévaluation des totaux.`);
  if (orphanAccounts.length > 0) warnings.push(`${orphanAccounts.length} compte(s) GL non rattaché(s) à une section — risque de sous-évaluation.`);
  if (emptyPrefixes.length > 0) warnings.push(`${emptyPrefixes.length} section(s) vide(s) — aucun compte ne sera agrégé.`);

  return {
    valid: duplicateAccounts.length === 0 && orphanAccounts.length === 0,
    duplicateAccounts, orphanAccounts, emptyPrefixes, warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Évaluation de formules personnalisées
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Évalue une formule à partir d'un dictionnaire de valeurs par identifiant.
 * Supporte : + - * / ( ), parenthèses, références aux sections/intermédiaires.
 * Sécurisé : pas d'eval natif, parser personnalisé.
 *
 * Exemples :
 *   "produits_expl - charges_expl"
 *   "(ca - achats) / ca"
 *   "res_expl + res_fin"
 */
export function evaluateFormula(expression: string, values: Record<string, number>): number {
  // Tokenize
  const tokens: { type: 'num' | 'op' | 'paren' | 'id'; value: string | number }[] = [];
  let i = 0;
  const expr = expression.replace(/\s+/g, '');
  while (i < expr.length) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      let n = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) n += expr[i++];
      tokens.push({ type: 'num', value: parseFloat(n) });
    } else if (/[a-zA-Z_]/.test(c)) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) id += expr[i++];
      tokens.push({ type: 'id', value: id });
    } else if ('+-*/'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
    } else if ('()'.includes(c)) {
      tokens.push({ type: 'paren', value: c });
      i++;
    } else {
      i++; // skip unknown
    }
  }

  // Recursive descent parser : expr = term (+|- term)*; term = factor (*|/ factor)*
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseFactor(): number {
    const t = consume();
    if (!t) return 0;
    if (t.type === 'num') return t.value as number;
    if (t.type === 'id') return values[t.value as string] ?? 0;
    if (t.type === 'op' && t.value === '-') return -parseFactor(); // unary minus
    if (t.type === 'op' && t.value === '+') return parseFactor();  // unary plus
    if (t.type === 'paren' && t.value === '(') {
      const v = parseExpr();
      consume(); // consume ')'
      return v;
    }
    return 0;
  }
  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.type === 'op' && ['*', '/'].includes(peek()!.value as string)) {
      const op = consume();
      const right = parseFactor();
      left = op.value === '*' ? left * right : (right === 0 ? 0 : left / right);
    }
    return left;
  }
  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && ['+', '-'].includes(peek()!.value as string)) {
      const op = consume();
      const right = parseTerm();
      left = op.value === '+' ? left + right : left - right;
    }
    return left;
  }

  return parseExpr();
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversion vers le format consommé par les engines (compat budgetActual.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convertit le modèle actif au format Record<sectionId, { label, prefixes, isCharge }>
 * consommé par getSectionDefs(). Permet la transition transparente.
 */
export function modelToSectionDefs(model: CRModel): Record<string, { label: string; prefixes: string[]; isCharge: boolean }> {
  const out: Record<string, { label: string; prefixes: string[]; isCharge: boolean }> = {};
  // On aplatit la hiérarchie : seules les sections feuilles (sans enfants) sont des
  // sections de comptes ; les nœuds intermédiaires servent à l'organisation visuelle.
  // Pour préserver la rétro-compat, on émet TOUTES les sections — les engines actuels
  // somment les comptes par préfixe sans se soucier de la hiérarchie.
  for (const sec of model.sections) {
    out[sec.id] = { label: sec.label, prefixes: sec.prefixes, isCharge: sec.isCharge };
  }
  return out;
}

export function modelToOrder(model: CRModel): string[] {
  // Ordre topologique : racines d'abord, puis enfants sous chaque racine (DFS)
  const byParent = new Map<string | undefined, CRSectionNode[]>();
  for (const s of model.sections) {
    const k = s.parentId ?? undefined;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(s);
  }
  for (const [, list] of byParent) list.sort((a, b) => a.order - b.order);
  const out: string[] = [];
  function walk(parentId: string | undefined) {
    for (const s of byParent.get(parentId) ?? []) {
      out.push(s.id);
      walk(s.id);
    }
  }
  walk(undefined);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit trail (lecture)
// ═══════════════════════════════════════════════════════════════════════════

export function getModelHistory(orgId: string, modelId?: string): CRModelHistoryEntry[] {
  const all = loadHistory();
  return all
    .filter((e) => e.orgId === orgId && (!modelId || e.modelId === modelId))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ═══════════════════════════════════════════════════════════════════════════
// Migration depuis l'ancien système localStorage de budgetActual.ts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Migre les sections custom + labels + ordre depuis l'ancien localStorage
 * (budgetActual.ts) vers un nouveau modèle CR. Idempotent — on ne migre qu'une
 * fois grâce au flag de sentinelle.
 */
export function migrateLegacySettings(orgId: string): boolean {
  const sentinel = `cockpit-cr-migrated:${orgId}`;
  if (localStorage.getItem(sentinel)) return false;

  try {
    const customRaw = localStorage.getItem(`cr-section-custom:${orgId}`);
    const labelsRaw = localStorage.getItem(`cr-section-labels:${orgId}`);
    const orderRaw = localStorage.getItem(`cr-section-order:${orgId}`);
    if (!customRaw && !labelsRaw && !orderRaw) {
      // Rien à migrer
      localStorage.setItem(sentinel, '1');
      return false;
    }

    const customSections: { id: string; label: string; prefixes: string[]; isCharge: boolean }[] = customRaw ? JSON.parse(customRaw) : [];
    const labels: Record<string, string> = labelsRaw ? JSON.parse(labelsRaw) : {};
    const order: string[] = orderRaw ? JSON.parse(orderRaw) : [];

    if (customSections.length === 0 && Object.keys(labels).length === 0) {
      localStorage.setItem(sentinel, '1');
      return false;
    }

    // Crée un modèle "Migré depuis ancien système" basé sur le défaut + ajustements
    const base = buildDefaultModel(orgId);
    base.id = `legacy-${orgId}-${Date.now()}`;
    base.name = 'Modèle migré (ancien système)';
    base.isDefault = false;
    base.isActive = false;

    // Applique les labels custom
    for (const sec of base.sections) {
      if (labels[sec.id]) sec.label = labels[sec.id];
    }
    // Ajoute les sections custom
    let nextOrder = base.sections.length;
    for (const c of customSections) {
      base.sections.push({
        id: c.id, label: c.label, prefixes: c.prefixes,
        isCharge: c.isCharge, order: nextOrder++,
      });
    }
    // Réordonne selon l'ordre stocké
    if (order.length > 0) {
      base.sections.sort((a, b) => {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        if (ia === -1 && ib === -1) return a.order - b.order;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
      base.sections.forEach((s, i) => { s.order = i; });
    }

    saveModel(base);
    localStorage.setItem(sentinel, '1');
    return true;
  } catch (e) {
    console.warn('CR Models: migration legacy échouée', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Récupération des comptes du Grand Livre (helper pour l'éditeur)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Liste les comptes de classe 6/7/8 effectivement utilisés par la société dans le GL.
 * Utilisé par l'éditeur pour proposer un picker de comptes pertinent.
 */
export async function listCRAccounts(orgId: string): Promise<{ code: string; label: string; class: string }[]> {
  const accounts = await db.accounts.where('orgId').equals(orgId).toArray();
  const crAccounts = accounts
    .filter((a) => /^[6-8]/.test(a.code))
    .sort((a, b) => a.code.localeCompare(b.code));
  return crAccounts.map((a) => ({ code: a.code, label: a.label, class: a.class || a.code[0] }));
}
