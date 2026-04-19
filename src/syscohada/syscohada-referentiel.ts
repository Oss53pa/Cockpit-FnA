/**
 * Referentiel SYSCOHADA revisé — Classes, Categories, Sous-comptes
 * Conforme à l'Acte Uniforme OHADA 2017
 */

// ============================================================================
// TYPES
// ============================================================================

export type NatureSYSCOHADA = 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT' | 'SPECIAL';
export type SensNormal = 'DEBITEUR' | 'CREDITEUR';

export interface ClasseSYSCOHADA {
  code: number;
  libelle: string;
  icon: string; // Lucide icon name
  nature: NatureSYSCOHADA;
  sensNormal: SensNormal;
  type: 'bilan' | 'gestion' | 'special' | 'analytique';
}

export interface CategorieSYSCOHADA {
  code: string; // 2 chiffres
  libelle: string;
  classeCode: number;
  nature?: NatureSYSCOHADA;
  sensNormal?: SensNormal;
  /** true si nature/sens doivent etre demandés à l'utilisateur */
  sensVariable?: boolean;
}

export interface SousCompteSYSCOHADA {
  code: string; // 3 chiffres
  libelle: string;
  categorieCode: string; // 2 chiffres parent
}

// ============================================================================
// CLASSES (1-9)
// ============================================================================

export const CLASSES_SYSCOHADA: ClasseSYSCOHADA[] = [
  { code: 1, libelle: 'Ressources Durables', icon: 'Landmark', nature: 'PASSIF', sensNormal: 'CREDITEUR', type: 'bilan' },
  { code: 2, libelle: 'Actif Immobilisé', icon: 'Building2', nature: 'ACTIF', sensNormal: 'DEBITEUR', type: 'bilan' },
  { code: 3, libelle: 'Stocks', icon: 'Package', nature: 'ACTIF', sensNormal: 'DEBITEUR', type: 'bilan' },
  { code: 4, libelle: 'Tiers', icon: 'Users', nature: 'ACTIF', sensNormal: 'DEBITEUR', type: 'bilan' },
  { code: 5, libelle: 'Trésorerie', icon: 'Wallet', nature: 'ACTIF', sensNormal: 'DEBITEUR', type: 'bilan' },
  { code: 6, libelle: 'Charges', icon: 'TrendingDown', nature: 'CHARGE', sensNormal: 'DEBITEUR', type: 'gestion' },
  { code: 7, libelle: 'Produits', icon: 'TrendingUp', nature: 'PRODUIT', sensNormal: 'CREDITEUR', type: 'gestion' },
  { code: 8, libelle: 'Autres Charges & Produits', icon: 'FileStack', nature: 'SPECIAL', sensNormal: 'CREDITEUR', type: 'special' },
  { code: 9, libelle: 'Engagements & Analytique', icon: 'BarChart3', nature: 'SPECIAL', sensNormal: 'DEBITEUR', type: 'analytique' },
];

// ============================================================================
// CATEGORIES (2 chiffres) par classe
// ============================================================================

