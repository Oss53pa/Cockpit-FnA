# CLAUDE.md — Guide d'onboarding pour contributeurs IA & humains

Ce document fournit le contexte technique strict nécessaire pour contribuer
efficacement à Cockpit FnA sans casser l'archi multi-tenant ou le mode démo.

## Stack

- **Frontend** : React 18 + TypeScript strict + Vite 5 + Tailwind 3
- **State** : Zustand (`src/store/`) + hooks custom (`src/hooks/`)
- **Charts** : Recharts (principal) + Nivo (parts) + ECharts (heatmaps) + Tremor (KPI cards)
- **Backend** : Supabase (Postgres + Auth + Realtime + Edge Functions Deno)
- **Tests** : Vitest

## Règles d'or

### 1. Tout passage Supabase via `dataProvider`
**Ne jamais** appeler `supabase.from(...)` directement dans une page ou un composant. Utiliser `dataProvider.getXxx()` / `dataProvider.upsertXxx()` qui :
- Est intercepté par `DemoProvider` pour le mode démo (org_id commence par `demo-org-*`)
- Garantit la cohérence de la couche d'accès
- Permet de stub en tests

### 2. Multi-tenant strict
Toutes les requêtes filtrent par `org_id` (en plus de la RLS Supabase).
**Jamais** utiliser un `org_id` hardcodé (`'sa-001'` est interdit).
- L'org courante vient de `useApp((s) => s.currentOrgId)`
- Au login : `useOrgResolver` charge `fna_user_orgs` et bascule sur la 1re org de l'user

### 3. localStorage protégé
**Toujours** utiliser `safeLocalStorage` de `src/lib/safeStorage.ts`. Jamais `localStorage.setItem` directement (crash en Safari iOS / quota plein).

### 4. Tables backend toujours préfixées `fna_*`
Migration `012_production_ready.sql` aligne le backend sur le schéma frontend. Aucune table sans préfixe ne doit être référencée dans le code.

### 5. Sémantique WBS analytique
3 branches conditionnelles : `revenue` / `project_cost` / `overhead` (cf. `src/engine/analyticBranch.ts`). Un code typé `branch` ne peut être affecté qu'à une ligne dont `inferBranch()` matche.

### 6. Mode démo ne doit jamais polluer Supabase
DemoProvider intercepte les writes pour les `demo-org-*` → no-op. Toujours tester avec et sans `localStorage['demo-mode']`.

## Workflow de contribution

```bash
# 1. Avant de coder
npm run typecheck && npm run lint && npm test

# 2. Pendant le code
# - Hooks personnalisés dans src/hooks/
# - Logique métier dans src/engine/
# - Composants UI réutilisables dans src/components/ui/
# - Pages routées dans src/pages/ (1 fichier = 1 route)

# 3. Avant commit
npm run typecheck   # zéro erreur
npm run lint        # zéro erreur (warnings tolérés)
npm test            # tous verts
npm run build       # bundle OK

# 4. Format de commit
# feat(domain): description courte
# fix(domain): description
# refactor(domain): description
# Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Patterns à suivre

### Nouveau dashboard
1. Créer `src/pages/<Name>.tsx` avec `<PageHeader>` + données via hooks
2. Wire la route dans `src/App.tsx`
3. Ajouter une entrée dans `src/pages/Dashboards.tsx` (catalogue)
4. Tester avec org démo + org réelle

### Nouvelle page Analytical
1. Créer dans `src/pages/analytical/Analytical<Name>.tsx`
2. Utiliser `loadAnalyticContext()` + `viewEntries()` de `src/engine/analyticDashboards.ts`
3. Wire route + entrée catalogue avec préfixe `ana_*`

### Nouvelle table Supabase
1. Créer une migration `supabase/migrations/0XX_<name>.sql`
2. Activer RLS + policies basées sur `fna_user_orgs`
3. Ajouter le type dans `src/db/schema.ts`
4. Implémenter dans `SupabaseProvider` ET `DemoProvider`
5. Mettre à jour `caseConvert.ts` si besoin (mapping camel/snake)

### Nouveau KPI
1. Définir la formule dans `src/engine/<area>.ts`
2. Tester unitairement (`*.test.ts`)
3. Exposer via un hook `useFinancials` ou helper engine
4. Ajouter au catalogue KPI (`src/pages/analytical/AnalyticalKPICatalog.tsx`)

## Anti-patterns à éviter

| ❌ NE PAS | ✅ FAIRE |
|---|---|
| `supabase.from('fna_xx').select(...)` dans un composant | `dataProvider.getXx(orgId)` |
| `localStorage.setItem(...)` | `safeLocalStorage.setItem(...)` |
| `dangerouslySetInnerHTML={{__html: ...}}` | Parser le markdown en React elements (cf. `StreamingText.tsx`) |
| `console.log` dans `engine/` | `debug(...)` wrappé `import.meta.env.DEV` |
| `setTimeout` arbitraire après async | `await` + chain `.then()` |
| Composants > 500 LOC dans `pages/` | Split en sous-modules |
| `as any` sans `eslint-disable` + commentaire | Typer correctement (utiliser les types Supabase) |

## Sécurité

- Toujours valider les inputs utilisateur (mais zod n'est pas encore intégré — utiliser parsing manuel défensif en attendant)
- Aucun secret dans `src/` (uniquement `import.meta.env.VITE_*`)
- `SUPABASE_SERVICE_ROLE_KEY` jamais côté client (Edge Functions uniquement)
- Avant un push, vérifier qu'aucun `console.log` n'expose de données sensibles

## Performance

- Lazy-loader les pages lourdes (`lazyWithRetry`)
- Utiliser `useMemo` / `useCallback` quand le composant est en boucle
- Pour les agrégats GL, pas de `for-loop` 50k entries dans le render — utiliser `useCloudData` avec tag d'invalidation

## Contact

Pour toute question d'archi : ouvrir une issue GitHub avec le tag `architecture`.
Pour les bugs sécurité : email privé à l'équipe Atlas Studio.
