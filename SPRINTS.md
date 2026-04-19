# Roadmap Cockpit FnA — Sprints 5 à 7

> Architecture actuelle : Vite + React 18 + TypeScript + Zustand + Dexie (IndexedDB)
> Données 100 % locales (navigateur), aucun backend, aucune auth.

---

## Sprint 5 — Supabase + SMTP/Resend

**Objectif** : Passer d'une app purement locale à une app cloud-ready avec auth, persistance PostgreSQL, stockage de fichiers et envoi de rapports par email.

### 5.1 Supabase — Auth, PostgreSQL, Storage, Realtime

#### 5.1.1 Setup projet
- [ ] Créer le projet Supabase (région EU/Paris)
- [ ] Installer `@supabase/supabase-js` + `@supabase/auth-helpers-react`
- [ ] Créer `src/lib/supabase.ts` — client singleton avec env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Fichier `.env.local` + `.env.example` (jamais commité)

#### 5.1.2 Auth (Supabase Auth)
- [ ] Activer les providers : **Email/Password** + **Magic Link** + **Google OAuth** (optionnel)
- [ ] Créer les pages :
  - `src/pages/auth/Login.tsx` — email + mot de passe + magic link
  - `src/pages/auth/Register.tsx` — inscription avec org
  - `src/pages/auth/ForgotPassword.tsx`
  - `src/pages/auth/Callback.tsx` — OAuth redirect
- [ ] Créer `src/hooks/useAuth.ts` — expose `user`, `session`, `signIn()`, `signOut()`, `loading`
- [ ] Créer `src/components/auth/ProtectedRoute.tsx` — redirige vers `/login` si non authentifié
- [ ] Modifier `App.tsx` — enrober les routes avec `<ProtectedRoute>`
- [ ] Row Level Security (RLS) : chaque table filtrée par `org_id` lié au `auth.uid()` via une table `user_orgs`

#### 5.1.3 Migration Dexie → PostgreSQL
- [ ] Créer les migrations SQL Supabase reprenant le schéma `db/schema.ts` :
  ```
  supabase/migrations/
    001_organizations.sql
    002_fiscal_years.sql
    003_periods.sql
    004_accounts.sql
    005_gl_entries.sql
    006_imports.sql
    007_budgets.sql
    008_mappings.sql
    009_reports.sql
    010_templates.sql
    011_attention_points.sql
    012_action_plans.sql
    013_analytic_*.sql
    014_user_orgs.sql       ← lien user ↔ org (rôle: admin/editor/viewer)
  ```
- [ ] Créer `src/db/supabaseSchema.ts` — types TypeScript générés via `supabase gen types`
- [ ] Créer `src/db/provider.ts` — couche d'abstraction :
  ```typescript
  interface DataProvider {
    getAccounts(orgId: string): Promise<Account[]>;
    getGLEntries(orgId: string, filters: GLFilter): Promise<GLEntry[]>;
    upsertBudget(lines: BudgetLine[]): Promise<void>;
    // ... miroir de ce que Dexie fait aujourd'hui
  }
  export const provider: DataProvider = isOnline ? supabaseProvider : dexieProvider;
  ```
- [ ] Adapter les hooks (`useFinancials.ts`, etc.) pour passer par le `DataProvider` au lieu d'appeler `db.*` directement
- [ ] Mode dégradé : si Supabase KO → fallback Dexie (les données locales restent utilisables)

#### 5.1.4 Storage (fichiers importés)
- [ ] Créer le bucket Supabase Storage : `imports` (privé, RLS par org)
- [ ] À l'import (GL, Budget, COA) : uploader le fichier source dans Storage + enregistrer le `storage_path` dans `imports`
- [ ] Page Imports : bouton "Télécharger l'original" qui appelle `supabase.storage.from('imports').download(path)`

#### 5.1.5 Realtime (multi-utilisateur)
- [ ] Activer Realtime sur les tables `attention_points`, `action_plans`, `reports`
- [ ] Souscrire aux changements dans les hooks concernés → mise à jour automatique de l'UI
- [ ] Indicateur "Dernière synchro" dans le header + badge utilisateurs connectés
- [ ] Gestion de conflits : last-write-wins avec timestamp `updated_at`

#### 5.1.6 Gestion multi-org / rôles
- [ ] Table `user_orgs` : `user_id`, `org_id`, `role` (admin | editor | viewer)
- [ ] Sélecteur d'organisation dans le Header (si user multi-org)
- [ ] Permissions UI :
  - **viewer** : lecture seule, exports
  - **editor** : imports, saisie budget, points d'attention
  - **admin** : paramètres, gestion des utilisateurs, suppression

---

### 5.2 SMTP / Resend — Envoi automatique des rapports