export const CATEGORIES_SYSCOHADA: CategorieSYSCOHADA[] = [
  // CLASSE 1 — Ressources Durables
  { code: '10', libelle: 'Capital', classeCode: 1 },
  { code: '11', libelle: 'Réserves', classeCode: 1 },
  { code: '12', libelle: 'Report à nouveau', classeCode: 1 },
  { code: '13', libelle: 'Résultat net de l\'exercice', classeCode: 1 },
  { code: '14', libelle: 'Subventions d\'investissement', classeCode: 1 },
  { code: '15', libelle: 'Provisions réglementées', classeCode: 1 },
  { code: '16', libelle: 'Emprunts et dettes assimilées', classeCode: 1 },
  { code: '17', libelle: 'Dettes de crédit-bail', classeCode: 1 },
  { code: '18', libelle: 'Dettes liées à des participations', classeCode: 1 },
  { code: '19', libelle: 'Provisions financières pour risques', classeCode: 1 },

  // CLASSE 2 — Actif Immobilisé
  { code: '20', libelle: 'Charges immobilisées', classeCode: 2 },
  { code: '21', libelle: 'Immobilisations incorporelles', classeCode: 2 },
  { code: '22', libelle: 'Terrains', classeCode: 2 },
  { code: '23', libelle: 'Bâtiments et installations', classeCode: 2 },
  { code: '24', libelle: 'Matériel', classeCode: 2 },
  { code: '25', libelle: 'Avances sur immobilisations', classeCode: 2 },
  { code: '26', libelle: 'Titres de participation', classeCode: 2 },
  { code: '27', libelle: 'Autres immobilisations financières', classeCode: 2 },
  { code: '28', libelle: 'Amortissements', classeCode: 2, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '29', libelle: 'Provisions pour dépréciation', classeCode: 2, nature: 'PASSIF', sensNormal: 'CREDITEUR' },

  // CLASSE 3 — Stocks
  { code: '31', libelle: 'Marchandises', classeCode: 3 },
  { code: '32', libelle: 'Matières premières', classeCode: 3 },
  { code: '33', libelle: 'Autres approvisionnements', classeCode: 3 },
  { code: '34', libelle: 'Produits en cours', classeCode: 3 },
  { code: '35', libelle: 'Services en cours', classeCode: 3 },
  { code: '36', libelle: 'Produits finis', classeCode: 3 },
  { code: '37', libelle: 'Produits intermédiaires et résiduels', classeCode: 3 },
  { code: '38', libelle: 'Stocks en cours de route', classeCode: 3 },
  { code: '39', libelle: 'Dépréciations des stocks', classeCode: 3, nature: 'PASSIF', sensNormal: 'CREDITEUR' },

  // CLASSE 4 — Tiers
  { code: '40', libelle: 'Fournisseurs et comptes rattachés', classeCode: 4, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '41', libelle: 'Clients et comptes rattachés', classeCode: 4, nature: 'ACTIF', sensNormal: 'DEBITEUR' },
  { code: '42', libelle: 'Personnel', classeCode: 4, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '43', libelle: 'Organismes sociaux', classeCode: 4, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '44', libelle: 'État et collectivités publiques', classeCode: 4, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '45', libelle: 'Organismes internationaux', classeCode: 4, sensVariable: true },
  { code: '46', libelle: 'Associés et groupe', classeCode: 4, sensVariable: true },
  { code: '47', libelle: 'Débiteurs et créditeurs divers', classeCode: 4, sensVariable: true },
  { code: '48', libelle: 'Créances et dettes HAO', classeCode: 4, sensVariable: true },
  { code: '49', libelle: 'Dépréciations et risques (tiers)', classeCode: 4, nature: 'PASSIF', sensNormal: 'CREDITEUR' },

  // CLASSE 5 — Trésorerie
  { code: '50', libelle: 'Titres de placement', classeCode: 5 },
  { code: '51', libelle: 'Valeurs à encaisser', classeCode: 5 },
  { code: '52', libelle: 'Banques', classeCode: 5 },
  { code: '53', libelle: 'Établissements financiers', classeCode: 5 },
  { code: '54', libelle: 'Instruments de trésorerie', classeCode: 5 },
  { code: '56', libelle: 'Banques, crédits de trésorerie', classeCode: 5, nature: 'PASSIF', sensNormal: 'CREDITEUR' },
  { code: '57', libelle: 'Caisse', classeCode: 5 },
  { code: '58', libelle: 'Régies d\'avances et virements internes', classeCode: 5 },
  { code: '59', libelle: 'Dépréciations des titres de placement', classeCode: 5, nature: 'PASSIF', sensNormal: 'CREDITEUR' },

  // CLASSE 6 — Charges
  { code: '60', libelle: 'Achats et variations de stocks', classeCode: 6 },
  { code: '61', libelle: 'Transports', classeCode: 6 },
  { code: '62', libelle: 'Services extérieurs', classeCode: 6 },
  { code: '63', libelle: 'Autres services extérieurs', classeCode: 6 },
  { code: '64', libelle: 'Impôts et taxes', classeCode: 6 },
  { code: '65', libelle: 'Autres charges', classeCode: 6 },
  { code: '66', libelle: 'Charges de personnel', classeCode: 6 },
  { code: '67', libelle: 'Frais financiers', classeCode: 6 },
  { code: '68', libelle: 'Dotations aux amortissements', classeCode: 6 },
  { code: '69', libelle: 'Dotations aux provisions', classeCode: 6 },

  // CLASSE 7 — Produits
  { code: '70', libelle: 'Ventes', classeCode: 7 },
  { code: '71', libelle: 'Subventions d\'exploitation', classeCode: 7 },
  { code: '72', libelle: 'Production immobilisée', classeCode: 7 },
  { code: '73', libelle: 'Variations de stocks de produits', classeCode: 7 },
  { code: '75', libelle: 'Autres produits', classeCode: 7 },
  { code: '77', libelle: 'Revenus financiers', classeCode: 7 },
  { code: '78', libelle: 'Transferts de charges', classeCode: 7 },
  { code: '79', libelle: 'Reprises de provisions', classeCode: 7 },

  // CLASSE 8 — Autres charges & produits
  { code: '81', libelle: 'Valeurs comptables cessions immo.', classeCode: 8, nature: 'CHARGE', sensNormal: 'DEBITEUR' },
  { code: '82', libelle: 'Produits des cessions d\'immo.', classeCode: 8, nature: 'PRODUIT', sensNormal: 'CREDITEUR' },
  { code: '83', libelle: 'Charges HAO', classeCode: 8, nature: 'CHARGE', sensNormal: 'DEBITEUR' },
  { code: '84', libelle: 'Produits HAO', classeCode: 8, nature: 'PRODUIT', sensNormal: 'CREDITEUR' },
  { code: '85', libelle: 'Dotations HAO', classeCode: 8, nature: 'CHARGE', sensNormal: 'DEBITEUR' },
  { code: '86', libelle: 'Reprises HAO', classeCode: 8, nature: 'PRODUIT', sensNormal: 'CREDITEUR' },
  { code: '87', libelle: 'Participation des travailleurs', classeCode: 8, nature: 'CHARGE', sensNormal: 'DEBITEUR' },
  { code: '88', libelle: 'Subventions d\'équilibre', classeCode: 8, nature: 'PRODUIT', sensNormal: 'CREDITEUR' },
  { code: '89', libelle: 'Impôts sur le résultat', classeCode: 8, nature: 'CHARGE', sensNormal: 'DEBITEUR' },

  // CLASSE 9 — Engagements & Analytique
  { code: '90', libelle: 'Engagements obtenus et accordés', classeCode: 9, sensVariable: true },
  { code: '91', libelle: 'Comptes de reclassement', classeCode: 9, sensVariable: true },
  { code: '92', libelle: 'Centres d\'analyse', classeCode: 9, sensVariable: true },
  { code: '93', libelle: 'Coûts des matières', classeCode: 9, sensVariable: true },
  { code: '94', libelle: 'Coûts des produits', classeCode: 9, sensVariable: true },
  { code: '95', libelle: 'Coûts des produits en cours', classeCode: 9, sensVariable: true },
  { code: '96', libelle: 'Écarts sur coûts préétablis', classeCode: 9, sensVariable: true },
  { code: '97', libelle: 'Résultats analytiques', classeCode: 9, sensVariable: true },
  { code: '98', libelle: 'Comptes de liaison', classeCode: 9, sensVariable: true },
];

// ============================================================================
// SOUS-COMPTES (3 chiffres) par catégorie
// ============================================================================

