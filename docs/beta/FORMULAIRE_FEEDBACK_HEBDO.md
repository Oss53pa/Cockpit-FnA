# Formulaire feedback hebdomadaire — Cockpit FnA Beta

À envoyer chaque **lundi matin** aux pilotes. À remplir en **3 minutes**.

Format recommandé : Google Forms ou Typeform (lien envoyé par email + canal pilote).

---

## Identité (1 question — pré-rempli)

1. **Votre nom + société**  
   → (champ pré-rempli par l'URL personnalisée envoyée chaque lundi)

## Usage de la semaine (2 questions)

2. **Combien de fois avez-vous ouvert Cockpit FnA cette semaine ?**  
   - 0 fois
   - 1 à 2 fois
   - 3 à 5 fois
   - 6+ fois

3. **Quelles fonctionnalités avez-vous utilisées cette semaine ?** (cocher toutes)
   - [ ] Import GL
   - [ ] Import GL Tiers
   - [ ] Dashboard Home
   - [ ] Bilan / Compte de Résultat / SIG
   - [ ] Synthèse de gestion
   - [ ] Catalogue de dashboards
   - [ ] Reporting (export Word/Excel/PDF)
   - [ ] Budget & Variance
   - [ ] Analyse analytique
   - [ ] Aucune (j'ai pas eu le temps)

## Qualité (2 questions)

4. **Sur une échelle de 1 à 10, recommanderiez-vous Cockpit FnA à un confrère / collègue ?** (NPS)
   - 1 (jamais) … 10 (absolument)

5. **Qu'est-ce qui vous a le plus FRUSTRÉ cette semaine ?** (champ libre, 2-3 phrases max)
   - ex : "L'import du GL a planté sur mon fichier Odoo"
   - ex : "Le bilan ne matche pas avec celui de SAGE"
   - ex : "RAS, ça roule"

## Roadmap (1 question)

6. **Quelle fonctionnalité MANQUANTE vous aiderait le plus dans les 2 prochaines semaines ?** (champ libre)
   - ex : "Export PDF mensuel automatique"
   - ex : "Comparaison N vs N-1 sur le CR"
   - ex : "Alertes email quand un ratio dépasse un seuil"

---

## Métriques à compiler chaque vendredi (côté Atlas Studio)

Depuis les réponses au formulaire de la semaine :

| Métrique | Cible week 1 | Cible week 4 |
|---|---|---|
| Taux de réponse au formulaire | ≥ 60% | ≥ 80% |
| NPS moyen | ≥ 6 | ≥ 7 |
| Pilotes actifs (≥ 3 ouvertures / semaine) | ≥ 40% | ≥ 80% |
| Bugs critiques signalés | < 3 nouveaux | 0 nouveau |
| Pilotes ayant importé un GL réel | ≥ 60% | 100% |

Si à week 2 le NPS < 5 ou < 50% d'actifs → **stop, retravailler le produit avant d'élargir**.

## Action items hebdo (côté Atlas Studio)

Chaque vendredi 17h :
1. Compiler les réponses dans `docs/beta/feedback-week-NN.md`
2. Trier les frustrations par fréquence (top 3)
3. Trier les demandes roadmap par fréquence (top 3)
4. Décider : fix immédiat / backlog / non prio
5. Communiquer aux pilotes : "On a entendu X, on l'attaque cette semaine"

Le silence d'Atlas Studio sur leurs feedbacks = mort de la beta. **Toujours répondre dans les 48h**, même si la réponse est "on l'a noté mais on ne le fera pas tout de suite parce que X".