#### 5.2.1 Setup
- [ ] Créer un compte Resend (ou SMTP interne) → clé API dans les secrets Supabase
- [ ] Créer une Edge Function Supabase : `supabase/functions/send-report/index.ts`
- [ ] Installer `resend` SDK dans la function (ou utiliser fetch direct sur l'API Resend)

#### 5.2.2 Edge Function `send-report`
```typescript
// Reçoit : { reportId, recipients: string[], format: 'pdf' | 'html', orgId }
// 1. Vérifie auth + RLS (l'user a bien accès à cet org)
// 2. Récupère le rapport depuis la table `reports`
// 3. Génère le PDF (via le contenu JSON stocké)
// 4. Envoie via Resend avec le PDF en pièce jointe
// 5. Log l'envoi dans une table `email_logs`
```

#### 5.2.3 Table `email_logs`
- [ ] Migration : `id`, `org_id`, `report_id`, `recipients[]`, `subject`, `status` (sent/failed/bounced), `sent_at`, `error`
- [ ] RLS par org

#### 5.2.4 Table `email_schedules` (envoi automatique)
- [ ] Migration : `id`, `org_id`, `report_type`, `frequency` (weekly/monthly/quarterly), `day_of_week`/`day_of_month`, `recipients[]`, `enabled`, `last_sent_at`, `next_run_at`
- [ ] Edge Function `cron-send-reports` déclenchée par pg_cron (Supabase) :
  - Toutes les heures, vérifie `email_schedules` → si `next_run_at <= now()` et `enabled` → génère + envoie
  - Met à jour `last_sent_at` et calcule `next_run_at`

#### 5.2.5 UI
- [ ] **Page Rapports** — bouton "Envoyer par email" sur chaque rapport :
  - Modal : saisie destinataires, objet, message personnalisé, format (PDF/HTML)
  - Appel de l'Edge Function `send-report`
  - Toast de confirmation / erreur
- [ ] **Page Rapports** — onglet "Programmation" :
  - Liste des envois programmés (CRUD)
  - Formulaire : type de rapport, fréquence, jour, heure, destinataires
  - Toggle actif/inactif
- [ ] **Page Rapports** — onglet "Historique envois" :
  - Table paginée depuis `email_logs` : date, destinataires, statut, rapport
- [ ] **Settings** — section "Email" :
  - Configurer l'expéditeur (nom, reply-to)
  - Template email (header, footer, signature)
  - Test d'envoi

---

## Sprint 6 — Electron Desktop + Sync Offline

**Objectif** : Packager l'app en application native Windows/macOS/Linux avec synchronisation offline via SQLite.

### 6.1 Setup Electron

#### 6.1.1 Architecture
```
cockpit-fna/
├── electron/
│   ├── main.ts              ← process principal Electron
│   ├── preload.ts           ← bridge sécurisé (contextBridge)
│   ├── ipc/
│   │   ├── db.ts            ← handlers SQLite (better-sqlite3)
│   │   ├── fs.ts            ← accès fichiers natifs
│   │   ├── sync.ts          ← sync Supabase ↔ SQLite
│   │   └── update.ts        ← auto-update (electron-updater)
│   └── menu.ts              ← menu natif (Fichier, Édition, Aide)
├── src/                      ← app React existante (inchangée)
├── electron-builder.yml      ← config de packaging
└── package.json              ← scripts electron:dev, electron:build
```

#### 6.1.2 Setup
- [ ] Installer `electron`, `electron-builder`, `electron-vite`
- [ ] Créer `electron/main.ts` :
  - Fenêtre principale : `BrowserWindow` chargeant le build Vite (ou dev server en dev)
  - Taille par défaut : 1400×900, min 1024×768
  - Icône app, titre "Cockpit FnA"
  - Menu natif (Fichier → Importer, Exporter, Quitter | Aide → À propos)
- [ ] Créer `electron/preload.ts` :
  - `contextBridge.exposeInMainWorld('electronAPI', { ... })`
  - Expose : `readFile`, `writeFile`, `showOpenDialog`, `showSaveDialog`, `getAppVersion`, `db.*`, `sync.*`
- [ ] Adapter `vite.config.ts` pour le mode Electron (base relative `./`)
- [ ] Script npm : `electron:dev` (Vite dev + Electron), `electron:build` (build + package)

#### 6.1.3 SQLite local (better-sqlite3)
- [ ] Installer `better-sqlite3` + `@types/better-sqlite3`
- [ ] Créer `electron/ipc/db.ts` :
  - Ouvrir/créer la base SQLite dans `app.getPath('userData')/cockpit.db`
  - Schéma miroir de Supabase (mêmes tables, mêmes colonnes)
  - Migrations versionnées embarquées
- [ ] IPC handlers : `db:query`, `db:insert`, `db:update`, `db:delete`, `db:bulkInsert`
- [ ] Adapter `src/db/provider.ts` :
  ```typescript
  const provider: DataProvider =
    window.electronAPI ? electronSQLiteProvider :  // Electron → SQLite
    isOnline ? supabaseProvider :                  // Web → Supabase
    dexieProvider;                                 // Web offline → Dexie
  ```

### 6.2 Sync offline ↔ Supabase

#### 6.2.1 Stratégie de synchronisation
- [ ] Chaque table a une colonne `updated_at` (timestamp) + `sync_status` (synced | pending | conflict)
- [ ] **Sync montante** (SQLite → Supabase) :
  - Au retour de connexion, push toutes les lignes `sync_status = 'pending'`
  - Upsert Supabase avec `ON CONFLICT DO UPDATE WHERE updated_at < excluded.updated_at`
- [ ] **Sync descendante** (Supabase → SQLite) :
  - Pull les lignes modifiées depuis le dernier `last_sync_at` (stocké dans SQLite)
  - Upsert local
- [ ] **Conflits** : si `updated_at` local ≠ remote → marquer `conflict`, l'utilisateur tranche dans l'UI

#### 6.2.2 Détection connectivité
- [ ] `navigator.onLine` + heartbeat Supabase toutes les 30s
- [ ] Indicateur dans le Header : 🟢 En ligne / 🟠 Sync en cours / 🔴 Hors ligne
- [ ] Queue d'opérations offline : les écritures s'accumulent localement, sync au retour

#### 6.2.3 Fonctionnalités natives
- [ ] Import fichiers : `dialog.showOpenDialog` natif (plus rapide, accès complet au FS)
- [ ] Export PDF/Excel : `dialog.showSaveDialog` + écriture directe
- [ ] Notifications système : alertes critiques via `Notification` API Electron
- [ ] Auto-update : `electron-updater` pointant sur GitHub Releases ou un serveur custom
- [ ] Tray icon (optionnel) : accès rapide, minimiser en tray

### 6.3 Packaging & distribution
- [ ] **Windows** : `.exe` installeur (NSIS) + portable `.zip`
- [ ] **macOS** : `.dmg` + `.pkg` (signature Apple Developer si distribution)
- [ ] **Linux** : `.AppImage` + `.deb`
- [ ] CI/CD : GitHub Actions pour build automatique sur tag `v*`
- [ ] Auto-update : publier les releases sur GitHub, `electron-updater` vérifie au lancement

---

## Sprint 7 — Ollama IA Locale

**Objectif** : Remplacer le moteur de réponse heuristique (Sprint 1) par un vrai LLM local via Ollama. Aucune donnée ne quitte le poste.

### 7.1 Intégration Ollama

#### 7.1.1 Setup & détection
- [ ] Ollama tourne en local sur `http://localhost:11434`
- [ ] Créer `src/lib/ollama.ts` :
  ```typescript
  const OLLAMA_URL = 'http://localhost:11434';

  export async function checkOllama(): Promise<{ available: boolean; models: string[] }> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`);
      const data = await res.json();
      return { available: true, models: data.models.map(m => m.name) };
    } catch { return { available: false, models: [] }; }
  }

  export async function* chat(model: string, messages: Message[], systemPrompt: string): AsyncGenerator<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], stream: true }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        const json = JSON.parse(line);
        if (json.message?.content) yield json.message.content;
      }
    }
  }
  ```

#### 7.1.2 Modèles recommandés
| Modèle | Taille | RAM min | Usage |
|--------|--------|---------|-------|
| **Llama 3.1 8B** | 4.7 GB | 8 GB | Analyse généraliste, bon en français |
| **Mistral 7B** | 4.1 GB | 8 GB | Raisonnement financier, rapide |
| **Phi-3 Mini** | 2.3 GB | 4 GB | Machines légères, réponses concises |
| **Llama 3.1 70B** | 40 GB | 48 GB | Analyse approfondie (serveur dédié) |

#### 7.1.3 Prompt système financier
- [ ] Créer `src/engine/ai/systemPrompt.ts` :
  ```
  Tu es un analyste financier expert du référentiel SYSCOHADA / OHADA.
  Tu analyses les données comptables d'entreprises africaines francophones.
  Règles :
  - Réponds TOUJOURS en français
  - Utilise les montants en XOF (FCFA)
  - Réfère-toi aux classes SYSCOHADA (1-9)
  - Structure tes analyses : constat → cause → recommandation
  - Sois précis sur les chiffres, cite les comptes concernés
  - Ne fabrique JAMAIS de données, utilise uniquement le contexte fourni
  ```

#### 7.1.4 Context injection (RAG léger)
- [ ] À chaque question, injecter dans le prompt le contexte financier pertinent :
  ```typescript
  function buildContext(question: string, data: FinancialData): string {
    const sections: string[] = [];
    // Toujours inclure : SIG résumé + ratios en alerte
    sections.push(formatSIG(data.sig));
    sections.push(formatBilan(data.bilan));
    sections.push(formatRatiosAlerte(data.ratios));
    // Selon la question : ajouter budget, trésorerie, analytique...
    if (mentions(question, ['budget', 'écart', 'réalisé'])) sections.push(formatBudgetActual(data.budget));
    if (mentions(question, ['tréso', 'cash', 'liquidité'])) sections.push(formatTresorerie(data.tresorerie));
    if (mentions(question, ['analytique', 'section', 'projet'])) sections.push(formatAnalytique(data.analytique));
    return sections.join('\n\n');
  }
  ```
- [ ] Limiter le contexte à ~3000 tokens pour rester dans la fenêtre du modèle 8B
- [ ] Créer `src/engine/ai/contextBuilder.ts` — formateurs de données pour le prompt

### 7.2 UI Chat améliorée

#### 7.2.1 Page IA (`src/pages/AI.tsx`)
- [ ] Remplacer le moteur heuristique par `ollama.chat()` quand Ollama est disponible
- [ ] **Streaming** : afficher la réponse token par token (effet machine à écrire)
- [ ] Indicateur de statut Ollama : 🟢 Connecté (modèle X) / 🔴 Non détecté
- [ ] Sélecteur de modèle (si plusieurs installés)
- [ ] Boutons d'action rapide :
  - "Analyse la rentabilité"
  - "Commente les ratios en alerte"
  - "Résume la situation financière"
  - "Identifie les risques"
  - "Rédige un commentaire pour le rapport"
- [ ] Historique des conversations (stocké localement dans Dexie/SQLite)

#### 7.2.2 FloatingAI (chatbot flottant)
- [ ] Même intégration Ollama dans `FloatingAI.tsx`
- [ ] Mode compact : réponses courtes (max 200 tokens)
- [ ] Contexte automatique : injecte la page courante (ex: si on est sur Ratios → injecte les ratios)

### 7.3 IA dans les rapports

#### 7.3.1 Commentaires automatiques
- [ ] Bouton "Générer le commentaire IA" sur chaque section de rapport
- [ ] Le prompt inclut les données de la section + les données de contexte
- [ ] L'utilisateur peut éditer/valider/rejeter le commentaire généré
- [ ] Ton configurable : "Technique" / "Direction Générale" / "Conseil d'Administration"

#### 7.3.2 Synthèse exécutive
- [ ] Génération automatique de la synthèse exécutive du rapport mensuel/trimestriel
- [ ] Inclut : faits marquants, alertes, tendances, recommandations
- [ ] Limité à 500 mots, structuré en bullets

### 7.4 IA dans les alertes

- [ ] Pour chaque alerte / point d'attention : bouton "Analyser avec l'IA"
- [ ] Le LLM reçoit le contexte du ratio/compte concerné + historique
- [ ] Retourne : diagnostic probable, causes possibles, actions recommandées
- [ ] Possibilité de transformer la recommandation IA en action dans le plan d'action

### 7.5 Configuration & fallback

- [ ] **Settings → Intelligence artificielle** :
  - URL Ollama (défaut `localhost:11434`, configurable pour un serveur distant)
  - Modèle préféré
  - Température (0.1 = factuel, 0.7 = créatif)
  - Longueur max des réponses
  - Test de connexion
- [ ] **Fallback** : si Ollama non disponible → moteur heuristique actuel (Sprint 1) reste fonctionnel
- [ ] **Electron** : possibilité de bundler Ollama avec l'app (installeur qui inclut Ollama + un modèle léger type Phi-3)

---

## Résumé chronologique

```
Sprint 5 ──────────────────────────────────────────
  5.1  Supabase Auth + PostgreSQL + Storage + Realtime
  5.2  SMTP / Resend — envoi automatique des rapports

Sprint 6 ──────────────────────────────────────────
  6.1  Electron — app native desktop
  6.2  Sync offline SQLite ↔ Supabase
  6.3  Packaging & distribution (Win/Mac/Linux)

Sprint 7 ──────────────────────────────────────────
  7.1  Ollama — intégration LLM local
  7.2  Chat IA amélioré (streaming, contexte)
  7.3  IA dans les rapports (commentaires auto)
  7.4  IA dans les alertes (diagnostic)
  7.5  Configuration & fallback
```
