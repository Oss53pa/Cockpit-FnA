# Déploiement — Module Espace Collaboratif

> Runbook de mise en production du module **Espace Collaboratif** (résolution de
> problèmes ancrée au GL : convergence calculée, fil append-only, décisions
> gouvernées, snapshots, diffusion). Rédigé le **2026-07-24**.

## 1. Périmètre déployé

Module de résolution de problèmes ancré à un objet métier. Bidirectionnalité
objet ⇄ espace complète sur les **6 ancrages** :

| Ancrage | Surface FNA (badge « Espace lié ») | Route |
|---|---|---|
| `account_period` | Grand Livre — Balance générale | `/grand-livre` |
| `partner` | Cycle Client / Fournisseur | `/dashboard/client` · `/dashboard/fr` |
| `reconciliation` | Réconciliation bancaire | `/dashboard/bank-reconciliation` |
| `budget_line` | Budget vs Réalisé | `/dashboard/is_bvsa` |
| `journal_entry` | Grand Livre — Pièces déséquilibrées | `/grand-livre` |
| `closing_period` | Justification de clôture | `/dashboard/closing-justification` |

Fonctions clés : convergence en points de base **calculée** (jamais saisie),
fil d'événements **append-only**, verrou de clôture par critères, matrice de
décision par seuils FCFA, **Vigie** (relances idempotentes), **snapshots**
hashés SHA-256 immuables, **rapport de clôture** PDF, onglet **Diffusion**
(widgets vivants in-app + ancrages externes).

## 2. Projet Supabase cible

- **Projet** : `Atlas Studio - Logiciels Saas`
- **Ref / project_id** : `vgtmljfayiysuvrcmunt` (région `eu-west-1`)
- Confirmé via `.env` : `VITE_SUPABASE_URL=https://vgtmljfayiysuvrcmunt.supabase.co`

> ⚠️ La prod applique des migrations **horodatées** (via MCP / dashboard Supabase),
> pas les fichiers locaux `supabase/migrations/0XX_*.sql`. Ces fichiers locaux sont
> un dossier de référence — **ils ne se déploient pas automatiquement**.

## 3. Migrations appliquées en production (2026-07-24)

L'audit du schéma prod a révélé que les tables de base du module étaient déjà
présentes (`fna_spaces`, `fna_space_criteria`, `fna_space_actions`,
`fna_space_decisions`, `fna_space_solutions`, `fna_space_events` — RLS + append-only OK),
mais que **deux objets manquaient**. Ils ont été ajoutés :

### 3.1 `fna_space_external_refs` — colonne d'ancrages externes (Diffusion)

```sql
ALTER TABLE public.fna_spaces
  ADD COLUMN IF NOT EXISTS external_refs jsonb;
```

Forme : `[{ "id", "label", "url", "addedBy", "addedAt" }]`. Mapping automatique
`external_refs` ⇄ `externalRefs` via `toSnake`/`toCamel` (aucun code provider à modifier).

### 3.2 `fna_space_snapshots` — table de snapshots immuables (§ Pièces)

Table append-only calquée sur `fna_space_events` :

```sql
CREATE TABLE public.fna_space_snapshots (
  id bigserial PRIMARY KEY,
  org_id text NOT NULL,
  space_id text NOT NULL REFERENCES public.fna_spaces(id) ON DELETE CASCADE,
  source_app text NOT NULL DEFAULT 'fna',
  source_view text NOT NULL,
  label text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  data jsonb NOT NULL,
  hash_sha256 text NOT NULL,
  taken_by text NOT NULL,
  taken_at bigint NOT NULL
);
CREATE INDEX idx_fna_space_snapshots_space ON public.fna_space_snapshots(space_id, taken_at);

-- Append-only (search_path figé — advisor function_search_path_mutable)
CREATE FUNCTION public.fna_space_snapshots_block_mutation()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'fna_space_snapshots est append-only : un snapshot est immuable';
END; $$;
CREATE TRIGGER trg_fna_space_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.fna_space_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fna_space_snapshots_block_mutation();
REVOKE UPDATE, DELETE ON public.fna_space_snapshots FROM anon, authenticated;

-- RLS (identique aux tables sœurs)
ALTER TABLE public.fna_space_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY fna_space_snapshots_select ON public.fna_space_snapshots
  FOR SELECT USING (org_id IN (SELECT fna_auth_org_ids()));
CREATE POLICY fna_space_snapshots_insert ON public.fna_space_snapshots
  FOR INSERT WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));
```

