# REPORTING_STANDARD.md — Standard d'architecture du module Reporting

> **Statut : Normatif.** Ce document décrit le module de Reporting de *Cockpit FnA*
> comme **modèle de référence réutilisable** pour toutes les applications de l'écosystème
> (Atlas Studio / Proph3t). Il sert à deux choses :
>
> 1. **Spécification (le « QUOI »)** — les contrats de données, l'architecture et les
>    règles que **toute** implémentation du module DOIT respecter.
> 2. **Guide d'implémentation pas-à-pas (le « COMMENT »)** — comment greffer ce module
>    sur une nouvelle application, depuis zéro.
>
> **Mode d'emploi :** copier ce fichier à la racine de chaque nouveau dépôt, puis suivre
> la partie 12 (« Guide d'implémentation »). La partie 11 (« Checklist de conformité »)
> permet d'auditer une application existante.

**Version :** 1.0 · **Stack cible imposée :** identique à Cockpit FnA (voir §3).
**Convention de langage :** les mots-clés **DOIT / NE DOIT PAS / DEVRAIT / PEUT** ont la
valeur RFC 2119.

---

## Table des matières

1. [Objet et périmètre](#1-objet-et-périmètre)
2. [Principes directeurs](#2-principes-directeurs)
3. [Stack imposée](#3-stack-imposée)
4. [Architecture de référence (arborescence)](#4-architecture-de-référence-arborescence)
5. [Contrats de données (normatifs)](#5-contrats-de-données-normatifs)
6. [Le moteur de rendu](#6-le-moteur-de-rendu)
7. [Le catalogue (sources de contenu)](#7-le-catalogue-sources-de-contenu)
8. [Persistance & multi-tenant](#8-persistance--multi-tenant)
9. [Couche IA — auto-commentaire (optionnelle)](#9-couche-ia--auto-commentaire-optionnelle)
10. [Conventions UI & impression](#10-conventions-ui--impression)
11. [Checklist de conformité](#11-checklist-de-conformité)
12. [Guide d'implémentation pas-à-pas](#12-guide-dimplémentation-pas-à-pas)
13. [Adapter le standard hors du domaine financier](#13-adapter-le-standard-hors-du-domaine-financier)

---

## 1. Objet et périmètre

Le module Reporting permet à un utilisateur métier de **composer, prévisualiser, exporter
et diffuser** des rapports professionnels (PDF A4 portrait/paysage, PowerPoint) à partir
de **blocs réutilisables**, sans écrire de code. Il repose sur 6 piliers indissociables :

| Pilier | Rôle |
|---|---|
| **Modèle par blocs** | Un rapport = une liste ordonnée de blocs typés (`ReportConfig.blocks`). |
| **Moteur de rendu** | Transforme les blocs en PDF (jsPDF) ou PPTX (pptxgenjs). |
| **Éditeur 3 colonnes** | Édition de blocs · visualiseur A4 · récapitulatif. |
| **Catalogue** | Déclare les *sources* de contenu (tables, dashboards) et les *modèles rapides*. |
| **Persistance multi-tenant** | Rapports & modèles stockés par `orgId` via `dataProvider`. |
| **Couche IA** | Auto-commentaire des sections (optionnel). |

**Ce qui est dans le périmètre normatif :** les contrats de données, l'abstraction de
persistance, le système de thème (palettes), le pipeline d'export, la structure de
l'éditeur, les règles d'or.

**Ce qui est spécifique à chaque application :** le *contenu* du catalogue (quelles tables /
dashboards existent) et la *forme* de `ReportData` (les données métier injectées). Le §13
explique comment généraliser au-delà de la finance SYSCOHADA.

---

## 2. Principes directeurs

1. **Tout est bloc.** Un rapport est une donnée sérialisable (`ReportConfig`), jamais du
   JSX figé. Ajouter un type de contenu = ajouter une variante à l'union `Block` + un
   `case` dans chaque builder. **Aucun** rapport ne DOIT être codé en dur.
2. **Le rapport est portable.** `ReportConfig` est sérialisé en JSON dans `ReportDoc.content`.
   Un rapport sauvegardé DOIT pouvoir être rechargé à l'identique, et un *modèle* DOIT
   pouvoir être appliqué à une autre période/société.
3. **Séparation moteur / données.** Les builders ne connaissent QUE `ReportConfig` +
   `ReportData`. Ils NE DOIVENT PAS appeler la base ni les hooks. Toute donnée arrive par
   `ReportData`.
4. **Multi-tenant strict.** Toute lecture/écriture passe par `dataProvider`, filtrée par
   `orgId`. Aucun `org_id` codé en dur.
5. **Thémable.** Les couleurs viennent TOUJOURS d'une palette (`PALETTES`), jamais d'un hex
   en dur dans un builder ou un composant de rendu.
6. **Multi-format natif.** Le même `ReportConfig` produit PDF portrait, PDF paysage et PPTX.
   Un nouveau bloc DEVRAIT être géré par tous les builders (au minimum dégradé proprement).
7. **Conditionnel.** Les sections sans données (ex. stocks absents, pas d'analytique) DOIVENT
   être retirables automatiquement (`filterConditionalBlocks`).
8. **localStorage protégé.** Toute préférence locale passe par `safeLocalStorage`.

---

## 3. Stack imposée

Identique à Cockpit FnA — **aucune divergence** sans décision d'architecture explicite.

- **Frontend** : React 18 + TypeScript strict + Vite 5 + Tailwind 3
- **State** : Zustand (`src/store/`) + hooks custom (`src/hooks/`)
- **Backend** : Supabase (Postgres + Auth + RLS), via `dataProvider`
- **PDF** : `jspdf` + `jspdf-autotable`
- **PPTX** : `pptxgenjs`
- **Téléchargement** : `file-saver`
- **Icônes** : `lucide-react` · **Classes conditionnelles** : `clsx`

```bash
npm i jspdf jspdf-autotable pptxgenjs file-saver lucide-react clsx
npm i -D @types/file-saver
```

---

## 4. Architecture de référence (arborescence)

Toute application conforme DOIT reproduire cette arborescence (les noms de fichiers sont
normatifs ; ils servent de repères communs entre projets) :

```
src/
├── engine/
│   ├── reportBlocks.ts          # ★ CŒUR : types Block/ReportConfig/ReportData,
│   │                            #   PALETTES, buildPDFFromBlocks, buildPPTXFromBlocks
│   └── <domaine>/               # IA optionnelle (ex. proph3/reportCommentator.ts)
├── pages/
│   ├── Reports.tsx              # Point d'entrée routé (<500 LOC) — orchestration
│   └── Reports/
│       ├── reportData.ts        # TABLE_CATALOG, DASHBOARD_CATALOG, QUICK_TEMPLATES,
│       │                        #   computeKPIs, filterConditionalBlocks, uid
│       ├── renderPages.tsx      # Visualiseur A4 (simulation écran + pagination)
│       ├── PageComponents.tsx   # PageA4, CoverPage, TocPage, BackCoverPage
│       ├── BlockComponents.tsx  # DraggableBlock, InsertHere (drag & drop)
│       ├── BlockPreviews.tsx    # Rendu écran de chaque type de bloc
│       ├── DashboardSnippet.tsx # Rendu d'un bloc « dashboard » dans le visualiseur
│       └── Modals.tsx           # SendModal, SaveModal, LoadModal, CatalogModal,
│                                #   ReportJournalModal, Field, Stat, LogoUpload
├── db/
│   ├── provider.ts              # Interface DataProvider (getReports/upsertReport/…)
│   ├── supabaseProvider.ts      # Implémentation Supabase
│   ├── demoProvider.ts          # Interception mode démo (no-op writes)
│   └── schema.ts                # ReportDoc, ReportTemplate
└── lib/
    └── safeStorage.ts           # safeLocalStorage
```

**Règle des 500 LOC :** `Reports.tsx` orchestre uniquement ; toute logique va dans les
sous-modules `Reports/` ou dans `engine/`.

---

## 5. Contrats de données (normatifs)

Ces types sont **le standard**. Ils DOIVENT être repris **verbatim** (seul `ReportData`
est adaptable au domaine — voir §13). Source de vérité : `src/engine/reportBlocks.ts`.

### 5.1 Les blocs

```ts
export type BlockType =
  | 'h1' | 'h2' | 'h3' | 'paragraph' | 'kpi'
  | 'table' | 'dashboard' | 'pageBreak' | 'image' | 'spacer';

export type BlockBase = {
  id: string;                 // uid() — unique, stable
  type: BlockType;
  inToc?: boolean;            // h1/h2/h3 : inclure dans le sommaire (défaut: true)
};

export type BlockH         = BlockBase & { type: 'h1' | 'h2' | 'h3'; text: string };
export type BlockParagraph = BlockBase & { type: 'paragraph'; text: string };
export type BlockKpi       = BlockBase & { type: 'kpi'; items: Array<{ label: string; value: string; subValue?: string }> };
export type BlockTable     = BlockBase & { type: 'table'; title?: string; source: string; limit?: number };
export type BlockDashboard = BlockBase & { type: 'dashboard'; dashboardId: string; title?: string };
export type BlockPageBreak = BlockBase & { type: 'pageBreak' };
export type BlockImage     = BlockBase & { type: 'image'; dataUrl: string; caption?: string };
export type BlockSpacer    = BlockBase & { type: 'spacer'; height?: number };

export type Block =
  | BlockH | BlockParagraph | BlockKpi | BlockTable
  | BlockDashboard | BlockPageBreak | BlockImage | BlockSpacer;
```

- `table.source` est une **clé** du `TABLE_CATALOG` (résolue en données par le builder).
- `dashboard.dashboardId` est une **clé** du `DASHBOARD_CATALOG`.
- Chaque `id` DOIT être généré par `uid()` et rester stable (clé React + ré-ordonnancement).

### 5.2 La configuration d'un rapport

```ts
export type ReportConfig = {
  identity: {
    title: string;
    subtitle: string;
    period: string;
    periodFrom?: string;        // YYYY-MM-DD
    periodTo?: string;          // YYYY-MM-DD
    author: string;
    confidentiality: 'public' | 'interne' | 'confidentiel' | 'strict';
    logoDataUrl?: string;
    coverBgColor?: string;
    coverBgImageUrl?: string;
    coverBgOpacity?: number;    // défaut 0.15
    titleColor?: string;        // défaut palette.primary
    subtitleColor?: string;
    coverStyle?: 'classic' | 'modern' | 'banner';
  };
  format: 'A4_portrait' | 'A4_landscape' | 'pptx';
  palette: PaletteKey;
  options: {
    includeCover: boolean;
    includeTOC: boolean;
    includeFooter: boolean;
    includePageNumbers: boolean;
  };
  blocks: Block[];
  recipients: string[];
};

export const DEFAULT_CONFIG = (period: string): ReportConfig => ({
  identity: {
    title: 'Rapport mensuel de gestion',
    subtitle: 'Analyse de performance',
    period,
    author: 'Direction',
    confidentiality: 'interne',
  },
  format: 'A4_portrait',
  palette: 'cockpit',
  options: { includeCover: true, includeTOC: true, includeFooter: true, includePageNumbers: true },
  blocks: [],
  recipients: [],
});
```

> **Invariant de portabilité :** `ReportConfig` DOIT être **100 % sérialisable en JSON**
> (aucune fonction, aucune ref DOM, aucune `Date` vivante). C'est ce qui est stocké dans
> `ReportDoc.content`.

### 5.3 Les palettes (thème)

Le rendu NE DOIT JAMAIS coder une couleur en dur : il lit `PALETTES[config.palette]`.
Une palette définit `primary / secondary / accent / success / danger / neutral /
tableHeader / tableHeaderText / chartColors[]`. La palette par défaut DOIT s'appeler
`cockpit` (identité de marque graphite + sage + terracotta).

```ts
export type PaletteKey = string;
export const PALETTES: Record<string, {
  name: string; primary: string; secondary: string; accent: string;
  success: string; danger: string; neutral: string;
  tableHeader: string; tableHeaderText: string; chartColors: string[];
}> = {
  cockpit: { name: 'Cockpit', primary: '#171717', secondary: '#404040', accent: '#7FA88E',
    success: '#7FA88E', danger: '#C97A5A', neutral: '#737373',
    tableHeader: '#171717', tableHeaderText: '#FAFAFA',
    chartColors: ['#7FA88E','#C97A5A','#5E8772','#D4A574','#737373','#B5C4A8','#A3A3A3'] },
  // … autres palettes (atlas, graphite, ardoise, marine, foret, sable, bordeaux, acier, aubergine)
};
```

### 5.4 Les données métier injectées

`ReportData` est le **seul** canal par lequel les chiffres entrent dans le moteur. C'est la
**frontière** entre le squelette agnostique (normatif) et le domaine (adaptable).

```ts
// Forme Cockpit FnA (finance SYSCOHADA) — à adapter par application (cf. §13)
export type ReportData = {
  bilanActif: Line[];
  bilanPassif: Line[];
  cr: Line[];
  sig: any;
  balance: BalanceRow[];
  ratios: Ratio[];
  tft?: Line[];
  capital?: any[];
  budgetActual?: Array<{ code: string; label: string; realise: number; budget: number; ecart: number; ecartPct?: number; status: string }>;
};
```

### 5.5 Le document persisté

```ts
// src/db/schema.ts
export type ReportDoc = {
  id?: number;
  orgId: string;                                       // multi-tenant
  title: string;
  type: string;                                        // 'report'
  author: string;
  status: 'draft' | 'review' | 'approved' | 'diffused';
  createdAt: number;
  updatedAt: number;
  content?: string;                                    // JSON.stringify(ReportConfig)
};

// ReportTemplate : même principe, `config` = JSON.stringify(ReportConfig) réutilisable.
```

---

## 6. Le moteur de rendu

Deux fonctions pures dans `engine/reportBlocks.ts`. Signatures **normatives** :

```ts
export function buildPDFFromBlocks(
  config: ReportConfig, data: ReportData, orgName: string, orgSub?: string,
): jsPDF;

export async function buildPPTXFromBlocks(
  config: ReportConfig, data: ReportData, orgName: string,
): Promise<Blob>;
```

**Contrat des builders :**

- Ils sont **purs** : entrée = `(config, data, orgName)`, sortie = document. Aucun effet de
  bord, aucun accès réseau/base.
- Ils itèrent `config.blocks` dans l'ordre et produisent : **couverture** (si `includeCover`),
  **sommaire** (si `includeTOC`, rempli après coup à partir des `h1/h2/h3` avec `inToc`),
  **en-têtes/pieds** (société · titre · période · pagination · mention de confidentialité).
- La couleur d'en-tête de table vient de `palette.tableHeader` / `tableHeaderText`.
- Pour `table`/`dashboard`, le builder résout `source`/`dashboardId` vers des données issues
  **uniquement** de `data`. Une source inconnue DOIT dégrader proprement (table vide, pas de
  crash).
- La pagination automatique (`ensureSpace`, `startNewContentPage`) garantit qu'aucun bloc ne
  déborde de la page.

**Déclenchement (PDF via impression navigateur) :** le rendu écran A4 (`renderPages`) est
fidèle au PDF ; le PDF portrait/paysage est produit par `window.print()` + CSS `@page`. Le
PPTX est produit par `buildPPTXFromBlocks` puis `saveAs(blob, ...)`. (`buildPDFFromBlocks`
reste disponible pour une génération PDF programmatique côté client.)

> **Règle d'extension :** ajouter un type de bloc = (1) étendre l'union `Block`, (2) ajouter
> le `case` dans `buildPDFFromBlocks`, (3) dans `buildPPTXFromBlocks`, (4) dans le
> visualiseur (`BlockPreviews.tsx`). Les 4 points DOIVENT être traités ensemble.

---

## 7. Le catalogue (sources de contenu)

Fichier `pages/Reports/reportData.ts`. C'est **ici** que chaque application déclare son
contenu métier. Trois registres :

### 7.1 `TABLE_CATALOG`
Liste des sources de tables sélectionnables. Chaque entrée = `{ v, label, cat, desc }`
où `v` est la clé utilisée dans `BlockTable.source` et résolue par le builder.

```ts
export const TABLE_CATALOG = [
  { v: 'bilan_actif', label: 'Bilan — Actif', cat: 'États', desc: '…' },
  { v: 'ratios',      label: 'Ratios financiers', cat: 'Analyse', desc: '…' },
  // …
];
```

### 7.2 `DASHBOARD_CATALOG`
Liste des dashboards insérables = `{ id, name, cat, desc }`, `id` ↔ `BlockDashboard.dashboardId`.
Ce catalogue DEVRAIT rester synchronisé avec le catalogue de dashboards de l'app.

### 7.3 `QUICK_TEMPLATES`
Fonctions qui génèrent une liste de blocs prête à l'emploi (un rapport « clé en main »).
Signature normative : `(data?) => Block[]`. Chaque template construit ses blocs via `uid()`.

```ts
export const QUICK_TEMPLATES: Record<string, (data?: any) => Block[]> = {
  monthly: (data) => {
    const k = computeKPIs(data);
    return [
      { id: uid(), type: 'h1', text: '1. Synthèse exécutive', inToc: true },
      { id: uid(), type: 'kpi', items: [{ label: "CA", value: k.ca }, /* … */] },
      { id: uid(), type: 'table', source: 'cr', title: 'Compte de résultat' },
      { id: uid(), type: 'pageBreak' },
      // …
    ];
  },
  // weekly, quarterly, annual, interim, cfo, bank, audit, …
};
```

### 7.4 Helpers normatifs

```ts
export function uid() { return Math.random().toString(36).substring(2, 11); }

// Retire automatiquement les sections (entre 2 pageBreak) dont les données sont absentes.
export function filterConditionalBlocks(blocks: Block[], data: any): Block[];

// Pré-calcule les KPIs affichables (chaînes formatées) à partir de `data`.
export const computeKPIs = (data: any): Record<string, string>;
```

`filterConditionalBlocks` DOIT être appelé à chaque application de template, pour qu'un
rapport ne contienne jamais une section vide (ex. « Stocks » si l'entité n'a pas de stocks).

---

## 8. Persistance & multi-tenant

### 8.1 Interface obligatoire (`db/provider.ts`)

```ts
getReports(orgId: string): Promise<ReportDoc[]>;
getReport(id: number): Promise<ReportDoc | undefined>;
upsertReport(doc: Omit<ReportDoc, 'id'> & { id?: number }): Promise<number>;
deleteReport(id: number): Promise<void>;
getTemplates(orgId: string): Promise<ReportTemplate[]>;
```

### 8.2 Règles

- **Jamais** `supabase.from(...)` dans `Reports.tsx` ou un composant. **Toujours**
  `dataProvider.getReports(orgId)` / `dataProvider.upsertReport(...)`.
- L'org courante vient du store (`useApp((s) => s.currentOrgId)`). Aucun `orgId` en dur.
- Le mode démo (`org_id` `demo-org-*`) est intercepté par `DemoProvider` : les writes sont
  des **no-op**. Toute fonctionnalité DOIT être testée avec ET sans mode démo.
- Sauvegarder = `JSON.stringify(config)` dans `content`. Charger = `JSON.parse(rep.content)`.
- Le **journal** local des générations (titre + format + date) passe par `safeLocalStorage`
  (clé `report-journal`, borné à 50 entrées).

---

## 9. Couche IA — auto-commentaire (optionnelle)

Pattern de référence : `engine/<domaine>/reportCommentator.ts` (chez Cockpit FnA :
`proph3/reportCommentator.ts`). Cette couche est **optionnelle** mais, si présente, DOIT
respecter le contrat suivant :

```ts
// Parcourt les blocs, insère un paragraphe de commentaire sous chaque H1/H2/H3.
export function autoCommentReport(
  blocks: Block[], data: any, opts: { orgId?: string; context?: string },
): { blocks: Block[]; count: number };

// Retire UNIQUEMENT les commentaires générés par l'IA (préserve les paragraphes manuels).
export function clearAutoComments(blocks: Block[]): { blocks: Block[]; count: number };
```

Principes : les commentaires générés DOIVENT être **marqués** (pour pouvoir être effacés
sans toucher au texte écrit par l'utilisateur), et la génération NE DOIT PAS écraser un
paragraphe rédigé manuellement. La source des analyses (mémoire historique, normes
sectorielles, prédictions) est spécifique au domaine.

---

## 10. Conventions UI & impression

- **Layout 3 colonnes** (grid) : **Éditeur** (gauche, repliable) · **Visualiseur A4**
  (centre, `.report-print-area`) · **Récapitulatif** (droite, repliable). L'état replié/
  déplié est mémorisé via `safeLocalStorage`.
- **Éditeur** : sections `Collapsible` — Identité, Sommaire, Format de sortie, Palette,
  Pages spéciales, Modèles rapides, Mes modèles personnels.
- **Visualiseur** : `renderPages(config, data, palette, ops)` simule des pages A4
  (`aspectRatio` 210/297 portrait, 297/210 paysage, 16/9 pptx) avec drag & drop des blocs
  et insertion contextuelle (`InsertHere`).
- **Impression** : la zone imprimable porte la classe `report-print-area` ; tout le chrome
  (sidebars, header) porte `no-print`. Le format PDF est piloté par les CSS `@page`.
- **Icônes** `lucide-react`, classes conditionnelles `clsx`. Aucune couleur en dur :
  utiliser la palette + les tokens Tailwind du thème (`primary-*`, `accent`, …).

---

## 11. Checklist de conformité

Une application est **conforme** si toutes ces cases sont cochées :

- [ ] `engine/reportBlocks.ts` expose `Block`, `ReportConfig`, `ReportData`, `PALETTES`,
      `DEFAULT_CONFIG`, `buildPDFFromBlocks`, `buildPPTXFromBlocks` (signatures du §5/§6).
- [ ] `ReportConfig` est 100 % sérialisable JSON ; un rapport sauvegardé se recharge à
      l'identique.
- [ ] Les builders sont purs (aucun accès base/réseau) et lisent les couleurs depuis
      `PALETTES[config.palette]`.
- [ ] PDF portrait **et** paysage **et** PPTX produits depuis le même `ReportConfig`.
- [ ] Couverture, sommaire automatique, en-têtes/pieds, pagination, mention de
      confidentialité opérationnels.
- [ ] `TABLE_CATALOG`, `DASHBOARD_CATALOG`, `QUICK_TEMPLATES`, `computeKPIs`, `uid`,
      `filterConditionalBlocks` présents dans `pages/Reports/reportData.ts`.
- [ ] `filterConditionalBlocks` appliqué à chaque template (zéro section vide).
- [ ] Persistance via `dataProvider` (`getReports/upsertReport/deleteReport/getTemplates`),
      jamais `supabase.from(...)` dans l'UI.
- [ ] Multi-tenant : `orgId` du store, aucun `org_id` en dur, mode démo en no-op.
- [ ] `Reports.tsx` < 500 LOC ; logique dans `Reports/` et `engine/`.
- [ ] Préférences locales via `safeLocalStorage`.
- [ ] `report-print-area` / `no-print` correctement posés ; CSS `@page` configurées.
- [ ] (Si IA) `autoCommentReport` / `clearAutoComments` respectent le marquage et préservent
      le texte manuel.

---

## 12. Guide d'implémentation pas-à-pas

Pour greffer le module Reporting sur une **nouvelle** application (stack §3 déjà en place).

### Étape 0 — Prérequis
L'app possède déjà : un `dataProvider` (Supabase + Demo), un store Zustand avec
`currentOrgId`, `safeLocalStorage`, Tailwind configuré, un layout avec `PageHeader`.

```bash
npm i jspdf jspdf-autotable pptxgenjs file-saver lucide-react clsx
npm i -D @types/file-saver
```

### Étape 1 — Le cœur : `engine/reportBlocks.ts`
Copier le fichier de référence. Garder **verbatim** : `Block`, `ReportConfig`,
`DEFAULT_CONFIG`, `PALETTES`, `buildPDFFromBlocks`, `buildPPTXFromBlocks`. Adapter
**uniquement** `ReportData` et les `case` de résolution `table`/`dashboard` à votre domaine.

### Étape 2 — Le schéma & la persistance
1. Ajouter `ReportDoc` (et `ReportTemplate`) dans `db/schema.ts` (§5.5).
2. Créer la table Supabase `<prefix>_reports` (RLS par `org_id`, voir migration ci-dessous).
3. Implémenter `getReports/getReport/upsertReport/deleteReport/getTemplates` dans
   `supabaseProvider.ts` **et** `demoProvider.ts` (writes no-op pour `demo-org-*`).
4. Déclarer les méthodes dans l'interface `provider.ts`.

```sql
-- supabase/migrations/0XX_reports.sql
create table if not exists fna_reports (
  id          bigint generated always as identity primary key,
  org_id      text not null,
  title       text not null,
  type        text not null default 'report',
  author      text,
  status      text not null default 'draft',
  content     text,                        -- JSON.stringify(ReportConfig)
  created_at  bigint not null,
  updated_at  bigint not null
);
alter table fna_reports enable row level security;
create policy "reports_by_org" on fna_reports
  using (org_id in (select org_id from fna_user_orgs where user_id = auth.uid()));
-- idem pour fna_report_templates
```

### Étape 3 — Le catalogue : `pages/Reports/reportData.ts`
Déclarer `TABLE_CATALOG`, `DASHBOARD_CATALOG` (vos sources), `computeKPIs` (vos KPIs),
`QUICK_TEMPLATES` (au moins `monthly`), plus `uid` et `filterConditionalBlocks`.

### Étape 4 — Le visualiseur : `pages/Reports/`
Copier/adapter `renderPages.tsx`, `PageComponents.tsx`, `BlockComponents.tsx`,
`BlockPreviews.tsx`, `DashboardSnippet.tsx`, `Modals.tsx`. Le rendu écran de chaque bloc
DOIT correspondre au rendu PDF.

### Étape 5 — L'orchestrateur : `pages/Reports.tsx`
Copier `Reports.tsx`. Brancher vos hooks de données métier pour construire l'objet `data`
(mémoïsé) injecté dans `renderPages` et les builders. Garder < 500 LOC.

### Étape 6 — Le routage & le catalogue d'app
Wire la route `/reports` dans `App.tsx` (lazy-load via `lazyWithRetry`) et ajouter l'entrée
au catalogue/sidebar.

### Étape 7 — CSS d'impression
Ajouter dans `index.css` les classes `report-print-area` / `no-print` et les règles `@page`
(format A4, marges). Vérifier portrait, paysage, et l'export PPTX.

### Étape 8 — (Optionnel) Couche IA
Créer `engine/<domaine>/reportCommentator.ts` avec `autoCommentReport` / `clearAutoComments`
(contrat §9) et brancher les deux boutons dans le `PageHeader`.

### Étape 9 — Validation
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Puis dérouler la **checklist §11** et tester avec une org réelle **et** une org démo.

---

## 13. Adapter le standard hors du domaine financier

« Toutes mes applications » ne sont pas forcément des outils financiers SYSCOHADA. Le
standard reste valable : **le squelette est agnostique, seules deux choses changent.**

| Couche | Agnostique (garder verbatim) | À adapter au domaine |
|---|---|---|
| `Block`, `ReportConfig`, `DEFAULT_CONFIG` | ✅ | — |
| `PALETTES`, moteur PDF/PPTX, sommaire, couverture, pieds | ✅ | (palette de marque) |
| Éditeur 3 colonnes, visualiseur, persistance, multi-tenant | ✅ | — |
| `ReportData` | — | **Remplacer** par la forme de vos données métier |
| `TABLE_CATALOG` / `DASHBOARD_CATALOG` | — | **Lister** vos sources de contenu |
| `QUICK_TEMPLATES` / `computeKPIs` | structure ✅ | **Contenu** = vos sections / KPIs |
| résolution `source`/`dashboardId` dans les builders | structure ✅ | **`case`** vers vos données |

**Recette de portage :**
1. Définir `ReportData` = ce que vos écrans savent déjà calculer (ex. pour un CRM :
   `pipeline[]`, `deals[]`, `kpisCommerciaux`; pour un outil RH : `effectifs`, `turnover`…).
2. Remplir `TABLE_CATALOG` / `DASHBOARD_CATALOG` avec vos sources.
3. Écrire `computeKPIs(data)` qui renvoie des **chaînes formatées** prêtes pour les blocs
   `kpi`.
4. Écrire au moins un `QUICK_TEMPLATES.monthly` représentatif.
5. Mapper chaque `source`/`dashboardId` vers `data` dans les `case` des builders.
6. Le reste (export, thème, édition, sommaire, persistance, conditionnel) fonctionne **sans
   modification**.

> En résumé : on ne réécrit jamais le moteur. On lui fournit un nouveau `ReportData` et un
> nouveau catalogue. C'est précisément ce qui fait de ce module un **standard réutilisable**.

---

*Fin du standard. Toute évolution de ce document DOIT incrémenter la version en en-tête et
être répercutée dans les applications consommatrices.*
