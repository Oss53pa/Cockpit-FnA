# Beta privée — Checklist de lancement Cockpit FnA

Ce document liste tout ce qu'il faut valider AVANT d'inviter des clients
pilotes en beta privée. Suivre l'ordre : un blocant à la fois.

## 0. Pré-requis techniques (à valider en environnement Vercel prod)

- [ ] Toutes les migrations Supabase appliquées (016, 017, 018, 019, 020)
- [ ] Variables d'environnement Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only)
- [ ] Domaine custom configuré (cockpit-fna.atlas-studio.app ou équivalent)
- [ ] Certificat SSL actif
- [ ] Vercel auto-deploy depuis branche `main` opérationnel
- [ ] Tests unitaires verts en CI (`npm test`)
- [ ] Build production réussi (`npm run build`)

## 1. Validation E2E manuelle

Sur un compte fraîchement créé, exécuter ce scénario complet en notant chaque
étape qui échoue ou qui n'a pas le comportement attendu :

### 1.1 Inscription + Onboarding
- [ ] `/signup` accessible
- [ ] Création de compte avec email + mot de passe fonctionne
- [ ] Email de confirmation reçu et lien valide
- [ ] Premier login → OnboardingModal force la création d'une org
- [ ] Champ "Nom de l'entreprise" séparé du nom personnel
- [ ] Org créée → user automatiquement admin de l'org
- [ ] Périodes mensuelles auto-créées pour l'année courante

### 1.2 Configuration org
- [ ] Paramètres → Sociétés → la nouvelle org est visible
- [ ] Édition org : sélecteur "Plan comptable" présent (4 options)
- [ ] Modification du plan comptable persiste après reload
- [ ] Bouton corbeille supprime l'org en cascade (vérifier en DB)

### 1.3 Import GL (Grand Livre)
- [ ] Page Imports accessible
- [ ] Drop d'un fichier CSV/XLSX déclenche la détection des colonnes
- [ ] Mapping détecté automatiquement pour les colonnes standards
- [ ] Lancer l'import → progress bar visible
- [ ] Rapport final : count = nombre de lignes, rejected = lignes en erreur
- [ ] Page Grand Livre affiche les écritures (vérifier le compteur "X écr.")
- [ ] **Important** : si le GL a plus de 1000 entrées, vérifier que TOUTES s'affichent (test de la pagination)
- [ ] Vérification d'intégrité SHA-256 (bouton "Vérifier intégrité") → "Chaîne intacte"
- [ ] Suppression d'un import → écritures associées disparaissent

### 1.4 Import GL Tiers
- [ ] Page Imports Tiers accessible
- [ ] Drop **multiple** fichiers (Ctrl+clic) → liste des fichiers affichée dans le mapping
- [ ] Progress bar "fichier N/total" pendant l'import
- [ ] Rapport montre : `enriched > 0`, `unmatched` listées dans la Card "Lignes non rapprochées"
- [ ] Chaque ligne unmatched a 3 boutons (Rattacher / Ignorer / Supprimer)
- [ ] Clic sur **Rattacher** → modale de matching s'ouvre
- [ ] Drag-and-drop : drag la carte source sur une ligne GL → match effectué
- [ ] Filtres date/compte/tolérance fonctionnent (debounce visible)
- [ ] Suppression d'un import tiers → unmatched de cet import disparaissent

### 1.5 Dashboards
- [ ] Home : CA, EBE, Résultat, Trésorerie non-nuls après import GL complet
- [ ] Synthèse de gestion : "Vue d'ensemble" affiche le bilan
- [ ] Onglets "Santé entreprise" et "Alertes" chargent
- [ ] Catalogue de dashboards : liste 30+ dashboards
- [ ] Cliquer 5 dashboards au hasard → tous chargent sans erreur JS

### 1.6 États financiers
- [ ] Bilan : Actif total = Passif total
- [ ] Compte de Résultat : Résultat net = Produits − Charges
- [ ] SIG : VA, EBE, Résultat d'exploitation cohérents
- [ ] TAFIRE : tableau de financement présent
- [ ] Notes annexes : génération automatique

### 1.7 Budget & Variance
- [ ] Import budget Excel fonctionne
- [ ] Page Budget vs Actual affiche les écarts mois par mois
- [ ] Couleurs vert/rouge selon le signe de l'écart

### 1.8 Audit
- [ ] Aller dans Supabase Studio → table `fna_gl_audit_log`
- [ ] Vérifier qu'au moins un row a été inséré après l'import tiers
- [ ] Tous les rows ont un `audit_hash` non vide et un `previous_audit_hash` cohérent

## 2. Performance (org test à 50k écritures)

- [ ] Charger un GL de 50k+ écritures
- [ ] Mesurer le temps de chargement du dashboard Home (objectif < 5s)
- [ ] Mesurer le temps de calcul de la balance (objectif < 3s)
- [ ] Profiler React DevTools : aucun composant avec re-render > 100 cycles
- [ ] Mémoire : vérifier qu'on reste < 500 MB côté client

## 3. Sécurité

- [ ] User A ne peut PAS voir les données de user B (test croisé sur 2 comptes)
- [ ] RLS sur chaque table fna_* : SELECT/INSERT/UPDATE/DELETE testés
- [ ] Service role key uniquement dans Edge Functions (jamais en `VITE_*`)
- [ ] Headers de sécurité (CSP, X-Frame-Options, etc.) configurés sur Vercel
- [ ] Audit Lighthouse Security ≥ 90

## 4. Backup & disaster recovery

- [ ] Backups Supabase automatiques activés (Daily 7 jours minimum)
- [ ] Procédure de restore documentée et testée 1 fois
- [ ] Plan de contact Atlas Studio en cas d'incident prod

## 5. Onboarding pilote

Pour CHAQUE client pilote :
- [ ] Compte créé et activé
- [ ] Org créée avec son plan comptable
- [ ] Walkthrough en visio 30 min avec le client (présentation des features)
- [ ] Doc onboarding partagée (`docs/ONBOARDING_PILOTE.md`)
- [ ] Canal Slack/Discord dédié pour feedback rapide
- [ ] Formulaire de feedback hebdomadaire envoyé

## 6. Métriques à suivre pendant la beta

- Nombre d'imports réussis / échoués par jour
- Taux de lignes tiers enriched vs unmatched
- Temps moyen de chargement du dashboard Home
- Erreurs JS captées (Sentry ou équivalent)
- NPS hebdomadaire des pilotes

## 7. Critères Go/No-Go pour passer en GA

Avant ouverture publique, valider que :
- 100% des pilotes ont importé au moins un GL complet
- 0 incident critique non résolu sous 48h
- NPS moyen ≥ 7/10
- Pas de régression sur les 3 derniers déploiements
- Documentation utilisateur complète (au minimum : Onboarding, Imports, Dashboards, FAQ)

---

**Cette checklist est vivante** : ajouter/retirer des items au fur et à mesure
des retours pilotes. Une PR par mise à jour pour garder l'historique.