### Ordre / noms des migrations MCP appliquées

1. `fna_space_external_refs`
2. `fna_space_snapshots`
3. `fna_space_snapshots_harden_search_path`

Fichier local aligné : [`029_space_snapshots.sql`](../supabase/migrations/029_space_snapshots.sql),
[`030_space_external_refs.sql`](../supabase/migrations/030_space_external_refs.sql).

## 4. Vérifications effectuées (toutes ✅)

### 4.1 Schéma
- `fna_spaces.external_refs` : présente (jsonb).
- `fna_space_snapshots` : présente, **RLS ON** (2 policies), **1 trigger** append-only.
- CHECK `anchor_type` : accepte les 6 ancrages.
- `event_type` : texte libre → nouveaux types (`snapshot_created`, `external_linked`,
  `external_unlinked`, `action_overdue`, `proph3t_report`) acceptés sans contrainte.

### 4.2 Smoke-test SQL (transaction annulée — 0 donnée persistée)
`external_refs` accepte le jsonb · insertion snapshot OK · **modification snapshot bloquée**
(append-only).

### 4.3 Test RLS de bout en bout — sous l'identité d'un membre réel authentifié
Simulation du contexte `fna_auth_org_ids()` (JWT `sub` d'un membre admin réel),
transaction annulée :

| Contrôle | Résultat |
|---|---|
| Créer un espace dans **son** org | ✅ autorisé |
| Le relire (SELECT membre) | ✅ visible |
| Créer un snapshot | ✅ autorisé |
| Modifier un snapshot | ✅ **bloqué** (append-only) |
| Créer dans **un autre** org | ✅ **bloqué** (isolation multi-tenant) |
| Lire un autre org | ✅ **invisible** (0 ligne) |

Résidu post-tests : **0** (aucune donnée de test laissée en prod).

### 4.4 Advisors Supabase (sécurité)
770 avis au total (projet global), **0 erreur**. Le seul lié à ce module
(`function_search_path_mutable` sur la fonction trigger) a été **corrigé**.

## 5. Frontend

- Code sur `main` (typecheck 0, lint 0, 17/17 tests moteur, build OK).
- **S'assurer que le pipeline de déploiement front pousse le dernier build de `main`.**

## 6. Étape manuelle restante (non automatisable ici)

Le chemin base + RLS est **prouvé**. Reste à confirmer **une fois, par un humain
connecté** (login réel → écran), le maillon purement UI :

1. Se connecter avec un compte réel disposant d'un rôle `editor`/`admin`.
2. Ouvrir un espace (portefeuille `/spaces` → template), vérifier convergence + badge.
3. Onglet **Pièces** → « Figer un snapshot » (écrit dans `fna_space_snapshots`).
4. Onglet **Diffusion** → ajouter un ancrage externe (écrit `external_refs`).
5. Vérifier le badge sur la surface correspondante (ex. Cycle Client).

> Non fait par l'assistant : saisie d'identifiants interdite, et pas
> d'environnement de staging distinct de la prod dans cette session.

## 7. Rollback

Les deux ajouts sont **additifs et non destructifs**. En cas de besoin :

```sql
-- Retirer la table snapshots (⚠ perte des snapshots créés depuis le déploiement)
DROP TABLE IF EXISTS public.fna_space_snapshots CASCADE;
DROP FUNCTION IF EXISTS public.fna_space_snapshots_block_mutation();

-- Retirer la colonne d'ancrages externes (⚠ perte des ancrages saisis)
ALTER TABLE public.fna_spaces DROP COLUMN IF EXISTS external_refs;
```

Le cœur du module (espaces, critères, actions, décisions, événements) reste
opérationnel sans ces deux objets — seuls les onglets **Pièces** (snapshots) et
**Diffusion → ancrages externes** en dépendent.
