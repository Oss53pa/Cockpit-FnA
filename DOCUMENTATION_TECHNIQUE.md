# Documentation technique — Cockpit FnA

> **Public visé :** développeurs (humains & IA), DevOps, auditeurs techniques.
> **Documents liés :** [`CLAUDE.md`](CLAUDE.md) (onboarding & règles d'or),
> [`REPORTING_STANDARD.md`](REPORTING_STANDARD.md) (standard du module Reporting).
> Ce document est la **référence d'architecture globale**. Version 1.0.

---

## Table des matières

1. [Présentation](#1-présentation)
2. [Stack technique](#2-stack-technique)
3. [Vue d'architecture](#3-vue-darchitecture)
4. [Structure du dépôt](#4-structure-du-dépôt)
5. [Frontend & routage](#5-frontend--routage)
6. [State management (Zustand) & hooks](#6-state-management-zustand--hooks)
7. [Couche d'accès aux données (`dataProvider`)](#7-couche-daccès-aux-données-dataprovider)
8. [Backend Supabase & modèle de données](#8-backend-supabase--modèle-de-données)
9. [Multi-tenant, RLS & sécurité](#9-multi-tenant-rls--sécurité)
10. [Authentification & invitations](#10-authentification--invitations)
11. [Moteur financier SYSCOHADA](#11-moteur-financier-syscohada)
12. [Module Reporting](#12-module-reporting)
13. [Proph3t — couche d'intelligence](#13-proph3t--couche-dintelligence)
14. [Import / Export](#14-import--export)
15. [Mode démo](#15-mode-démo)
16. [Piste d'audit & intégrité](#16-piste-daudit--intégrité)
17. [Performance](#17-performance)
18. [Sécurité — synthèse](#18-sécurité--synthèse)
19. [Build, tests & déploiement](#19-build-tests--déploiement)
20. [Conventions & anti-patterns](#20-conventions--anti-patterns)

---

## 1. Présentation

**Cockpit FnA** est une application SaaS de **pilotage financier et comptable** aux normes
**OHADA / SYSCOHADA révisé 2017** (zone UEMOA, franc CFA XOF par défaut). Elle transforme un
Grand Livre importé en états financiers, ratios, dashboards, rapports professionnels (PDF/PPTX)
et analyses assistées par IA (Proph3t).

Caractéristiques structurantes :
- **Multi-tenant** : plusieurs sociétés (org) par utilisateur, cloisonnées par `org_id` + RLS.
- **Offline-first / cloud** : couche d'accès abstraite (`dataProvider`) commutant Supabase,
  mode démo et Electron.
- **Écosystème Atlas Studio** : partage un projet Supabase avec d'autres applications ; Cockpit
  isole ses tables sous le préfixe **`fna_*`**.

---

## 2. Stack technique

| Couche | Technologie |
|---|---|
| UI | React 18 + TypeScript strict + Vite 5 + Tailwind 3 |
| State | Zustand (`src/store/`) + hooks custom (`src/hooks/`) |
| Charts | Recharts (principal) · Nivo (parts) · ECharts (heatmaps) · Tremor (KPI) |
| Backend | Supabase — Postgres + Auth + Realtime + Edge Functions (Deno) |
| Cache local | Dexie (IndexedDB) |
| Documents | jsPDF + jspdf-autotable (PDF) · pptxgenjs (PPTX) · ExcelJS / xlsx (Excel) |
| E-mails | Resend (via Edge Functions) |
| Monitoring | Sentry (source maps « hidden ») + Atlas Error Monitor |
| Tests | Vitest |
| Icônes / utils | lucide-react · clsx · file-saver · papaparse |

---

## 3. Vue d'architecture

```
┌──────────────────────────────────────────────────────────────┐
│  NAVIGATEUR (React SPA, Vite)                                  │
│                                                                │
│  Pages routées (lazy)  ──►  Hooks (useFinancials, useCloud…)   │
│        │                          │                            │
│        ▼                          ▼                            │
│  Stores Zustand            Engine (src/engine/*)               │
│  (app/settings/theme)      SYSCOHADA + Proph3t (calcul pur)    │
│        │                          │                            │
│        └────────────►  dataProvider (abstraction) ◄────────────┤
└────────────────────────────────│──────────────────────────────┘
                                  │ (getXxx / upsertXxx)
        ┌─────────────────────────┼───────────────────────────┐
        ▼                         ▼                            ▼
  SupabaseProvider          DemoProvider                ElectronProvider
   (Postgres+RLS)         (demo-org-*, no-op)            (SQLite local)
        │
        ▼
  Supabase : tables fna_*, RLS, RPC SECURITY DEFINER, Edge Functions
```

Principe cardinal : **l'engine est pur** (aucun accès réseau/base), il ne consomme que des
données déjà chargées. Toute I/O passe par `dataProvider`.

---

## 4. Structure du dépôt

```
src/
├── pages/            # 1 fichier = 1 route (lazy). Sous-dossiers : auth/, settings/,
│                     #   analytical/, Dashboard/, Reports/
├── components/       # ui/ (réutilisables), layout/ (Sidebar, Header…), auth/ (guards)
├── engine/           # LOGIQUE MÉTIER PURE (calculs SYSCOHADA + Proph3t)
│   └── proph3/       # Couche IA (intelligence, anomalies, prédictions, mémoire)
├── hooks/            # Hooks custom (données, auth, permissions, IA)
├── store/            # Zustand : app.ts, settings.ts, theme.ts
├── db/               # Couche d'accès : provider.ts + implémentations + schema.ts
├── lib/              # Utilitaires transverses (Money, format, supabase, safeStorage…)
└── syscohada/        # Référentiel comptable (plan de comptes, règles, systèmes)

supabase/
├── migrations/       # 27 migrations SQL versionnées (001 → 026)
└── functions/        # Edge Functions Deno (cockpit-invite-user, cockpit-send-email…)
```

---

## 5. Frontend & routage

- **Point d'entrée** : `src/App.tsx`. Routage `react-router-dom`.
- **Lazy loading** : toutes les pages via `lazyWithRetry` (`src/lib/lazyWithRetry.ts`) —
  sauf `Home` (chargée en eager pour un affichage instantané post-login).
- **Layout** : `AppLayout` = `Sidebar` + `Header` + `<main>` (avec `Suspense` + transition
  animée). Bandeaux `DemoBanner` / `ReadOnlyBanner`. Widgets flottants (`FloatingAI`,
  `ActivitySidebar`, `OnboardingModal`, `CommandPalette`).
- **Gardes** : `ProtectedRoute` (session requise) + `OrgGuard` (org résolue).
- **Familles de routes** :
  - **Publiques** : `/`, `/demo`, `/login`, `/signup`, `/auth/accept-invite`, `/auth` (SSO Atlas).
  - **États & données** : `/states`, `/ratios`, `/grand-livre`, `/balance`, `/coa`, `/imports`, `/budget`.
  - **Dashboards** : `/dashboards` (catalogue) + `/dashboard/:id` + ~40 dashboards dédiés
    (`/dashboard/exec`, `/dashboard/waterfall`, `/dashboard/zscore`, `/dashboard/tafire`…).
  - **Analytique** : `/analytical/*` (coverage, cost-centers, revenue-centers, pivot, journal…).
  - **Reporting & IA** : `/reports`, `/cr-editor`, `/builder`, `/ai`, `/dashboard/proph3t`.
  - **Paramètres** : `/settings`, `/settings/team`, `/audit`, `/guide`.

---

## 6. State management (Zustand) & hooks

### Stores (`src/store/`)
- **`app.ts`** — état global : `currentOrgId`, `currentYear`, `amountMode` (Entier ↔ Abrégé), etc.
  L'org courante (`useApp((s) => s.currentOrgId)`) est la **source unique** du tenant actif.
- **`settings.ts`** — préférences tenant : cibles de ratios (`ratioTargets`), etc.
- **`theme.ts`** — palettes de couleurs (CSS custom properties `--p-*` injectées dynamiquement),
  mode clair/sombre.

### Hooks (`src/hooks/`)
| Hook | Rôle |
|---|---|
| `useFinancials` | Expose bilan, CR, SIG, ratios, TFT, capital, budget/réalisé, balances mensuelles… |
| `useCloudData` | Fetch mémoïsé + invalidation par **tag** (`invalidateCloudData('gl')`) |
| `useOrgResolver` | Au login : lit `fna_user_orgs`, bascule sur la 1re org de l'utilisateur |
| `useAuth` | Session Supabase, login/logout |
| `useOrgPermissions` | Rôle courant (admin/editor/viewer) → capacités UI |
| `useAI` / `useProph3` / `useOllama` | Intégrations IA (cloud + local Ollama) |
| `useRealtime` | Abonnements Supabase Realtime |
| `useEmail` | Envoi via Edge Functions |

---

## 7. Couche d'accès aux données (`dataProvider`)

Interface unique : `src/db/provider.ts`. **Règle d'or n°1 : jamais `supabase.from(...)` dans une
page/composant** — toujours `dataProvider.getXxx()` / `upsertXxx()`.

Implémentations :
- **`supabaseProvider.ts`** — cloud Postgres (actif si `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
  Toutes les tables `fna_*` ; conversion camelCase ↔ snake_case via `caseConvert.ts`.
  Surface les erreurs RLS (code `42501` → message « session expirée / permissions »).
- **`demoProvider.ts`** — intercepte les `org_id` commençant par `demo-org-*` → **writes no-op**.
- **`electronProvider.ts`** — SQLite local (build desktop Electron).
- **`cachedProvider.ts`** — cache par-dessus.
- **`supabaseSync.ts`** — synchronisation Realtime → Dexie local.

Types de données : `src/db/schema.ts` — `Organization`, `FiscalYear`, `Period`, `Account`,
`GLEntry`, `ImportLog`, `BudgetLine`, `AccountMapping`, `GLAuditLogEntry`, `TiersUnmatched`,
`GLTiersEntry`, `TiersRule`, `ReportDoc`, `ReportTemplate`, `AttentionPoint`, `ActionPlan`,
`AnalyticAxis`, `AnalyticCode`, `AnalyticRule`, `AnalyticAssignment`, `AnalyticBudget`,
`Activity`, `Channel`, `ChatMessage`.

---

## 8. Backend Supabase & modèle de données

- **Projet partagé** avec d'autres applications Atlas Studio. Cockpit isole **toutes** ses tables
  sous le préfixe **`fna_*`** (règle d'or n°4). Les tables non préfixées (`organizations`,
  `user_orgs`…) appartiennent à d'autres apps du projet — **ne jamais y toucher**.
- **Migrations** : `supabase/migrations/0XX_*.sql` (27 fichiers). Jalons notables :
  - `012_production_ready` — renomme les tables en `fna_*`, crée `fna_org_members`, active RLS.
  - `013–015` — corrigent le catch-22 RLS de bootstrap d'org (policies self-admin, récursion).
  - `018` — plan de comptes par org. `019/020` — piste d'audit GL + RPC append.
  - `022` — remplacement atomique du GL. `023` — GL Tiers.
  - `025` — durcissement `SECURITY DEFINER` (retrait exec `anon`).
  - `026` — RPC `fna_create_org_with_admin` (bootstrap 1re org).
- **Tables applicatives clés** (préfixe `fna_`) : `organizations`, `user_orgs`, `org_members`,
  `fiscal_years`, `periods`, `accounts`, `gl_entries`, `budgets`, `reports`, `templates`,
  `attention_points`, `action_plans`, `analytic_*`, `gl_audit_log`, `gl_tiers`, `tiers_rules`,
  `channels`, `chat_messages`, `activities`.

---

## 9. Multi-tenant, RLS & sécurité

Deux tables structurent l'appartenance :

| Table | Rôle | Écrite par |
|---|---|---|
| **`fna_user_orgs`** | **Source de vérité** lue par la RLS. `(user_id, org_id, role)` avec `role ∈ {admin, editor, viewer}` (contrainte CHECK). | service-role (Edge Function) **ou** RPC `SECURITY DEFINER` |
| **`fna_org_members`** | **Roster d'affichage** indexé par email (libellé métier libre : « daf », « comptable »…). Permet de lister un invité avant acceptation. | idem |

### Fonctions helper RLS (`SECURITY DEFINER`)
- **`fna_auth_org_ids(required_role)`** → `SETOF text` : les `org_id` du user courant (option. filtrés par rôle). Utilisée dans ~78 policies.
- **`can_write_for_fna()` / `can_admin_for_fna()`** : délèguent aux entitlements applicatifs (`can_write_for_app('cockpit-fa')`).
- **`fna_user_has_any_org()`** : booléen d'appartenance (fallback anti-catch-22).

### Patron de policy par table métier
```sql
-- SELECT : tout membre de l'org
using (org_id in (select fna_auth_org_ids()))
-- INSERT/UPDATE/DELETE : editor/admin
with check (org_id in (select fna_auth_org_ids('editor')))
```

### Bootstrap de la 1re org (fix catch-22)
Un utilisateur **sans aucune org** ne peut pas faire d'INSERT direct dans `fna_organizations`
(policy RESTRICTIVE). La RPC **`fna_create_org_with_admin(p_id, p_name, …)`** (migration 026,
`SECURITY DEFINER`) crée l'org + le mapping admin atomiquement en contournant la RLS, avec :
1. `auth.uid()` obligatoire ;
2. **garde anti-escalade** : admin uniquement sur une org réellement créée par l'appel
   (`GET DIAGNOSTICS … ROW_COUNT`), pas de rattachement à une org existante.
Appelée par `Settings` (« Sociétés ») et `OnboardingModal` quand Supabase est configuré.

### Rôles
`admin` (tout + gestion des membres) · `editor` (lecture/écriture données) · `viewer` (lecture seule).
Un libellé d'invitation métier est **mappé** vers ce triplet côté Edge Function (voir §10).

---

## 10. Authentification & invitations

### Auth
Supabase Auth (email/mot de passe). Pages : `auth/Login`, `Signup`, `ForgotPassword`,
`ResetPassword`, `Callback`, `AtlasSSO` (SSO depuis Atlas Studio via JWT signé).
`useOrgResolver` bascule sur la 1re org au login.

### Flux d'invitation (multi-tenant)
1. Un **admin** invite (Settings → Utilisateurs). Appel de l'Edge Function **`cockpit-invite-user`** :
   - **Auth appelant** validée (`getUser(token)`) + **autorisation** (admin de chaque org ciblée).
   - Génère un lien **anti-prefetch** (`token_hash` + `type`, consommé client-side par
     `verifyOtp`) → les scanners e-mail (SafeLinks/Proofpoint) ne « brûlent » plus le lien.
   - **ÉTAPE 2** : écrit `fna_user_orgs` (rôle **mappé** via `mapToAuthRole` → admin/editor/viewer)
     **et** `fna_org_members` (libellé d'affichage conservé). Envoi e-mail via **Resend**.
2. L'invité arrive sur **`/auth/accept-invite`** (`AcceptInvite.tsx`) → `verifyOtp` crée la
   session → il définit son mot de passe → l'org est résolue depuis `fna_user_orgs`.

> **Point de vigilance historique :** `fna_user_orgs.role` est contraint à `admin/editor/viewer`.
> Un libellé métier brut (« daf ») y était rejeté → l'invité restait dans le roster **sans accès**.
> Corrigé par `mapToAuthRole()` (daf/comptable → `editor`, lecteur → `viewer`, admin → `admin`).

### Edge Functions (`supabase/functions/`)
`cockpit-invite-user` (invitations, `verify_jwt:false`, auth applicative interne) ·
`cockpit-send-email` / `send-email` · `send-report` · `start-trial` · `invite-user` (générique).

---

## 11. Moteur financier SYSCOHADA

Cœur métier, **pur et testé** (Vitest). Modules `src/engine/` :

| Module | Rôle |
|---|---|
| **`statements.ts`** | Bilan (actif/passif), Compte de Résultat, **SIG**, résultat net. Source unique `computeNetResult` ⇒ **bouclage Bilan = CR** garanti. |
| **`balance.ts`** / `balanceAuxiliaire.ts` | Balance générale + agrégation par racine SYSCOHADA ; balances auxiliaires (clients/fournisseurs). |
| **`ratios.ts`** | Ratios rentabilité / liquidité / structure / activité (DSO, DPO, ROE/ROA…). Gardes division par zéro (→ `NaN`), clamp TVA. |
| **`budgetActual.ts`** / `monthly.ts` | Réalisé / Budget / N-1, mensualisation. |
| **`analytical.ts`** / `analyticBranch.ts` / `analyticDashboards.ts` | Comptabilité analytique (branches `revenue` / `project_cost` / `overhead`). |
| **`glAudit.ts`** | Contrôles de cohérence GL (sens des classes, écritures anormales). |
| **`currency.ts`**, `accountingSystems.ts`, `crModels.ts` | Devises, systèmes comptables, modèles de CR. |

### Conventions comptables clés (vérifiées)
- **SIG complet** : Marge brute → Valeur ajoutée → EBE → Résultat d'exploitation → financier →
  HAO → Résultat net. HAO (comptes 82/84/86/88 produits, 81/83/85 charges) isolé.
- **RRR accordés** (contre-produits à solde **débiteur** normal) : le CA est calculé **net** des
  RRR, en capturant **tous** les sous-comptes ventilés **`70x9`** (7019 marchandises … 706900
  services … 7079) **plus** le global `709`. Invariant `rrrMarch + rrrProd === rrrAccordes`.
- **Contre-comptes normaux** exclus des détecteurs d'anomalies : classe 7 débit `709/70x9`,
  classe 6 crédit `603/609/619/629/639`.
- **Déterminisme monétaire** : sommes via `src/lib/Money.ts` + `moneySum.ts`
  (voir `src/lib/MONEY_GUIDE.md`) — jamais d'addition de flottants bruts.

Référentiel : `src/syscohada/` (`coa.ts` plan de comptes, `syscohada-referentiel.ts`, `rules.ts`,
`systems.ts`, `atlas.ts`).

---

## 12. Module Reporting

Éditeur de rapports **par blocs** (le « gold standard » de l'écosystème — cf.
[`REPORTING_STANDARD.md`](REPORTING_STANDARD.md)).

- **Contrats** (`src/engine/reportBlocks.ts`) : union `Block` (h1/h2/h3, paragraph, kpi, table,
  dashboard, pageBreak, image, spacer), `ReportConfig` (100 % sérialisable JSON), `PALETTES`,
  `ReportData`.
- **Moteur** : `buildPDFFromBlocks` (jsPDF + autotable) & `buildPPTXFromBlocks` (pptxgenjs) —
  fonctions **pures**. Couverture, sommaire auto, en-têtes/pieds, confidentialité, pagination.
- **UI** (`src/pages/Reports.tsx` + `Reports/`) : éditeur 3 colonnes (blocs · visualiseur A4 ·
  récapitulatif), catalogue de tables/dashboards, 13 modèles rapides (`QUICK_TEMPLATES`),
  modèles personnels, journal, export PDF (via `window.print()` + CSS `@page`) / PPTX.
- **Persistance** : `ReportDoc.content` = `JSON.stringify(ReportConfig)` via `dataProvider`.
- **IA** : `proph3/reportCommentator.ts` — auto-commentaire des sections (marqué, effaçable).

---

## 13. Proph3t — couche d'intelligence

`src/engine/proph3/` — moteur d'analyse et de commentaire assisté (branding : **Proph3t**,
première lettre seule en majuscule).

| Module | Rôle |
|---|---|
| `intelligence.ts` | Détection d'anomalies & incohérences (signes, doublons, comptes inconnus). |
| `anomalies.ts` | Anomalies sur soldes/écritures (seuils, sens des classes). |
| `predictions.ts` | Projections par régression linéaire sur l'historique mémorisé. |
| `memory.ts` / `learning.ts` | Mémoire permanente chiffrée (snapshots KPI) + apprentissage. |
| `commentator.ts` / `reportCommentator.ts` | Génération de commentaires d'expert. |
| `syscohada-knowledge.ts` / `knowledge/` | Base de connaissances SYSCOHADA + recherche. |
| `benchmark.ts` / `scoring.ts` | Normes sectorielles, Z-Score / score de santé. |
| `ollama.ts` | LLM local (Ollama) en complément du cloud. |

Chiffrement : `src/lib/proph3Crypto.ts`. Fédération : `proph3tFederation.ts`.

---

## 14. Import / Export

- **Import** (`src/engine/importer.ts`) : parsing GL / balances / tiers (xlsx via `xlsx` &
  `exceljs`, CSV via `papaparse`), détection de colonnes, dédoublonnage (hash de fichier),
  migration de périodes, resync des libellés. RPC atomique `fna_replace_gl` / `fna_import_tiers`.
- **Modèles** (`src/engine/templates.ts`) : génération de fichiers Excel pré-formatés (GL, balance,
  tiers, COA, axes/codes analytiques, budget). **ExcelJS importé dynamiquement** (au clic).
- **Export** (`src/engine/exporter.ts`) : Excel (ExcelJS) & PDF (jsPDF). **Imports dynamiques**
  (au clic « Exporter ») pour alléger les routes.

---

## 15. Mode démo

- Activé via `localStorage['demo-mode']` / `org_id` en `demo-org-*` (`src/lib/demoMode.ts`).
- **`DemoProvider`** intercepte les writes → **no-op** : la démo **ne pollue jamais** Supabase.
- Données fictives : `src/engine/demoSeed.ts` + `demoFixtures.ts`.
- **Toute fonctionnalité DOIT être testée avec ET sans mode démo** (règle d'or n°6).

---

## 16. Piste d'audit & intégrité

- **Chaîne de hash** SHA-256 des écritures GL (`src/lib/auditHash.ts`, `glAuditLog.ts`,
  `engine/auditLog.ts`). Table `fna_gl_audit_log`.
- RPC serveur : **`fna_append_audit_log`** (ajout scellé) et **`fna_get_last_audit_hash`**
  (dernier maillon — `SECURITY DEFINER`, exécution `anon` révoquée en migration 025).
- Visualiseur : `/dashboard/audit-trail` (`AuditTrailVisualizer`) vérifie l'intégrité de la chaîne.
- **Verrouillage de période** : `src/lib/periodLock.ts`.

---

## 17. Performance

- **Routes lazy** (`lazyWithRetry`) — seule `Home` est eager.
- **Découpage vendor** (`vite.config.ts` → `manualChunks`) : `vendor-react`, `vendor-recharts`,
  `vendor-echarts`, `vendor-nivo`, `vendor-xlsx`, `vendor-exceljs`, `vendor-pdf`, `vendor-pptx`,
  `vendor-db`, `vendor-utils`. Ces libs lourdes ne se chargent qu'avec la route qui les utilise.
- **Imports dynamiques** des libs doc (exceljs/jspdf/pptx) → chargées **à l'action**, pas à
  l'ouverture de la route.
- **Mémoïsation** : `useMemo`/`useCallback` sur les agrégats ; `useCloudData` avec invalidation
  par tag (pas de boucle sur 50k écritures dans le render).

---

## 18. Sécurité — synthèse

- **RLS stricte** multi-tenant sur toutes les tables `fna_*` (via `fna_auth_org_ids`).
- **Anti-escalade** : écritures de `fna_user_orgs` réservées à la service-role / aux RPC
  `SECURITY DEFINER` contrôlées (pas d'INSERT client arbitraire).
- **Fonctions `SECURITY DEFINER`** durcies (exécution `anon` révoquée quand hors RLS — migration 025).
- **Secrets** : aucun dans `src/` ; uniquement `import.meta.env.VITE_*`. `SUPABASE_SERVICE_ROLE_KEY`
  **jamais** côté client (Edge Functions uniquement).
- **`safeLocalStorage`** obligatoire (crash Safari iOS / quota).
- **Pas de `dangerouslySetInnerHTML`** — markdown parsé en éléments React (`StreamingText.tsx`).
- **Monitoring** : Sentry (source maps « hidden », supprimées après upload) + Atlas Error Monitor.

---

## 19. Build, tests & déploiement

```bash
npm run typecheck   # tsc --noEmit (0 erreur exigée)
npm run lint        # eslint (0 erreur ; warnings tolérés)
npm test            # vitest run
npm run build       # bundle Vite (dist/)
```

- **Frontend** : déployé sur **Vercel** (build depuis `main`).
- **Base de données** : migrations `supabase/migrations/*.sql` (appliquées via Supabase).
- **Edge Functions** : déployées séparément (Supabase). ⚠️ Un `git push` ne redéploie **pas** les
  Edge Functions ni n'applique les migrations — étapes distinctes.
- **Variables d'env** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client) ;
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (Edge Functions only).

---

## 20. Conventions & anti-patterns

Voir [`CLAUDE.md`](CLAUDE.md) pour le détail. Rappels essentiels :

| ❌ NE PAS | ✅ FAIRE |
|---|---|
| `supabase.from('fna_xx')` dans une page/composant | `dataProvider.getXx(orgId)` |
| `localStorage.setItem(...)` | `safeLocalStorage.setItem(...)` |
| `org_id` hardcodé (`'sa-001'`) | `useApp((s) => s.currentOrgId)` |
| `dangerouslySetInnerHTML` | Parsing markdown → React |
| `console.log` dans `engine/` | `debug()` wrappé `import.meta.env.DEV` |
| Composant > 500 LOC dans `pages/` | Split en sous-modules |
| Table backend sans préfixe `fna_` | Toujours `fna_*` + RLS |
| Addition de flottants monétaires | `Money` / `moneySum` (déterministe) |

---

*Fin de la documentation technique. Toute évolution structurante DOIT être répercutée ici et
dans `CLAUDE.md`.*
