
/**
 * Knowledge Base — SYSCOHADA révisé 2017
 * Plan comptable, principes, écritures types, états financiers
 */
import type { SyscohadaKnowledgeChunk } from './types';

export const syscohadaKnowledge: SyscohadaKnowledgeChunk[] = [
  // ── Classes du plan comptable ──────────────────────────────────
  {
    id: 'sysco_classe1',
    category: 'plan_comptable',
    title: 'Classe 1 — Comptes de ressources durables',
    content: `Classe 1 du SYSCOHADA révisé : capital, réserves, emprunts, provisions durables, subventions d'investissement.
Comptes principaux :
- 10 Capital : 101 Capital social, 105 Primes d'émission
- 11 Réserves : 111 Réserve légale (10% du bénéfice jusqu'à 20% du capital), 112 Réserves statutaires
- 12 Report à nouveau : 121 RAN créditeur (bénéfice), 129 RAN débiteur (perte)
- 13 Résultat net de l'exercice : 131 Bénéfice, 139 Perte
- 14 Subventions d'investissement
- 15 Provisions réglementées et fonds assimilés
- 16 Emprunts et dettes assimilées : 161 Emprunts obligataires, 162 Emprunts bancaires
- 17 Dettes de crédit-bail et contrats assimilés
- 19 Provisions financières pour risques et charges`,
    legal_references: ['AUDCIF Art. 17-20', 'SYSCOHADA révisé Titre III'],
    keywords: ['classe 1', 'capital', 'réserves', 'emprunts', 'ressources durables', 'passif'],
  },
  {
    id: 'sysco_classe2',
    category: 'plan_comptable',
    title: 'Classe 2 — Comptes d\'actif immobilisé',
    content: `Classe 2 : charges immobilisées, immobilisations incorporelles, corporelles, financières.
- 20 Charges immobilisées : 201 Frais d'établissement, 202 Charges à répartir
- 21 Immobilisations incorporelles : 211 Brevets, 212 Logiciels, 213 Fonds commercial
- 22 Terrains : 221 Terrains agricoles, 222 Terrains bâtis, 223 Terrains nus
- 23 Bâtiments et aménagements : 231 Bâtiments, 232 Installations
- 24 Matériel : 241 MOIC, 244 Matériel informatique, 245 Matériel de transport
- 25 Avances et acomptes sur immobilisations
- 26 Titres de participation
- 27 Autres immobilisations financières
- 28 Amortissements (par symétrie : 281, 282, 283, 284...)
- 29 Dépréciations`,
    legal_references: ['AUDCIF Art. 28-30', 'SYSCOHADA révisé Titre III'],
    keywords: ['classe 2', 'immobilisations', 'actif immobilisé', 'amortissements', 'terrains', 'matériel'],
  },
  {
    id: 'sysco_classe3',
    category: 'plan_comptable',
    title: 'Classe 3 — Comptes de stocks',
    content: `Classe 3 : stocks et en-cours de production.
- 31 Marchandises
- 32 Matières premières et fournitures liées
- 33 Autres approvisionnements
- 34 Produits en cours
- 35 Services en cours
- 36 Produits finis
- 37 Produits intermédiaires et résiduels
- 38 Stocks en cours de route, en dépôt ou en consignation
- 39 Dépréciations des stocks
Méthodes de valorisation autorisées : CUMP, FIFO (PEPS). LIFO interdit par le SYSCOHADA révisé.`,
    legal_references: ['AUDCIF Art. 42-44', 'SYSCOHADA révisé Art. 44'],
    keywords: ['classe 3', 'stocks', 'marchandises', 'matières premières', 'CUMP', 'FIFO', 'inventaire'],
  },
  {
    id: 'sysco_classe4',
    category: 'plan_comptable',
    title: 'Classe 4 — Comptes de tiers',
    content: `Classe 4 : fournisseurs, clients, personnel, État, associés, débiteurs/créditeurs divers.
- 40 Fournisseurs et comptes rattachés : 401 Fournisseurs, 408 FAR
- 41 Clients et comptes rattachés : 411 Clients, 418 FAE
- 42 Personnel : 421 Rémunérations dues, 422 Avances au personnel
- 43 Organismes sociaux
- 44 État et collectivités : 441 État IS, 443 État TVA (4431 TVA facturée, 4432 TVA récupérable)
- 45 Organismes internationaux
- 46 Associés et groupe
- 47 Débiteurs et créditeurs divers
- 48 Créances et dettes HAO
- 49 Dépréciations et provisions pour risques sur tiers (491 clients douteux)`,
    legal_references: ['AUDCIF Art. 39-41'],
    keywords: ['classe 4', 'tiers', 'fournisseurs', 'clients', 'TVA', 'personnel', 'État'],
  },
  {
    id: 'sysco_classe5',
    category: 'plan_comptable',
    title: 'Classe 5 — Comptes de trésorerie',
    content: `Classe 5 : valeurs mobilières, banques, établissements financiers, caisse.
- 50 Titres de placement
- 51 Valeurs à encaisser
- 52 Banques : 521 Banques locales, 524 Banques hors UEMOA
- 53 Établissements financiers
- 56 Banques, crédits de trésorerie et d'escompte
- 57 Caisse : 571 Caisse siège, 572 Caisse succursale
- 58 Régies d'avances, accréditifs et virements internes
- 59 Dépréciations des titres de placement`,
    legal_references: ['AUDCIF Art. 45-47'],
    keywords: ['classe 5', 'trésorerie', 'banque', 'caisse', 'titre placement', 'virement'],
  },
  {
    id: 'sysco_classe6',
    category: 'plan_comptable',
    title: 'Classe 6 — Comptes de charges',
    content: `Classe 6 : charges des activités ordinaires et HAO.
- 60 Achats et variations de stocks
- 61 Transports
- 62 Services extérieurs A (locations, entretiens, assurances)
- 63 Services extérieurs B (rémunérations d'intermédiaires, honoraires, publicité)
- 64 Impôts et taxes
- 65 Autres charges : 651 Pertes sur créances, 654 Amendes fiscales
- 66 Charges de personnel : 661 Rémunérations, 664 Charges sociales
- 67 Frais financiers : 671 Intérêts emprunts, 676 Pertes de change
- 68 Dotations aux amortissements et provisions
- 69 Charges HAO : 691 VNC immobilisations cédées, 697 Dotations HAO`,
    legal_references: ['AUDCIF Art. 31', 'SYSCOHADA révisé'],
    keywords: ['classe 6', 'charges', 'achats', 'personnel', 'amortissements', 'frais financiers'],
  },
  {
    id: 'sysco_classe7',
    category: 'plan_comptable',
    title: 'Classe 7 — Comptes de produits',
    content: `Classe 7 : produits des activités ordinaires et HAO.
- 70 Ventes : 701 Ventes de marchandises, 702 Ventes de produits finis, 706 Services vendus
- 71 Subventions d'exploitation
- 72 Production immobilisée
- 73 Variations de stocks de produits finis et en-cours
- 75 Autres produits : 754 Indemnités d'assurance, 758 Produits divers
- 77 Revenus financiers : 771 Intérêts reçus, 776 Gains de change
- 78 Reprises de provisions et dépréciations
- 79 Produits HAO : 791 Produits de cession d'immobilisations, 798 Reprises HAO`,
    legal_references: ['AUDCIF Art. 31'],
    keywords: ['classe 7', 'produits', 'ventes', 'subventions', 'revenus financiers', 'cessions'],
  },
  {
    id: 'sysco_classe8',
    category: 'plan_comptable',
    title: 'Classe 8 — Comptes spéciaux',
    content: `Classe 8 : comptes de suivi des engagements hors bilan.
- 80 Comptes de résultat (usage interne pour la clôture)
- 81-87 Engagements hors bilan : cautions reçues/données, effets escomptés non échus
- 88 Résultat en instance d'affectation
Spécificité SYSCOHADA révisé : les engagements hors bilan sont désormais détaillés dans les notes annexes.`,
    legal_references: ['AUDCIF Art. 33-35', 'SYSCOHADA révisé 2017'],
    keywords: ['classe 8', 'hors bilan', 'engagements', 'résultat', 'clôture'],
  },

  // ── Principes comptables ───────────────────────────────────────
  {
    id: 'sysco_principes',
    category: 'principes_comptables',
    title: 'Les 10 principes comptables SYSCOHADA',
    content: `1. Prudence (Art. 3 AUDCIF) : enregistrer les pertes probables, pas les gains espérés
2. Permanence des méthodes (Art. 40) : continuité d'application des règles d'un exercice à l'autre
3. Correspondance bilan ouverture/clôture (Art. 34) : le bilan d'ouverture = bilan de clôture N-1
4. Coût historique (Art. 35) : évaluation au coût d'acquisition ou de production
5. Continuité d'exploitation (Art. 39) : l'entité est présumée poursuivre son activité
6. Indépendance des exercices (Art. 48) : rattacher charges et produits à l'exercice concerné
7. Intangibilité du bilan (Art. 34) : ne pas modifier le bilan d'ouverture
8. Importance significative (Art. 33) : appliquer les règles dès qu'un élément est significatif
9. Prééminence de la réalité sur l'apparence (Art. 6) : substance over form
10. Non-compensation (Art. 34) : ne pas compenser actifs/passifs ni charges/produits`,
    legal_references: ['AUDCIF Art. 3, 6, 33-35, 39-40, 48'],
    keywords: ['principes comptables', 'prudence', 'permanence', 'coût historique', 'continuité', 'AUDCIF'],
  },
  {
    id: 'sysco_etats_financiers',
    category: 'etats_financiers',
    title: 'États financiers obligatoires SYSCOHADA révisé',
    content: `Le SYSCOHADA révisé 2017 impose les états financiers annuels suivants :

Système Normal (CA ≥ seuil) :
1. Bilan (actif/passif) — Art. 29-30 AUDCIF
2. Compte de Résultat (par nature) — Art. 31
3. Tableau des Flux de Trésorerie (TFT, méthode directe) — nouveauté 2017
4. Tableau de Variation des Capitaux Propres — nouveauté 2017
5. Notes annexes (minimum 30 tableaux) — Art. 33-35

Système Allégé / SMT (CA < seuil) :
1. Bilan simplifié
2. Compte de Résultat simplifié
3. Notes annexes simplifiées

Le TAFIRE (Tableau Financier des Ressources et Emplois) est remplacé par le TFT en 2017.
Délai de dépôt : 4 mois après clôture de l'exercice.`,
    legal_references: ['AUDCIF Art. 8, 23, 29-35', 'SYSCOHADA révisé 2017 Art. 1-5'],
    keywords: ['états financiers', 'bilan', 'compte résultat', 'TAFIRE', 'TFT', 'notes annexes', 'liasse'],
  },

  // ── Écritures types courantes ──────────────────────────────────
  {
    id: 'sysco_ecriture_achat',
    category: 'ecritures_types',
    title: 'Écriture type — Achat de marchandises avec TVA',
    content: `Achat de marchandises à crédit avec TVA déductible :
D 601 Achats de marchandises ............ montant HT
D 4452 TVA récupérable sur achats ....... montant TVA
  C 401 Fournisseurs ..................... montant TTC

Règlement fournisseur :
D 401 Fournisseurs ...................... montant TTC
  C 521 Banque .......................... montant TTC

Note : le compte 4452 (État, TVA récupérable) est soldé lors de la déclaration TVA.`,
    legal_references: ['AUDCIF Art. 17', 'CGI-CI Art. 351'],
    examples_fcfa: 'Achat 1 000 000 HT + TVA 18% = 180 000 → TTC 1 180 000',
    keywords: ['achat', 'marchandises', 'TVA', 'fournisseur', 'écriture comptable'],
  },
  {
    id: 'sysco_ecriture_vente',
    category: 'ecritures_types',
    title: 'Écriture type — Vente de marchandises avec TVA',
    content: `Vente de marchandises à crédit avec TVA collectée :
D 411 Clients .......................... montant TTC
  C 701 Ventes de marchandises ......... montant HT
  C 4431 TVA facturée .................. montant TVA

Encaissement client :
D 521 Banque ........................... montant TTC
  C 411 Clients ........................ montant TTC`,
    legal_references: ['AUDCIF Art. 17'],
    examples_fcfa: 'Vente 5 000 000 HT + TVA 18% = 900 000 → TTC 5 900 000',
    keywords: ['vente', 'marchandises', 'TVA collectée', 'client', 'écriture comptable'],
  },
  {
    id: 'sysco_ecriture_salaires',
    category: 'ecritures_types',
    title: 'Écriture type — Comptabilisation des salaires',
    content: `1) Constatation des salaires bruts :
D 661 Rémunérations directes ........... salaire brut
  C 421 Personnel, rémunérations dues .. net à payer
  C 431 Sécurité sociale (part salariale) cotis. salarié
  C 447 État, impôts retenus (IRPP) .... retenue IRPP

2) Charges patronales :
D 664 Charges sociales ................. cotis. patronales
  C 431 Sécurité sociale ............... cotis. patronales

3) Paiement des salaires :
D 421 Personnel, rémunérations dues .... net à payer
  C 521 Banque ......................... net à payer`,
    legal_references: ['AUDCIF Art. 17', 'Code du travail OHADA'],
    examples_fcfa: 'Brut 500 000, cotis. salarié 35 000, IRPP 25 000, net 440 000',
    keywords: ['salaires', 'paie', 'cotisations', 'IRPP', 'charges sociales', 'rémunération'],
  },
  {
    id: 'sysco_ecriture_immobilisation',
    category: 'ecritures_types',
    title: "Écriture type — Acquisition d'immobilisation",
    content: `Acquisition d'un matériel informatique :
D 244 Matériel informatique ............ montant HT
D 4451 TVA récupérable sur immo ........ montant TVA
  C 401 Fournisseurs d'immobilisations . montant TTC

Amortissement en fin d'exercice (linéaire sur 3 ans) :
D 681 Dotations aux amortissements ..... annuité
  C 2844 Amort. matériel informatique .. annuité

Durées standard SYSCOHADA :
- Bâtiments : 20-25 ans
- Matériel industriel : 5-10 ans
- Matériel de transport : 4-5 ans
- Matériel informatique : 3-5 ans
- Mobilier : 5-10 ans`,
    legal_references: ['AUDCIF Art. 28-30, 45'],
    examples_fcfa: 'PC à 1 500 000 HT, amorti sur 3 ans = 500 000/an',
    keywords: ['immobilisation', 'amortissement', 'matériel', 'acquisition', 'dotation'],
  },
  {
    id: 'sysco_ecriture_provision',
    category: 'ecritures_types',
    title: 'Écriture type — Provision pour créances douteuses',
    content: `Constatation du risque client :
D 6594 Charges provisionnées - créances . montant provision
  C 491 Dépréciations clients ........... montant provision

Passage en perte (si irrécouvrabilité confirmée) :
D 651 Pertes sur créances clients ....... montant HT
D 4431 TVA collectée (si TVA reversée) .. montant TVA
D 491 Dépréciations clients ............. reprise provision
  C 411 Clients ......................... montant TTC
  C 7594 Reprises de charges provisionnées montant reprise

Règles SYSCOHADA : la provision est évaluée par client, en fonction de l'antériorité et des garanties.`,
    legal_references: ['AUDCIF Art. 46-48', 'SYSCOHADA révisé Art. 46'],
    keywords: ['provision', 'créance douteuse', 'client', 'dépréciation', 'irrécouvrabilité'],
  },
  {
    id: 'sysco_ecriture_tva',
    category: 'ecritures_types',
    title: 'Écriture type — Déclaration et paiement TVA',
    content: `Liquidation de la TVA (mensuelle) :
D 4431 TVA facturée (collectée) ......... total collecté
  C 4452 TVA récupérable sur achats ...... total déductible
  C 4441 État, TVA due (si TVA > 0) ...... solde à payer

Paiement de la TVA due :
D 4441 État, TVA due .................... montant
  C 521 Banque .......................... montant

Si crédit de TVA (déductible > collectée) :
D 4449 État, crédit de TVA à reporter ... crédit
D 4431 TVA facturée ..................... total collecté
  C 4452 TVA récupérable ................ total déductible`,
    legal_references: ['CGI-CI Art. 351-383', 'CGI-SN Art. 460'],
    keywords: ['TVA', 'déclaration', 'paiement', 'crédit TVA', 'collectée', 'déductible'],
  },
  {
    id: 'sysco_ecriture_creditbail',
    category: 'ecritures_types',
    title: 'Écriture type — Crédit-bail (leasing) SYSCOHADA révisé',
    content: `Le SYSCOHADA révisé 2017 impose la comptabilisation des contrats de crédit-bail à l'actif du preneur (substance over form).

1) Activation du bien en crédit-bail :
D 24x Matériel en crédit-bail .......... valeur du bien
  C 17x Dettes de crédit-bail .......... valeur actualisée des loyers

2) Paiement du loyer (part capital + intérêts) :
D 17x Dettes de crédit-bail ............ part capital
D 672 Intérêts crédit-bail .............. part intérêts
  C 521 Banque .......................... montant loyer

3) Amortissement annuel du bien :
D 681 Dotations aux amortissements ...... annuité
  C 28x Amortissement CB ................ annuité

Attention : les anciens SYSCOHADA traitaient le CB en charge (602).`,
    legal_references: ['SYSCOHADA révisé 2017 Art. 36-38', 'AUDCIF Art. 35'],
    keywords: ['crédit-bail', 'leasing', 'immobilisation', 'dette', 'substance over form'],
  },
  {
    id: 'sysco_ecriture_emprunt',
    category: 'ecritures_types',
    title: 'Écriture type — Emprunt bancaire',
    content: `Mise en place de l'emprunt :
D 521 Banque ........................... montant net
D 2011 Frais d'emprunt (si immobilisés)  frais
  C 162 Emprunts bancaires .............. montant brut

Remboursement d'échéance :
D 162 Emprunts bancaires ................ part capital
D 671 Intérêts des emprunts ............. intérêts
  C 521 Banque .......................... total échéance

En fin d'exercice, reclasser la part court terme :
D 162 Emprunts bancaires ................ part < 1 an
  C 163 Emprunts CT (ou 56x) ........... part < 1 an`,
    legal_references: ['AUDCIF Art. 20'],
    keywords: ['emprunt', 'banque', 'intérêts', 'remboursement', 'dette'],
  },
  {
    id: 'sysco_ecriture_cloture',
    category: 'ecritures_types',
    title: 'Écritures de clôture — Régularisations',
    content: `Charges Constatées d'Avance (CCA) :
D 476 CCA ............................. montant
  C 6xx Compte de charge .............. montant

Factures Non Parvenues (FNP) :
D 6xx Compte de charge ................ montant estimé
  C 408 Fournisseurs, FAR ............. montant estimé

Factures À Établir (FAE) :
D 418 Clients, produits non encore facturés montant
  C 7xx Compte de produit .............. montant

Produits Constatés d'Avance (PCA) :
D 7xx Compte de produit ................ montant
  C 477 PCA ............................ montant

Ces régularisations sont extournées à l'ouverture de l'exercice suivant.`,
    legal_references: ['AUDCIF Art. 48 (indépendance des exercices)'],
    keywords: ['clôture', 'CCA', 'FNP', 'FAE', 'PCA', 'régularisation', 'cut-off'],
  },

  // ── SIG et ratios ─────────────────────────────────────────────
  {
    id: 'sysco_sig',
    category: 'analyse_financiere',
    title: 'Soldes Intermédiaires de Gestion (SIG) SYSCOHADA',
    content: `Les SIG décomposent le résultat net en étapes :
1. Marge Commerciale = Ventes de marchandises - Coût d'achat des marchandises vendues
2. Production de l'exercice = Production vendue + stockée + immobilisée
3. Valeur Ajoutée = MC + PE - Consommation intermédiaire
4. Excédent Brut d'Exploitation (EBE) = VA + Subventions - Impôts & taxes - Charges personnel
5. Résultat d'Exploitation = EBE + Reprises - Dotations + Autres produits - Autres charges
6. Résultat Financier = Produits financiers - Charges financières
7. Résultat des Activités Ordinaires = RE + RF
8. Résultat HAO = Produits HAO - Charges HAO
9. Résultat Net = RAO + RHAO - Impôt sur le résultat

Ratios clés :
- Taux de marge = MC / Ventes marchandises
- Taux de VA = VA / (MC + PE)
- Productivité = VA / Effectif`,
    legal_references: ['SYSCOHADA révisé 2017', 'AUDCIF Art. 31'],
    keywords: ['SIG', 'marge commerciale', 'valeur ajoutée', 'EBE', 'résultat exploitation', 'ratios'],
  },
  {
    id: 'sysco_bilan_structure',
    category: 'analyse_financiere',
    title: 'Structure du bilan SYSCOHADA',
    content: `Le bilan SYSCOHADA est présenté en masse avec des sous-totaux significatifs :

ACTIF :
- Actif immobilisé (brut - amort/dépréc = net)
  - Immobilisations incorporelles (21)
  - Immobilisations corporelles (22-24)
  - Immobilisations financières (26-27)
- Actif circulant
  - Stocks (31-38)
  - Créances et emplois assimilés (40-47)
- Trésorerie-Actif (50-57)

PASSIF :
- Capitaux propres et ressources assimilées
  - Capital (10)
  - Réserves (11)
  - Report à nouveau (12)
  - Résultat net (13)
- Dettes financières et ressources assimilées (16-17)
- Passif circulant
  - Dettes fournisseurs et comptes rattachés (40)
  - Dettes fiscales et sociales (43-44)
- Trésorerie-Passif (56)

ÉQUILIBRE : Total Actif = Total Passif (obligatoire)`,
    legal_references: ['AUDCIF Art. 29-30'],
    keywords: ['bilan', 'actif', 'passif', 'capitaux propres', 'structure', 'équilibre'],
  },

  // ── Droit OHADA ───────────────────────────────────────────────
  {
    id: 'sysco_audcif',
    category: 'droit_ohada',
    title: "AUDCIF — Acte Uniforme relatif au Droit Comptable et à l'Information Financière",
    content: `L'AUDCIF est le texte fondateur de la comptabilité OHADA, adopté le 26 janvier 2017 à Brazzaville.
Il remplace l'ancien Acte Uniforme de 2000.

Points clés :
- S'applique à toute entité (personne physique ou morale) exerçant une activité économique dans l'espace OHADA
- Obligation de tenir des livres comptables : journal, grand livre, balance, inventaire
- Exercice comptable = 12 mois (1er janvier au 31 décembre sauf dérogation)
- Comptes annuels = bilan + compte de résultat + TFT + tableau variation CP + notes annexes
- Image fidèle : les comptes doivent refléter la réalité économique
- Nouveau : prise en compte des IFRS pour les entités cotées`,
    legal_references: ['AUDCIF Art. 1-8', 'Traité OHADA Art. 10'],
    keywords: ['AUDCIF', 'droit comptable', 'OHADA', 'acte uniforme', 'révisé 2017'],
  },
  {
    id: 'sysco_ohada_pays',
    category: 'droit_ohada',
    title: 'Les 17 pays de l\'espace OHADA',
    content: `L'Organisation pour l'Harmonisation en Afrique du Droit des Affaires regroupe 17 États :

Zone UEMOA (8 pays, monnaie XOF) :
1. Bénin (BJ) 2. Burkina Faso (BF) 3. Côte d'Ivoire (CI) 4. Guinée-Bissau (GW)
5. Mali (ML) 6. Niger (NE) 7. Sénégal (SN) 8. Togo (TG)

Zone CEMAC (6 pays, monnaie XAF) :
9. Cameroun (CM) 10. Centrafrique (CF) 11. Congo-Brazzaville (CG)
12. Gabon (GA) 13. Guinée Équatoriale (GQ) 14. Tchad (TD)

Autres membres :
15. Comores (KM, KMF) 16. Guinée (GN, GNF) 17. RD Congo (CD, CDF)

XOF et XAF sont à parité fixe (1 XOF = 1 XAF = 0,00152449 EUR).
Le SYSCOHADA s'applique uniformément dans les 17 pays.`,
    legal_references: ['Traité OHADA signé le 17 octobre 1993 à Port-Louis'],
    keywords: ['OHADA', 'pays', 'UEMOA', 'CEMAC', 'XOF', 'XAF', 'espace OHADA'],
  },

  // ── Écritures spéciales ──────────────────────────────────────
  {
    id: 'sysco_ecriture_affectation',
    category: 'ecritures_types',
    title: 'Écriture type — Affectation du résultat',
    content: `Cas bénéfice (solde créditeur du compte 131) :
D 131 Résultat net (bénéfice) .......... total bénéfice
  C 111 Réserve légale ................. 10% (max 20% capital)
  C 112 Réserves statutaires ........... selon statuts
  C 465 Associés, dividendes ........... dividendes votés
  C 121 Report à nouveau créditeur ..... solde

Cas perte (solde débiteur du compte 139) :
D 129 Report à nouveau débiteur ........ total perte
  C 139 Résultat net (perte) ........... total perte

L'AG doit affecter le résultat dans les 6 mois suivant la clôture.
Réserve légale : dotation obligatoire de 10% du bénéfice net, plafonnée à 20% du capital social.`,
    legal_references: ['AUSCGIE Art. 143-144, 346', 'AUDCIF Art. 34'],
    keywords: ['affectation', 'résultat', 'réserve légale', 'dividendes', 'report à nouveau', 'AG'],
  },
  {
    id: 'sysco_ecriture_inventaire',
    category: 'ecritures_types',
    title: 'Écriture type — Variation de stocks',
    content: `Méthode de l'inventaire intermittent (courante en OHADA) :

À la clôture — annulation du stock initial :
D 6031 Variation de stocks marchandises  stock initial
  C 31 Marchandises .................... stock initial

Constatation du stock final (après inventaire physique) :
D 31 Marchandises ...................... stock final
  C 6031 Variation de stocks ........... stock final

Si stock final > stock initial → le compte 603 a un solde créditeur → diminution des charges
Si stock final < stock initial → le compte 603 a un solde débiteur → augmentation des charges

Le coût d'achat des marchandises vendues = Achats + Variation de stocks (SI - SF)`,
    legal_references: ['AUDCIF Art. 42-44'],
    keywords: ['stocks', 'variation', 'inventaire', 'intermittent', 'clôture', 'marchandises'],
  },

  // Ajout comptes 9 (analytique)
  {
    id: 'sysco_classe9',
    category: 'plan_comptable',
    title: 'Classe 9 — Comptabilité analytique / de gestion',
    content: `La classe 9 est réservée à la comptabilité analytique d'exploitation (CAE).
Elle est facultative mais recommandée pour le suivi des coûts par centre de responsabilité.

- 90 Comptes réfléchis
- 91 Reclassement des charges
- 92 Centres d'analyse principaux
- 93 Coûts de production
- 94 Stocks analytiques
- 95 Coûts de distribution
- 96 Écarts sur coûts préétablis
- 97 Différences d'incorporation
- 98 Résultats analytiques
- 99 Liaisons internes

La classe 9 n'apparaît pas dans les états financiers officiels.
Elle sert au calcul des coûts de revient et à la prise de décision interne.`,
    legal_references: ['SYSCOHADA révisé 2017, Titre V'],
    keywords: ['classe 9', 'analytique', 'gestion', 'coûts', 'centres analyse', 'CAE'],
  },

  // ── FR, BFR, TN ──────────────────────────────────────────────
  {
    id: 'sysco_frbfr',
    category: 'analyse_financiere',
    title: 'Fonds de Roulement, BFR et Trésorerie Nette',
    content: `L'analyse de l'équilibre financier repose sur trois indicateurs :

1. Fonds de Roulement (FR) = Ressources stables - Emplois stables
   = (Capitaux propres + Dettes LT) - Actif immobilisé net
   FR > 0 : les ressources stables financent l'actif immobilisé + une marge

2. Besoin en Fonds de Roulement (BFR) = Actif circulant - Passif circulant
   = (Stocks + Créances clients + Autres créances) - (Dettes fournisseurs + Dettes fiscales/sociales)
   BFR positif = besoin de financement du cycle d'exploitation

3. Trésorerie Nette (TN) = FR - BFR = Trésorerie Actif - Trésorerie Passif
   TN > 0 : excédent de trésorerie
   TN < 0 : dépendance envers les concours bancaires

Interprétation :
- FR > BFR → trésorerie saine
- FR < BFR → tension de trésorerie, risque de cessation de paiement`,
    legal_references: ['SYSCOHADA révisé, Guide d\'application'],
    keywords: ['FR', 'BFR', 'trésorerie nette', 'fonds de roulement', 'équilibre financier'],
  },

  // ── CAF ───────────────────────────────────────────────────────
  {
    id: 'sysco_caf',
    category: 'analyse_financiere',
    title: 'Capacité d\'Autofinancement (CAF)',
    content: `La CAF mesure les ressources internes générées par l'activité.

Méthode additive (à partir du résultat net) :
CAF = Résultat net
  + Dotations aux amortissements et provisions (68)
  - Reprises sur provisions (78)
  + Valeur comptable nette des immobilisations cédées (691)
  - Produits de cession des immobilisations (791)
  - Quote-part de subventions virée au résultat (799)

Méthode soustractive (à partir de l'EBE) :
CAF = EBE
  + Autres produits d'exploitation encaissables
  - Autres charges d'exploitation décaissables
  + Produits financiers (sauf reprises)
  - Charges financières (sauf dotations)
  + Produits HAO encaissables
  - Charges HAO décaissables
  - Impôt sur le résultat

Autofinancement = CAF - Dividendes distribués`,
    legal_references: ['SYSCOHADA révisé 2017'],
    keywords: ['CAF', 'autofinancement', 'capacité', 'ressources', 'exploitation'],
  },
];