export const SOUS_COMPTES_SYSCOHADA: SousCompteSYSCOHADA[] = [
  // === CLASSE 1 ===
  // 10 - Capital
  { code: '101', libelle: 'Capital social', categorieCode: '10' },
  { code: '102', libelle: 'Capital personnel', categorieCode: '10' },
  { code: '103', libelle: 'Capital par dotation', categorieCode: '10' },
  { code: '104', libelle: 'Compte de l\'exploitant', categorieCode: '10' },
  { code: '105', libelle: 'Primes liées au capital', categorieCode: '10' },
  { code: '106', libelle: 'Écarts de réévaluation', categorieCode: '10' },
  { code: '109', libelle: 'Actionnaires, capital souscrit non appelé', categorieCode: '10' },
  // 11 - Réserves
  { code: '111', libelle: 'Réserve légale', categorieCode: '11' },
  { code: '112', libelle: 'Réserves statutaires ou contractuelles', categorieCode: '11' },
  { code: '113', libelle: 'Réserves réglementées', categorieCode: '11' },
  { code: '118', libelle: 'Autres réserves', categorieCode: '11' },
  // 12 - Report à nouveau
  { code: '121', libelle: 'Report à nouveau créditeur', categorieCode: '12' },
  { code: '129', libelle: 'Report à nouveau débiteur', categorieCode: '12' },
  // 13 - Résultat
  { code: '130', libelle: 'Résultat en instance d\'affectation', categorieCode: '13' },
  { code: '131', libelle: 'Résultat net : bénéfice', categorieCode: '13' },
  { code: '139', libelle: 'Résultat net : perte', categorieCode: '13' },
  // 14 - Subventions
  { code: '141', libelle: 'Subventions d\'équipement', categorieCode: '14' },
  { code: '142', libelle: 'Subventions inscrites au CPC', categorieCode: '14' },
  { code: '148', libelle: 'Autres subventions d\'investissement', categorieCode: '14' },
  // 15 - Provisions réglementées
  { code: '151', libelle: 'Amortissements dérogatoires', categorieCode: '15' },
  { code: '152', libelle: 'Plus-values réinvesties', categorieCode: '15' },
  { code: '155', libelle: 'Provisions réglementées', categorieCode: '15' },
  { code: '156', libelle: 'Provisions pour reconstitution', categorieCode: '15' },
  // 16 - Emprunts
  { code: '161', libelle: 'Emprunts obligataires', categorieCode: '16' },
  { code: '162', libelle: 'Emprunts et dettes auprès des ét. de crédit', categorieCode: '16' },
  { code: '163', libelle: 'Avances reçues de l\'État', categorieCode: '16' },
  { code: '164', libelle: 'Avances reçues et comptes courants bloqués', categorieCode: '16' },
  { code: '165', libelle: 'Dépôts et cautionnements reçus', categorieCode: '16' },
  { code: '166', libelle: 'Intérêts courus', categorieCode: '16' },
  { code: '168', libelle: 'Autres emprunts et dettes', categorieCode: '16' },
  // 17 - Crédit-bail
  { code: '171', libelle: 'Emprunts crédit-bail immobilier', categorieCode: '17' },
  { code: '172', libelle: 'Emprunts crédit-bail mobilier', categorieCode: '17' },
  // 18 - Participations
  { code: '181', libelle: 'Dettes liées à des participations (groupe)', categorieCode: '18' },
  { code: '182', libelle: 'Dettes liées à des participations (hors groupe)', categorieCode: '18' },
  { code: '186', libelle: 'Comptes de liaison charges', categorieCode: '18' },
  { code: '187', libelle: 'Comptes de liaison produits', categorieCode: '18' },
  // 19 - Provisions financières
  { code: '191', libelle: 'Provisions pour litiges', categorieCode: '19' },
  { code: '192', libelle: 'Provisions pour garanties clients', categorieCode: '19' },
  { code: '193', libelle: 'Provisions pour pertes sur marchés', categorieCode: '19' },
  { code: '194', libelle: 'Provisions pour pertes de change', categorieCode: '19' },
  { code: '195', libelle: 'Provisions pour impôts', categorieCode: '19' },
  { code: '196', libelle: 'Provisions pour pensions', categorieCode: '19' },
  { code: '197', libelle: 'Provisions pour charges à répartir', categorieCode: '19' },
  { code: '198', libelle: 'Autres provisions financières', categorieCode: '19' },

  // === CLASSE 2 ===
  // 20 - Charges immobilisées
  { code: '201', libelle: 'Frais d\'établissement', categorieCode: '20' },
  { code: '202', libelle: 'Charges à répartir sur plusieurs exercices', categorieCode: '20' },
  { code: '206', libelle: 'Primes de remboursement des obligations', categorieCode: '20' },
  // 21 - Immobilisations incorporelles
  { code: '211', libelle: 'Frais de recherche et développement', categorieCode: '21' },
  { code: '212', libelle: 'Brevets, licences, concessions', categorieCode: '21' },
  { code: '213', libelle: 'Fonds commercial', categorieCode: '21' },
  { code: '214', libelle: 'Logiciels', categorieCode: '21' },
  { code: '215', libelle: 'Marques', categorieCode: '21' },
  { code: '216', libelle: 'Droit au bail', categorieCode: '21' },
  { code: '217', libelle: 'Investissements de création', categorieCode: '21' },
  { code: '218', libelle: 'Autres droits et valeurs incorporels', categorieCode: '21' },
  { code: '219', libelle: 'Immobilisations incorporelles en cours', categorieCode: '21' },
  // 22 - Terrains
  { code: '221', libelle: 'Terrains agricoles et forestiers', categorieCode: '22' },
  { code: '222', libelle: 'Terrains nus', categorieCode: '22' },
  { code: '223', libelle: 'Terrains bâtis', categorieCode: '22' },
  { code: '224', libelle: 'Travaux de mise en valeur des terrains', categorieCode: '22' },
  { code: '225', libelle: 'Terrains de gisement', categorieCode: '22' },
  { code: '226', libelle: 'Terrains aménagés', categorieCode: '22' },
  { code: '228', libelle: 'Autres terrains', categorieCode: '22' },
  // 23 - Bâtiments
  { code: '231', libelle: 'Bâtiments industriels', categorieCode: '23' },
  { code: '232', libelle: 'Bâtiments commerciaux', categorieCode: '23' },
  { code: '233', libelle: 'Bâtiments administratifs et sociaux', categorieCode: '23' },
  { code: '234', libelle: 'Installations techniques', categorieCode: '23' },
  { code: '235', libelle: 'Aménagements de bureaux', categorieCode: '23' },
  { code: '238', libelle: 'Autres installations et agencements', categorieCode: '23' },
  { code: '239', libelle: 'Bâtiments en cours', categorieCode: '23' },
  // 24 - Matériel
  { code: '241', libelle: 'Matériel et outillage industriel', categorieCode: '24' },
  { code: '242', libelle: 'Matériel et outillage agricole', categorieCode: '24' },
  { code: '243', libelle: 'Matériel d\'emballage récupérable', categorieCode: '24' },
  { code: '244', libelle: 'Matériel et mobilier de bureau', categorieCode: '24' },
  { code: '245', libelle: 'Matériel de transport', categorieCode: '24' },
  { code: '246', libelle: 'Immobilisations animales et agricoles', categorieCode: '24' },
  { code: '248', libelle: 'Autres matériels', categorieCode: '24' },
  { code: '249', libelle: 'Matériel en cours', categorieCode: '24' },
  // 25 - Avances
  { code: '251', libelle: 'Avances sur immobilisations incorporelles', categorieCode: '25' },
  { code: '252', libelle: 'Avances sur immobilisations corporelles', categorieCode: '25' },
  // 26 - Titres de participation
  { code: '261', libelle: 'Titres de participation (groupe)', categorieCode: '26' },
  { code: '262', libelle: 'Titres de participation (hors groupe)', categorieCode: '26' },
  { code: '265', libelle: 'Titres de participation dans organismes', categorieCode: '26' },
  { code: '266', libelle: 'Créances rattachées à des participations', categorieCode: '26' },
  // 27 - Autres immo financières
  { code: '271', libelle: 'Prêts et créances non commerciales', categorieCode: '27' },
  { code: '272', libelle: 'Prêts au personnel', categorieCode: '27' },
  { code: '274', libelle: 'Titres immobilisés', categorieCode: '27' },
  { code: '275', libelle: 'Dépôts et cautionnements versés', categorieCode: '27' },
  { code: '276', libelle: 'Intérêts courus', categorieCode: '27' },
  { code: '277', libelle: 'Actions propres', categorieCode: '27' },
  // 28 - Amortissements
  { code: '281', libelle: 'Amort. immobilisations incorporelles', categorieCode: '28' },
  { code: '282', libelle: 'Amort. terrains', categorieCode: '28' },
  { code: '283', libelle: 'Amort. bâtiments et installations', categorieCode: '28' },
  { code: '284', libelle: 'Amort. matériel', categorieCode: '28' },
  { code: '285', libelle: 'Amort. matériel de transport', categorieCode: '28' },
  // 29 - Provisions dépréciation immo
  { code: '291', libelle: 'Prov. dépréciation immo. incorporelles', categorieCode: '29' },
  { code: '292', libelle: 'Prov. dépréciation terrains', categorieCode: '29' },
  { code: '293', libelle: 'Prov. dépréciation bâtiments', categorieCode: '29' },
  { code: '294', libelle: 'Prov. dépréciation matériel', categorieCode: '29' },
  { code: '295', libelle: 'Prov. dépréciation titres de participation', categorieCode: '29' },
  { code: '296', libelle: 'Prov. dépréciation autres immo. financières', categorieCode: '29' },
  { code: '297', libelle: 'Prov. dépréciation avances et acomptes', categorieCode: '29' },

  // === CLASSE 3 ===
  // 31 - Marchandises
  { code: '311', libelle: 'Marchandises A', categorieCode: '31' },
  { code: '312', libelle: 'Marchandises B', categorieCode: '31' },
  { code: '318', libelle: 'Autres marchandises', categorieCode: '31' },
  // 32 - Matières premières
  { code: '321', libelle: 'Matières premières', categorieCode: '32' },
  { code: '322', libelle: 'Fournitures liées', categorieCode: '32' },
  // 33 - Autres approvisionnements
  { code: '331', libelle: 'Matières consommables', categorieCode: '33' },
  { code: '332', libelle: 'Fournitures d\'atelier et d\'usine', categorieCode: '33' },
  { code: '333', libelle: 'Fournitures de magasin', categorieCode: '33' },
  { code: '334', libelle: 'Fournitures de bureau', categorieCode: '33' },
  { code: '335', libelle: 'Emballages', categorieCode: '33' },
  { code: '338', libelle: 'Autres matières et fournitures', categorieCode: '33' },
  // 34 - Produits en cours
  { code: '341', libelle: 'Produits en cours', categorieCode: '34' },
  { code: '342', libelle: 'Travaux en cours', categorieCode: '34' },
  { code: '343', libelle: 'Prestations de services en cours', categorieCode: '34' },
  // 35 - Services en cours
  { code: '351', libelle: 'Études en cours', categorieCode: '35' },
  { code: '352', libelle: 'Prestations de services en cours', categorieCode: '35' },
  // 36 - Produits finis
  { code: '361', libelle: 'Produits finis A', categorieCode: '36' },
  { code: '362', libelle: 'Produits finis B', categorieCode: '36' },
  { code: '368', libelle: 'Autres produits finis', categorieCode: '36' },
  // 37 - Produits intermédiaires
  { code: '371', libelle: 'Produits intermédiaires', categorieCode: '37' },
  { code: '372', libelle: 'Produits résiduels', categorieCode: '37' },
  // 38 - Stocks en transit
  { code: '381', libelle: 'Marchandises en cours de route', categorieCode: '38' },
  { code: '382', libelle: 'Matières premières en cours de route', categorieCode: '38' },
  { code: '386', libelle: 'Produits finis en cours de route', categorieCode: '38' },
  // 39 - Dépréciations stocks
  { code: '391', libelle: 'Dépréciation des marchandises', categorieCode: '39' },
  { code: '392', libelle: 'Dépréciation des matières premières', categorieCode: '39' },
  { code: '393', libelle: 'Dépréciation des autres appro.', categorieCode: '39' },
  { code: '394', libelle: 'Dépréciation des produits en cours', categorieCode: '39' },
  { code: '395', libelle: 'Dépréciation des services en cours', categorieCode: '39' },
  { code: '396', libelle: 'Dépréciation des produits finis', categorieCode: '39' },
  { code: '397', libelle: 'Dépréciation des produits intermédiaires', categorieCode: '39' },

  // === CLASSE 4 ===
  // 40 - Fournisseurs
  { code: '401', libelle: 'Fournisseurs, dettes en compte', categorieCode: '40' },
  { code: '402', libelle: 'Fournisseurs, effets à payer', categorieCode: '40' },
  { code: '403', libelle: 'Fournisseurs, retenues de garantie', categorieCode: '40' },
  { code: '408', libelle: 'Fournisseurs, factures non parvenues', categorieCode: '40' },
  { code: '409', libelle: 'Fournisseurs débiteurs', categorieCode: '40' },
  // 41 - Clients
  { code: '411', libelle: 'Clients', categorieCode: '41' },
  { code: '412', libelle: 'Clients, effets à recevoir', categorieCode: '41' },
  { code: '413', libelle: 'Clients, retenues de garantie', categorieCode: '41' },
  { code: '414', libelle: 'Créances sur cessions d\'immo.', categorieCode: '41' },
  { code: '416', libelle: 'Clients douteux ou litigieux', categorieCode: '41' },
  { code: '418', libelle: 'Clients, produits non encore facturés', categorieCode: '41' },
  { code: '419', libelle: 'Clients créditeurs', categorieCode: '41' },
  // 42 - Personnel
  { code: '421', libelle: 'Personnel, rémunérations dues', categorieCode: '42' },
  { code: '422', libelle: 'Personnel, avances et acomptes', categorieCode: '42' },
  { code: '423', libelle: 'Personnel, dépôts et cautionnements', categorieCode: '42' },
  { code: '424', libelle: 'Personnel, oeuvres sociales', categorieCode: '42' },
  { code: '425', libelle: 'Représentants du personnel', categorieCode: '42' },
  { code: '428', libelle: 'Personnel, charges à payer', categorieCode: '42' },
  // 43 - Organismes sociaux
  { code: '431', libelle: 'Sécurité sociale', categorieCode: '43' },
  { code: '432', libelle: 'Caisses de retraite', categorieCode: '43' },
  { code: '433', libelle: 'Autres organismes sociaux', categorieCode: '43' },
  { code: '438', libelle: 'Organismes sociaux, charges à payer', categorieCode: '43' },
  // 44 - État
  { code: '441', libelle: 'État, subventions à recevoir', categorieCode: '44' },
  { code: '442', libelle: 'État, impôts et taxes recouvrables', categorieCode: '44' },
  { code: '443', libelle: 'État, TVA facturée', categorieCode: '44' },
  { code: '444', libelle: 'État, TVA due', categorieCode: '44' },
  { code: '445', libelle: 'État, TVA récupérable', categorieCode: '44' },
  { code: '446', libelle: 'État, autres taxes sur le CA', categorieCode: '44' },
  { code: '447', libelle: 'État, impôts retenus à la source', categorieCode: '44' },
  { code: '448', libelle: 'État, charges et produits à recevoir', categorieCode: '44' },
  { code: '449', libelle: 'État, créances et dettes diverses', categorieCode: '44' },
  // 45 - Organismes internationaux
  { code: '451', libelle: 'Opérations sous mandat', categorieCode: '45' },
  { code: '452', libelle: 'Créances sur cessions (groupe)', categorieCode: '45' },
  { code: '455', libelle: 'Associés, comptes courants', categorieCode: '45' },
  { code: '458', libelle: 'Autres opérations État et organismes', categorieCode: '45' },
  // 46 - Associés et groupe
  { code: '461', libelle: 'Associés, opérations sur le capital', categorieCode: '46' },
  { code: '462', libelle: 'Associés, comptes courants', categorieCode: '46' },
  { code: '463', libelle: 'Associés, dividendes à payer', categorieCode: '46' },
  { code: '465', libelle: 'Associés, bénéfice à distribuer', categorieCode: '46' },
  { code: '466', libelle: 'Groupe, comptes courants', categorieCode: '46' },
  { code: '467', libelle: 'Actionnaires, restant dû sur capital', categorieCode: '46' },
  // 47 - Débiteurs/créditeurs divers
  { code: '471', libelle: 'Comptes d\'attente débiteurs', categorieCode: '47' },
  { code: '472', libelle: 'Comptes d\'attente créditeurs', categorieCode: '47' },
  { code: '474', libelle: 'Différences de conversion — Actif', categorieCode: '47' },
  { code: '476', libelle: 'Charges constatées d\'avance', categorieCode: '47' },
  { code: '477', libelle: 'Produits constatés d\'avance', categorieCode: '47' },
  { code: '478', libelle: 'Écarts de conversion — Passif', categorieCode: '47' },
  // 48 - Créances et dettes HAO
  { code: '481', libelle: 'Fournisseurs d\'investissements', categorieCode: '48' },
  { code: '482', libelle: 'Créances sur cessions d\'immo.', categorieCode: '48' },
  { code: '483', libelle: 'Dettes sur acquisitions de titres', categorieCode: '48' },
  { code: '484', libelle: 'Autres créances HAO', categorieCode: '48' },
  { code: '485', libelle: 'Autres dettes HAO', categorieCode: '48' },
  { code: '488', libelle: 'Charges et produits HAO constatés d\'avance', categorieCode: '48' },
  // 49 - Dépréciations tiers
  { code: '490', libelle: 'Dépréciation comptes fournisseurs', categorieCode: '49' },
  { code: '491', libelle: 'Dépréciation comptes clients', categorieCode: '49' },
  { code: '492', libelle: 'Dépréciation comptes personnel', categorieCode: '49' },
  { code: '493', libelle: 'Dépréciation organismes sociaux', categorieCode: '49' },
  { code: '494', libelle: 'Dépréciation comptes État', categorieCode: '49' },
  { code: '496', libelle: 'Dépréciation comptes associés', categorieCode: '49' },
  { code: '497', libelle: 'Dépréciation débiteurs divers', categorieCode: '49' },
  { code: '498', libelle: 'Dépréciation créances HAO', categorieCode: '49' },
  { code: '499', libelle: 'Risques provisionnés', categorieCode: '49' },

  // === CLASSE 5 ===
  // 50 - Titres de placement
  { code: '501', libelle: 'Actions', categorieCode: '50' },
  { code: '502', libelle: 'Obligations', categorieCode: '50' },
  { code: '503', libelle: 'Autres titres de placement', categorieCode: '50' },
  { code: '504', libelle: 'Intérêts courus sur titres', categorieCode: '50' },
  // 51 - Valeurs à encaisser
  { code: '511', libelle: 'Effets à encaisser', categorieCode: '51' },
  { code: '512', libelle: 'Effets à l\'encaissement', categorieCode: '51' },
  { code: '513', libelle: 'Chèques à encaisser', categorieCode: '51' },
  { code: '514', libelle: 'Chèques à l\'encaissement', categorieCode: '51' },
  { code: '515', libelle: 'Cartes de crédit à encaisser', categorieCode: '51' },
  { code: '518', libelle: 'Autres valeurs à encaisser', categorieCode: '51' },
  // 52 - Banques
  { code: '521', libelle: 'Banques locales', categorieCode: '52' },
  { code: '522', libelle: 'Banques autres États UEMOA', categorieCode: '52' },
  { code: '523', libelle: 'Banques autres États zone franc', categorieCode: '52' },
  { code: '524', libelle: 'Banques hors zone franc', categorieCode: '52' },
  { code: '526', libelle: 'Banques, intérêts courus', categorieCode: '52' },
  // 53 - Établissements financiers
  { code: '531', libelle: 'Chèques postaux', categorieCode: '53' },
  { code: '532', libelle: 'Trésor', categorieCode: '53' },
  { code: '533', libelle: 'Sociétés de gestion et intermédiation', categorieCode: '53' },
  { code: '538', libelle: 'Autres établissements financiers', categorieCode: '53' },
  // 54 - Instruments de trésorerie
  { code: '541', libelle: 'Options de taux d\'intérêt', categorieCode: '54' },
  { code: '542', libelle: 'Options de taux de change', categorieCode: '54' },
  { code: '543', libelle: 'Options de marché', categorieCode: '54' },
  { code: '545', libelle: 'Instruments fermes de taux d\'intérêt', categorieCode: '54' },
  { code: '546', libelle: 'Instruments fermes de taux de change', categorieCode: '54' },
  { code: '548', libelle: 'Autres instruments de trésorerie', categorieCode: '54' },
  // 56 - Crédits de trésorerie
  { code: '561', libelle: 'Crédits de trésorerie', categorieCode: '56' },
  { code: '564', libelle: 'Escompte de crédit de campagne', categorieCode: '56' },
  { code: '565', libelle: 'Escompte d\'effets de commerce', categorieCode: '56' },
  // 57 - Caisse
  { code: '571', libelle: 'Caisse siège social', categorieCode: '57' },
  { code: '572', libelle: 'Caisse succursale A', categorieCode: '57' },
  { code: '573', libelle: 'Caisse succursale B', categorieCode: '57' },
  { code: '578', libelle: 'Autres caisses', categorieCode: '57' },
  // 58 - Régies et virements
  { code: '581', libelle: 'Régies d\'avances', categorieCode: '58' },
  { code: '582', libelle: 'Accréditifs', categorieCode: '58' },
  { code: '585', libelle: 'Virements de fonds', categorieCode: '58' },
  { code: '588', libelle: 'Autres régies et accréditifs', categorieCode: '58' },
  // 59 - Dépréciations
  { code: '590', libelle: 'Dépréciations des titres de placement', categorieCode: '59' },

  // === CLASSE 6 ===
  // 60 - Achats
  { code: '601', libelle: 'Achats de marchandises', categorieCode: '60' },
  { code: '602', libelle: 'Achats de matières premières', categorieCode: '60' },
  { code: '603', libelle: 'Variations de stocks', categorieCode: '60' },
  { code: '604', libelle: 'Achats stockés de matières et fournitures', categorieCode: '60' },
  { code: '605', libelle: 'Autres achats', categorieCode: '60' },
  { code: '608', libelle: 'Frais accessoires d\'achats', categorieCode: '60' },
  { code: '609', libelle: 'RRR obtenus sur achats', categorieCode: '60' },
  // 61 - Transports
  { code: '611', libelle: 'Transports sur achats', categorieCode: '61' },
  { code: '612', libelle: 'Transports sur ventes', categorieCode: '61' },
  { code: '613', libelle: 'Transports pour le compte de tiers', categorieCode: '61' },
  { code: '614', libelle: 'Transports du personnel', categorieCode: '61' },
  { code: '618', libelle: 'Autres frais de transport', categorieCode: '61' },
  // 62 - Services extérieurs
  { code: '621', libelle: 'Sous-traitance générale', categorieCode: '62' },
  { code: '622', libelle: 'Locations et charges locatives', categorieCode: '62' },
  { code: '623', libelle: 'Redevances de crédit-bail', categorieCode: '62' },
  { code: '624', libelle: 'Entretien, réparations, maintenance', categorieCode: '62' },
  { code: '625', libelle: 'Primes d\'assurances', categorieCode: '62' },
  { code: '626', libelle: 'Études, recherches et documentation', categorieCode: '62' },
  { code: '627', libelle: 'Publicité et relations publiques', categorieCode: '62' },
  { code: '628', libelle: 'Frais de télécommunications', categorieCode: '62' },
  { code: '629', libelle: 'Autres services extérieurs', categorieCode: '62' },
  // 63 - Autres services extérieurs
  { code: '631', libelle: 'Frais bancaires', categorieCode: '63' },
  { code: '632', libelle: 'Rémunérations d\'intermédiaires', categorieCode: '63' },
  { code: '633', libelle: 'Frais de formation du personnel', categorieCode: '63' },
  { code: '634', libelle: 'Redevances pour brevets et licences', categorieCode: '63' },
  { code: '635', libelle: 'Cotisations', categorieCode: '63' },
  { code: '637', libelle: 'Rémunérations du personnel extérieur', categorieCode: '63' },
  { code: '638', libelle: 'Autres charges externes', categorieCode: '63' },
  // 64 - Impôts et taxes
  { code: '641', libelle: 'Impôts et taxes directs', categorieCode: '64' },
  { code: '642', libelle: 'Impôts et taxes indirects', categorieCode: '64' },
  { code: '645', libelle: 'Impôts sur les résultats', categorieCode: '64' },
  { code: '646', libelle: 'Droits d\'enregistrement', categorieCode: '64' },
  { code: '647', libelle: 'Pénalités et amendes fiscales', categorieCode: '64' },
  { code: '648', libelle: 'Autres impôts et taxes', categorieCode: '64' },
  // 65 - Autres charges
  { code: '651', libelle: 'Pertes sur créances clients', categorieCode: '65' },
  { code: '652', libelle: 'Quote-part résultat opérations communes', categorieCode: '65' },
  { code: '654', libelle: 'Valeurs comptables cessions courantes', categorieCode: '65' },
  { code: '658', libelle: 'Charges diverses', categorieCode: '65' },
  { code: '659', libelle: 'Charges provisionnées d\'exploitation', categorieCode: '65' },
  // 66 - Charges de personnel
  { code: '661', libelle: 'Rémunérations directes versées', categorieCode: '66' },
  { code: '662', libelle: 'Rémunérations en nature', categorieCode: '66' },
  { code: '663', libelle: 'Indemnités forfaitaires', categorieCode: '66' },
  { code: '664', libelle: 'Charges sociales', categorieCode: '66' },
  { code: '666', libelle: 'Cotisations aux caisses de retraite', categorieCode: '66' },
  { code: '668', libelle: 'Autres charges sociales', categorieCode: '66' },
  // 67 - Frais financiers
  { code: '671', libelle: 'Intérêts des emprunts', categorieCode: '67' },
  { code: '672', libelle: 'Intérêts dans loyers de crédit-bail', categorieCode: '67' },
  { code: '674', libelle: 'Intérêts sur dettes commerciales', categorieCode: '67' },
  { code: '675', libelle: 'Escomptes accordés', categorieCode: '67' },
  { code: '676', libelle: 'Pertes de change', categorieCode: '67' },
  { code: '677', libelle: 'Pertes sur cessions de titres', categorieCode: '67' },
  { code: '678', libelle: 'Autres charges financières', categorieCode: '67' },
  // 68 - Dotations amortissements
  { code: '681', libelle: 'Dotations aux amort. d\'exploitation', categorieCode: '68' },
  { code: '682', libelle: 'Dotations aux amort. à caractère financier', categorieCode: '68' },
  { code: '687', libelle: 'Dotations aux provisions d\'exploitation', categorieCode: '68' },
  { code: '688', libelle: 'Dotations aux provisions financières', categorieCode: '68' },
  // 69 - Dotations provisions
  { code: '691', libelle: 'Dotations aux provisions d\'exploitation', categorieCode: '69' },
  { code: '692', libelle: 'Dotations aux dépréciations d\'exploitation', categorieCode: '69' },
  { code: '697', libelle: 'Dotations aux provisions financières', categorieCode: '69' },
  { code: '698', libelle: 'Dotations aux dépréciations financières', categorieCode: '69' },

  // === CLASSE 7 ===
  // 70 - Ventes
  { code: '701', libelle: 'Ventes de marchandises', categorieCode: '70' },
  { code: '702', libelle: 'Ventes de produits finis', categorieCode: '70' },
  { code: '703', libelle: 'Ventes de produits intermédiaires', categorieCode: '70' },
  { code: '704', libelle: 'Ventes de produits résiduels', categorieCode: '70' },
  { code: '705', libelle: 'Travaux facturés', categorieCode: '70' },
  { code: '706', libelle: 'Services vendus', categorieCode: '70' },
  { code: '707', libelle: 'Produits accessoires', categorieCode: '70' },
  { code: '709', libelle: 'RRR accordés par l\'entreprise', categorieCode: '70' },
  // 71 - Subventions
  { code: '711', libelle: 'Subventions d\'État', categorieCode: '71' },
  { code: '712', libelle: 'Subventions des collectivités', categorieCode: '71' },
  { code: '713', libelle: 'Subventions des organismes internationaux', categorieCode: '71' },
  { code: '718', libelle: 'Autres subventions d\'exploitation', categorieCode: '71' },
  // 72 - Production immobilisée
  { code: '721', libelle: 'Production immobilisée, immo. incorporelles', categorieCode: '72' },
  { code: '722', libelle: 'Production immobilisée, immo. corporelles', categorieCode: '72' },
  { code: '726', libelle: 'Production immobilisée, immo. financières', categorieCode: '72' },
  // 73 - Variations de stocks
  { code: '731', libelle: 'Variations de stocks produits en cours', categorieCode: '73' },
  { code: '732', libelle: 'Variations de stocks produits finis', categorieCode: '73' },
  { code: '733', libelle: 'Variations de stocks produits intermédiaires', categorieCode: '73' },
  { code: '734', libelle: 'Variations de stocks produits résiduels', categorieCode: '73' },
  { code: '736', libelle: 'Variations de stocks en-cours services', categorieCode: '73' },
  // 75 - Autres produits
  { code: '751', libelle: 'Produits et profits sur créances', categorieCode: '75' },
  { code: '752', libelle: 'Quote-part résultat opérations communes', categorieCode: '75' },
  { code: '753', libelle: 'Quote-part subventions virée au résultat', categorieCode: '75' },
  { code: '754', libelle: 'Produits des cessions courantes', categorieCode: '75' },
  { code: '758', libelle: 'Produits divers', categorieCode: '75' },
  { code: '759', libelle: 'Reprises charges provisionnées exploitation', categorieCode: '75' },
  // 77 - Revenus financiers
  { code: '771', libelle: 'Intérêts de prêts', categorieCode: '77' },
  { code: '772', libelle: 'Revenus de participations', categorieCode: '77' },
  { code: '773', libelle: 'Escomptes obtenus', categorieCode: '77' },
  { code: '774', libelle: 'Revenus de titres de placement', categorieCode: '77' },
  { code: '775', libelle: 'Revenus des créances commerciales', categorieCode: '77' },
  { code: '776', libelle: 'Gains de change', categorieCode: '77' },
  { code: '777', libelle: 'Gains sur cessions de titres', categorieCode: '77' },
  { code: '778', libelle: 'Autres produits financiers', categorieCode: '77' },
  // 78 - Transferts de charges
  { code: '781', libelle: 'Transferts de charges d\'exploitation', categorieCode: '78' },
  { code: '782', libelle: 'Transferts de charges financières', categorieCode: '78' },
  // 79 - Reprises
  { code: '791', libelle: 'Reprises de provisions d\'exploitation', categorieCode: '79' },
  { code: '792', libelle: 'Reprises de dépréciations d\'exploitation', categorieCode: '79' },
  { code: '797', libelle: 'Reprises de provisions financières', categorieCode: '79' },
  { code: '798', libelle: 'Reprises de dépréciations financières', categorieCode: '79' },

  // === CLASSE 8 ===
  // 81
  { code: '811', libelle: 'VC cessions immo. incorporelles', categorieCode: '81' },
  { code: '812', libelle: 'VC cessions immo. corporelles', categorieCode: '81' },
  { code: '816', libelle: 'VC cessions immo. financières', categorieCode: '81' },
  // 82
  { code: '821', libelle: 'Produits cessions immo. incorporelles', categorieCode: '82' },
  { code: '822', libelle: 'Produits cessions immo. corporelles', categorieCode: '82' },
  { code: '826', libelle: 'Produits cessions immo. financières', categorieCode: '82' },
  // 83
  { code: '831', libelle: 'Charges HAO constatées', categorieCode: '83' },
  { code: '834', libelle: 'Pertes sur créances HAO', categorieCode: '83' },
  { code: '835', libelle: 'Dons et libéralités accordés', categorieCode: '83' },
  { code: '836', libelle: 'Subventions accordées', categorieCode: '83' },
  { code: '838', libelle: 'Autres charges HAO', categorieCode: '83' },
  // 84
  { code: '841', libelle: 'Produits HAO constatés', categorieCode: '84' },
  { code: '845', libelle: 'Dons et libéralités obtenus', categorieCode: '84' },
  { code: '846', libelle: 'Subventions d\'équilibre reçues', categorieCode: '84' },
  { code: '848', libelle: 'Autres produits HAO', categorieCode: '84' },
  // 85
  { code: '851', libelle: 'Dotations provisions risques HAO', categorieCode: '85' },
  { code: '852', libelle: 'Dotations dépréciations HAO', categorieCode: '85' },
  { code: '858', libelle: 'Autres dotations HAO', categorieCode: '85' },
  // 86
  { code: '861', libelle: 'Reprises provisions risques HAO', categorieCode: '86' },
  { code: '862', libelle: 'Reprises dépréciations HAO', categorieCode: '86' },
  { code: '868', libelle: 'Autres reprises HAO', categorieCode: '86' },
  // 87
  { code: '871', libelle: 'Participation légale', categorieCode: '87' },
  { code: '872', libelle: 'Participation contractuelle', categorieCode: '87' },
  { code: '878', libelle: 'Autres charges de participation', categorieCode: '87' },
  // 88
  { code: '881', libelle: 'Subventions d\'équilibre reçues', categorieCode: '88' },
  { code: '888', libelle: 'Autres subventions d\'équilibre', categorieCode: '88' },
  // 89
  { code: '891', libelle: 'Impôts sur les bénéfices', categorieCode: '89' },
  { code: '892', libelle: 'Rappel d\'impôts sur résultats antérieurs', categorieCode: '89' },
  { code: '895', libelle: 'Impôt minimum forfaitaire (IMF)', categorieCode: '89' },

  // === CLASSE 9 ===
  // 90
  { code: '901', libelle: 'Engagements de financement obtenus', categorieCode: '90' },
  { code: '902', libelle: 'Engagements de financement accordés', categorieCode: '90' },
  { code: '903', libelle: 'Engagements de garantie obtenus', categorieCode: '90' },
  { code: '904', libelle: 'Engagements de garantie accordés', categorieCode: '90' },
  { code: '905', libelle: 'Autres engagements obtenus', categorieCode: '90' },
  { code: '906', libelle: 'Autres engagements accordés', categorieCode: '90' },
  // 91
  { code: '911', libelle: 'Comptes de reclassement bilan', categorieCode: '91' },
  { code: '912', libelle: 'Comptes de reclassement résultat', categorieCode: '91' },
  // 92-98
  { code: '921', libelle: 'Centres d\'analyse principaux', categorieCode: '92' },
  { code: '922', libelle: 'Centres d\'analyse auxiliaires', categorieCode: '92' },
  { code: '931', libelle: 'Coûts matières premières', categorieCode: '93' },
  { code: '932', libelle: 'Coûts matières consommables', categorieCode: '93' },
  { code: '941', libelle: 'Coûts produits finis A', categorieCode: '94' },
  { code: '942', libelle: 'Coûts produits finis B', categorieCode: '94' },
  { code: '951', libelle: 'Coûts produits en cours', categorieCode: '95' },
  { code: '961', libelle: 'Écarts sur matières', categorieCode: '96' },
  { code: '962', libelle: 'Écarts sur main-d\'oeuvre', categorieCode: '96' },
  { code: '971', libelle: 'Résultats analytiques A', categorieCode: '97' },
  { code: '972', libelle: 'Résultats analytiques B', categorieCode: '97' },
  { code: '981', libelle: 'Comptes de liaison internes', categorieCode: '98' },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Get categories for a given class */
export function getCategoriesByClasse(classeCode: number): CategorieSYSCOHADA[] {
  return CATEGORIES_SYSCOHADA.filter(c => c.classeCode === classeCode);
}

/** Get sous-comptes for a given category */
export function getSousComptesByCategorie(categorieCode: string): SousCompteSYSCOHADA[] {
  return SOUS_COMPTES_SYSCOHADA.filter(sc => sc.categorieCode === categorieCode);
}

/** Get nature and sens for a given classe + categorie combination */
export function getNatureSens(
  classeCode: number,
  categorieCode?: string
): { nature: NatureSYSCOHADA; sensNormal: SensNormal; isVariable: boolean } {
  // Check if the category has specific overrides
  if (categorieCode) {
    const cat = CATEGORIES_SYSCOHADA.find(c => c.code === categorieCode);
    if (cat?.sensVariable) {
      return { nature: 'ACTIF', sensNormal: 'DEBITEUR', isVariable: true };
    }
    if (cat?.nature && cat?.sensNormal) {
      return { nature: cat.nature, sensNormal: cat.sensNormal, isVariable: false };
    }
  }

  // Fall back to class-level defaults
  const classe = CLASSES_SYSCOHADA.find(c => c.code === classeCode);
  if (!classe) {
    return { nature: 'ACTIF', sensNormal: 'DEBITEUR', isVariable: true };
  }

  // Class 9 is always variable
  if (classeCode === 9) {
    return { nature: 'SPECIAL', sensNormal: 'DEBITEUR', isVariable: true };
  }

  return { nature: classe.nature, sensNormal: classe.sensNormal, isVariable: false };
}

/** Map NatureSYSCOHADA to normalBalance for DBAccount */
export function sensToNormalBalance(sens: SensNormal): 'debit' | 'credit' {
  return sens === 'DEBITEUR' ? 'debit' : 'credit';
}

/** Map NatureSYSCOHADA to accountType for DBAccount */
export function classeToAccountType(classeCode: number): string {
  const classe = CLASSES_SYSCOHADA.find(c => c.code === classeCode);
  return classe?.type || 'bilan';
}
