# Cockpit FnA — Guide d'onboarding pilote

Bienvenue dans la beta privée de **Cockpit FnA**, votre cockpit de pilotage
financier SYSCOHADA révisé 2017. Ce guide vous accompagne dans la prise en
main en 30 minutes.

## 1. Création de votre compte

1. Accédez à `https://votre-instance.cockpit-fna.com/signup`
2. Renseignez :
   - Votre **email professionnel**
   - **Nom complet** (la personne)
   - **Nom de l'entreprise** (la société qui sera gérée — distinct du nom de la personne)
   - Un mot de passe robuste
3. Validez votre email via le lien reçu
4. Connectez-vous

## 2. Configuration de votre société (5 min)

Allez dans **Paramètres → Sociétés** et complétez :

- **Raison sociale** : nom légal de l'entreprise
- **Secteur** : votre secteur d'activité (impacte certains KPI sectoriels)
- **Devise** : XOF (FCFA), XAF, EUR, USD, etc.
- **Plan comptable** : 
  - `SYSCOHADA` (défaut, Afrique de l'Ouest)
  - `PCG_FR` (France)
  - `IFRS` ou `US_GAAP` (référentiels internationaux)
- **RCCM** et **IFU/NIF** : pour les états réglementaires

## 3. Import de votre Grand Livre (10 min)

1. Allez dans **Imports**
2. Déposez votre fichier (CSV, XLSX, XLS) — exports SAGE/PERFECTO/Odoo/CEGID supportés
3. Vérifiez le **mapping automatique** des colonnes (Date, Compte, Débit, Crédit, etc.)
4. Cliquez sur **Lancer l'import**
5. Vérifiez le rapport :
   - **Lignes importées** : ce que le système a accepté
   - **Lignes rejetées** : à corriger dans votre source
   - **Périodes** créées automatiquement

> 💡 **Astuce** : si votre balance ne s'équilibre pas après import, utilisez
> le bouton **Auditer le GL** sur la page Grand Livre. Il détecte :
> écarts débit/crédit, pièces déséquilibrées, comptes inconnus, doublons.

## 4. Import du GL Tiers (optionnel, 5 min)

Le GL Tiers **complète** le Grand Livre en ajoutant le détail des
clients/fournisseurs sur les comptes collectifs (401, 411, etc.).

1. Allez dans **Imports Tiers**
2. Sélectionnez vos fichiers (vous pouvez en glisser **plusieurs** d'un coup :
   clients, fournisseurs, personnel…)
3. Vérifiez le mapping (auto-détecté sur le 1er fichier)
4. Lancez l'import
5. Le rapport affiche :
   - **GL enrichies** : nombre d'écritures qui ont reçu un code tiers
   - **Non rapprochées** : lignes sans correspondance GL → à arbitrer

### Arbitrage des lignes non rapprochées

Pour chaque ligne :
- 🔗 **Rattacher** : ouvre une modale pour choisir manuellement l'écriture GL
  cible (recherche par date/compte/montant + drag-and-drop)
- ✅ **Ignorer** : marque comme traitée sans action
- 🗑 **Supprimer** : supprime définitivement

## 5. Explorer les dashboards (10 min)

- **Home** : KPI principaux (CA, EBE, Résultat, Trésorerie)
- **Synthèse de gestion** : Bilan + CR + SIG en un coup d'œil
- **Catalogue de dashboards** : 30+ vues SYSCOHADA prêtes à l'emploi
- **Reporting** : 13 modèles personnalisables (Word, Excel, PDF)
- **Budget & Variance** : suivi mensuel des écarts vs budget

## 6. Donnez-nous vos retours

Vous êtes dans une **beta privée** : votre feedback façonne le produit.

- **Slack/Discord** : `#cockpit-fna-pilotes`
- **Email** : `pilotes@atlas-studio.app`
- **Formulaire hebdo** : envoyé chaque lundi

### Ce qu'on veut savoir

1. Quelle fonctionnalité utilisez-vous le plus ?
2. Quelle fonctionnalité ne marche pas / pas comme attendu ?
3. Sur une échelle de 1 à 10, recommanderiez-vous Cockpit FnA à un confrère ?
4. Qu'est-ce qui manque le plus à votre workflow ?

## FAQ rapide

**Q. Mes données sont-elles isolées ?**
R. Oui. Multi-tenant strict via Row Level Security Supabase + chiffrement
TLS. Chaque société voit uniquement ses propres données.

**Q. Puis-je inviter un collaborateur ?**
R. Oui via **Paramètres → Membres**. Trois rôles : admin, editor, viewer.

**Q. Que se passe-t-il si je supprime un import ?**
R. Toutes les écritures associées à cet import sont supprimées (cascade).
Aucun impact sur les autres imports.

**Q. Y a-t-il un mode démo ?**
R. Oui : `/demo`. Données factices, aucune persistance — pour tester sans
risque.

**Q. SLA ?**
R. Pendant la beta : best-effort. Disponibilité visée 99% en GA.

---

**Vous êtes prêt.** Importez votre 1er GL et explorez. Si quelque chose
bloque, le canal pilote est là — réponse sous 4h ouvrées.
