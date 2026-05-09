# Cockpit FnA — Pilotage financier SYSCOHADA

> Application web de pilotage de la performance financière pour PME ouest-africaines (UEMOA / OHADA), avec comptabilité analytique multi-axes et IA intégrée (Proph3t).

[![CI](https://github.com/Oss53pa/Cockpit-FnA/actions/workflows/ci.yml/badge.svg)](https://github.com/Oss53pa/Cockpit-FnA/actions)

---

## 🎯 Périmètre fonctionnel

- **États financiers SYSCOHADA révisé 2017** : Bilan, Compte de Résultat, SIG, TFT, TAFIRE, Variation des capitaux propres
- **Comptabilité analytique** WBS multi-axes (Projet × Centre × Ressource) avec sémantique conditionnelle (Revenus / Coûts projets / Frais généraux)
- **40+ dashboards** de pilotage : couverture, rentabilité, projets, centres, ressources, FG, budget vs réalisé, anomalies, audit trail
- **Reporting éditable** PDF / PPTX / Excel — 23 sections personnalisables
- **Multi-tenant** : isolation par société (`fna_user_orgs` + RLS Supabase)
- **Mode démo** : fixtures hardcodées pour visualiser sans authentification
- **Audit trail SHA-256** : intégrité cryptographique des écritures GL
- **Proph3t** : assistant IA avec apprentissage incrémental (Ollama local optionnel)

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js ≥ 20 (cf. `.github/workflows/ci.yml`)
- npm ≥ 10

### Installation
```bash
git clone https://github.com/Oss53pa/Cockpit-FnA.git
cd Cockpit-FnA
npm install
cp .env.example .env.local   # à compléter avec vos clés Supabase
npm run dev                  # http://localhost:5173
```

### Scripts disponibles
| Commande | Description |
|---|---|
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Preview du build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint sur tout le projet |
| `npm test` | Tests Vitest |
| `npm run test:coverage` | Couverture de code |

---

## 🏗️ Architecture

```
src/
├── components/      Composants UI réutilisables (Card, Modal, Toast, Charts…)
├── db/              DAL : SupabaseProvider + DemoProvider + types schema
├── engine/          Moteurs métier (balance, statements, ratios, importer, analytical, proph3)
├── hooks/           Hooks React (useFinancials, useAuth, useCloudData, useOrgPermissions…)
├── lib/             Utilitaires (Money, format, auditHash, supabase, safeStorage)
├── pages/           Pages routées (Home, Dashboard, Reports, Analytical, Settings…)
├── store/           Zustand stores (app, theme, settings)
└── syscohada/       Plan comptable SYSCOHADA + systèmes (Normal / Allégé / SMT)
```

**Pattern DAL** : tout passage Supabase passe par `dataProvider` (`src/db/provider.ts`), wrappé par `DemoProvider` qui intercepte les `org_id` commençant par `demo-org-*` pour servir des fixtures hardcodées (cf. `src/engine/demoFixtures.ts`).

---

## 🔌 Backend Supabase

### Tables (préfixées `fna_*`)
Voir `supabase/migrations/` pour les définitions complètes. Migration **012** = production-ready (renommage `*` → `fna_*`, branches WBS, tables manquantes).

| Domaine | Tables clés |
|---|---|
| Multi-tenant | `fna_organizations`, `fna_user_orgs`, `fna_org_members` |
| Comptable | `fna_fiscal_years`, `fna_periods`, `fna_accounts`, `fna_gl_entries`, `fna_imports`, `fna_budgets` |
| Analytique | `fna_analytic_axes`, `fna_analytic_codes` (avec `branch`), `fna_analytic_rules`, `fna_analytic_assignments` |
| Reporting | `fna_reports`, `fna_report_templates`, `fna_email_logs`, `fna_email_schedules` |
| Pilotage | `fna_attention_points`, `fna_action_plans` |
| Collaboration | `fna_activities`, `fna_channels`, `fna_chat_messages` |

### Edge Functions
| Function | Rôle |
|---|---|
| `send-email` / `send-report` | Envoi d'emails via Resend |
| `cockpit-send-email` | Wrapper Cockpit FnA + log dans `fna_email_logs` |
| `cockpit-invite-user` | Invitation user + upsert `fna_user_orgs` + `fna_org_members` |
| `invite-user` | Invitation Atlas Studio Suite (`licence_seats`) |
| `start-trial` | Démarrage essai gratuit (`licence_trials`) |

### RLS
Toutes les tables `fna_*` ont des policies RLS qui filtrent par `fna_user_orgs` :
- **SELECT** : user voit uniquement les orgs où il est membre
- **INSERT/UPDATE/DELETE** : selon le `role` (admin / editor / viewer)

---

## 🔒 Sécurité

- ✅ **Headers** : CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (cf. `vercel.json`)
- ✅ **safeStorage** : try/catch sur tous les `localStorage` (resilience navigation privée Safari)
- ✅ **Audit trail SHA-256** : chaîne de hash sur les écritures GL (cf. `src/lib/auditHash.ts`)
- ✅ **No-XSS** : aucun `dangerouslySetInnerHTML` non sanitisé
- ✅ **Multi-tenant strict** : RLS Supabase + filter `org_id` côté DAL

---

## 🧪 Tests

8 fichiers de test (~92 tests) couvrant :
- `Money` (calculs déterministes en bigint)
- `auditHash` (intégrité chaîne SHA-256)
- `periodLock` (verrou de période)
- `balance`, `ratios`, `statements` (engine SYSCOHADA)
- `analyticBranch` (sémantique WBS)

---

## 📚 Documentation

- `CLAUDE.md` — guide pour les contributeurs IA et humains
- `SPRINTS.md` — historique des sprints
- `AUDIT_FIXES.md` — corrections post-audit
- `supabase/migrations/` — migrations SQL versionnées

---

## 📄 Licence

Propriétaire — Atlas Studio. Tous droits réservés.
