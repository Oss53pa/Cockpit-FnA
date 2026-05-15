# Plan beta privée — 4 semaines

Plan opérationnel détaillé. Action quotidienne, métriques, critères Go/No-Go pour passer en GA.

## Avant le J0 — préparation (1 semaine)

- [ ] Compléter `BETA_LAUNCH_CHECKLIST.md` (toutes sections)
- [ ] Identifier **8-10 prospects** pilotes potentiels (objectif 5 acceptations)
  - Critères ICP : entreprise/cabinet SYSCOHADA (zone OHADA), 10-200 salariés, déjà sous SAGE/Odoo/PERFECTO, douleur reporting financier
- [ ] Préparer le pitch d'invitation (cf. `EMAIL_INVITATION_PILOTE.md`)
- [ ] Setup formulaire feedback (Google Forms ou Typeform, cf. `FORMULAIRE_FEEDBACK_HEBDO.md`)
- [ ] Créer canal pilotes (Slack/WhatsApp/Discord — privilégier WhatsApp si Afrique de l'Ouest, taux de réponse meilleur)
- [ ] Bloquer 5 créneaux d'onboarding visio (30 min chacun) sur la semaine 1
- [ ] Configurer la télémétrie (cf. `src/lib/telemetry.ts`) pour capturer les erreurs JS en prod
- [ ] Tester le workflow E2E manuel sur un compte de test (cf. `BETA_LAUNCH_CHECKLIST.md` §1)

## Semaine 1 — Onboarding (J0 à J7)

### Lundi J0
- [ ] Envoyer `EMAIL_INVITATION_PILOTE.md` aux 8-10 prospects (personnalisé)
- [ ] Setup canal pilotes + ajouter Atlas Studio + premiers acceptants
- [ ] Préparer slides onboarding visio (10 min product tour)

### Mardi-Vendredi J1-J4
- [ ] Réponse < 4h aux acceptants : envoyer `EMAIL_KICKOFF_PILOTE.md` + créneaux visio
- [ ] Onboarding visio chaque jour avec un pilote différent (30 min)
- [ ] **Pendant la visio** : faire l'import GL EN DIRECT avec le pilote sur ses données
- [ ] Vérifier que le bilan calculé matche celui de sa compta (ou identifier l'écart)
- [ ] Tagger chaque pilote avec son niveau d'engagement initial : 🟢 / 🟡 / 🔴

### Vendredi soir J4
- [ ] **Bilan week 0** : combien d'invités acceptés, combien onboardés, problèmes rencontrés à l'import
- [ ] Si < 3 pilotes onboardés → relancer 5 nouveaux prospects ce weekend

### Weekend J5-J6
- [ ] Fixer les bugs critiques rencontrés en onboarding (priorité absolue)
- [ ] Préparer le 1er formulaire feedback hebdo (envoi lundi J7)

## Semaine 2 — Premier feedback réel (J7 à J14)

### Lundi J7
- [ ] Envoyer formulaire feedback hebdo (cf. `FORMULAIRE_FEEDBACK_HEBDO.md`)
- [ ] Message canal : "Comment s'est passée votre 1re semaine ? Bugs ? Idées ?"

### Mardi-Jeudi J8-J10
- [ ] **Suivi proactif** : DM individuel à chaque pilote qui n'a pas ouvert l'app depuis 3+ jours
- [ ] Analyser les erreurs JS captées par la télémétrie chaque jour
- [ ] Répondre publiquement aux bugs/questions dans le canal (visibilité = confiance)

### Vendredi J11
- [ ] **Bilan week 1** : compiler les feedbacks dans `docs/beta/feedback-week-1.md`
  - Top 3 frustrations
  - Top 3 demandes roadmap
  - NPS moyen
  - Taux de pilotes actifs (≥ 3 ouvertures)
- [ ] **Décision** :
  - NPS ≥ 7 et ≥ 60% actifs → continuer
  - NPS < 5 ou < 30% actifs → **STOP** : retravailler avant week 3
  - Entre les deux → corriger top 3 frustrations cette semaine

### Weekend J12-J13
- [ ] Implémenter les top 3 fixes (frustrations critiques)
- [ ] Annoncer aux pilotes ce qui a été corrigé

## Semaine 3 — Adoption profonde (J14 à J21)

### Lundi J14
- [ ] Formulaire feedback hebdo (2/4)
- [ ] **Pousser les pilotes au-delà de l'import** : "cette semaine essayez le Reporting / Budget / Analytique"
- [ ] Demander à chaque pilote 1 cas d'usage spécifique qu'il aimerait voir traiter

### Mercredi J16
- [ ] **Visio courte de mi-beta** (15 min) avec chaque pilote actif :
  - Qu'est-ce qui marche bien ?
  - Qu'est-ce qui freine ?
  - Recommanderiez-vous ? Pourquoi pas ?
- [ ] Enregistrer (avec accord) pour analyse ultérieure

### Vendredi J18
- [ ] **Bilan week 2** : `docs/beta/feedback-week-2.md`
- [ ] Premier sentiment sur la commercialisation post-beta :
  - Combien des pilotes seraient prêts à payer ? À quel prix ?
  - Quel pricing tester en GA ?

## Semaine 4 — Préparation GA (J21 à J28)

### Lundi J21
- [ ] Formulaire feedback hebdo (3/4) — **focus pricing** : "à combien estimeriez-vous la valeur mensuelle de cet outil ?"
- [ ] Annonce dans le canal : "Beta se termine le {{DATE_FIN}}, on prépare la GA"

### Mardi-Jeudi J22-J24
- [ ] **Walkthrough qualité** : passer en revue les 30+ dashboards avec un œil neuf, fixer les bugs visuels mineurs
- [ ] **Documentation utilisateur** : créer 2-3 tutos vidéo courts (3-5 min chacun)
  - "Importer son GL en 5 min"
  - "Comprendre son Bilan SYSCOHADA"
  - "Personnaliser un dashboard"
- [ ] Préparer le pricing GA et les CGV

### Vendredi J25
- [ ] **Bilan week 3** + **bilan beta globale** :
  - NPS final moyen
  - Taux de pilotes prêts à payer
  - Top 5 demandes roadmap pour post-GA
  - Liste des bugs résiduels (non critiques)

### Weekend J26-J27
- [ ] Préparer l'annonce GA
- [ ] Préparer le funnel d'acquisition (landing page, ads ?)

### Lundi J28 — fin de beta
- [ ] **Email de remerciement** aux pilotes + offre exclusive "early-adopter" (3 mois offerts comme promis)
- [ ] **Décision Go/No-Go GA** sur la base des critères ci-dessous

## Critères Go/No-Go pour GA

### 🟢 GO si TOUS ces critères sont remplis :
- [ ] NPS moyen final ≥ 7
- [ ] ≥ 60% des pilotes prêts à payer dès la GA
- [ ] ≥ 3 pilotes ont importé au moins 1 GL complet avec succès
- [ ] 0 bug critique non résolu depuis > 7 jours
- [ ] Documentation utilisateur publiable
- [ ] Pricing testé avec au moins 2 prospects extérieurs aux pilotes
- [ ] Procédure de support post-GA définie (SLA, canal, équipe)

### 🟡 GO partiel (release contrôlée) si :
- NPS entre 5 et 7 → ouvrir sur invitations uniquement (waitlist)
- Pas encore de docs vidéo → repousser de 2 semaines

### 🔴 NO-GO si UN de ces critères :
- NPS < 5 → retravailler le produit, pas la commercialisation
- < 3 pilotes ont vraiment utilisé l'outil
- Bug critique non résolu (perte de données, sécurité)
- Pas de plan support post-GA

## Risques identifiés + plans de mitigation

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| < 3 pilotes acceptent l'invitation | Moyenne | Élevé | Avoir 10 prospects en pipe au lieu de 5 |
| Pilote rencontre bug bloquant au 1er import | Élevée | Critique | Onboarding visio EN DIRECT (pas en autonomie) |
| Pilotes oublient d'utiliser après J3 | Très élevée | Élevé | DM individuel + canal animé tous les jours |
| Données client perdues / corrompues | Faible | Catastrophique | Backups Supabase quotidiens + canal "incident < 1h" |
| Pilote partage publiquement avant GA | Faible | Moyen | NDA léger inclus à l'invitation |
| Bug RLS expose les données entre pilotes | Très faible | Catastrophique | Tests RLS croisés en semaine 0 (cf. checklist §3) |

## Post-beta — transition GA

Semaine J29-J35 :
- [ ] Email "beta terminée, voici votre lien d'achat preferential"
- [ ] Activation des 3 mois offerts pour les pilotes restants
- [ ] Lancement public (selon Go/No-Go)
- [ ] Communication post-launch (LinkedIn, communiqué de presse, partenaires)
