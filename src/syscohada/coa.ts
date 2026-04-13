// Plan comptable SYSCOHADA révisé 2017
// Référentiel OHADA — Acte uniforme du 26 janvier 2017
// Classes 1-9 : comptes principaux (2, 3 et 4 chiffres)

export type AccountClass = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type SyscoAccount = {
  code: string;       // numéro de compte
  label: string;      // libellé officiel
  class: AccountClass;
  type: 'A' | 'P' | 'C' | 'R' | 'X'; // Actif, Passif, Charge, Produit, autre
  parent?: string;
  // mapping vers ligne de Bilan / CR / SIG
  bilanLine?: string;
  crLine?: string;
  sigContrib?: 'CA' | 'PROD_STOCKEE' | 'PROD_IMMO' | 'SUBV_EXPLOIT' | 'AUTRE_PROD'
              | 'ACHAT_MARCH' | 'ACHAT_MP' | 'VAR_STOCK_MARCH' | 'VAR_STOCK_MP'
              | 'TRANSPORT' | 'SERV_EXT' | 'IMPOTS' | 'PERSONNEL'
              | 'AUTRE_CHARGE' | 'DOTATION_EXPL' | 'REPRISE_EXPL'
              | 'PROD_FIN' | 'CHARGE_FIN' | 'PROD_HAO' | 'CHARGE_HAO'
              | 'IMPOT_RES' | 'PARTICIPATION';
};

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 1 — Ressources durables (capitaux propres et dettes financières)
// ─────────────────────────────────────────────────────────────────────────────
const class1: SyscoAccount[] = [
  { code: '10', label: 'Capital', class: '1', type: 'P', bilanLine: 'CAPITAL' },
  { code: '101', label: 'Capital social', class: '1', type: 'P', parent: '10', bilanLine: 'CAPITAL' },
  { code: '104', label: "Primes liées au capital social", class: '1', type: 'P', parent: '10', bilanLine: 'PRIMES' },
  { code: '105', label: "Écarts de réévaluation", class: '1', type: 'P', parent: '10', bilanLine: 'ECARTS_REEVAL' },
  { code: '106', label: "Réserves", class: '1', type: 'P', parent: '10', bilanLine: 'RESERVES' },
  { code: '109', label: "Actionnaires, capital souscrit non appelé", class: '1', type: 'A', parent: '10', bilanLine: 'CAP_NON_APPELE' },
  { code: '11', label: "Report à nouveau", class: '1', type: 'P', bilanLine: 'REPORT_NOUVEAU' },
  { code: '12', label: "Résultat net de l'exercice", class: '1', type: 'P', bilanLine: 'RESULTAT_NET' },
  { code: '13', label: "Résultat net en instance d'affectation", class: '1', type: 'P', bilanLine: 'RESULTAT_NET' },
  { code: '14', label: "Subventions d'investissement", class: '1', type: 'P', bilanLine: 'SUBV_INVEST' },
  { code: '15', label: "Provisions réglementées et fonds assimilés", class: '1', type: 'P', bilanLine: 'PROV_REGL' },
  { code: '16', label: "Emprunts et dettes assimilées", class: '1', type: 'P', bilanLine: 'EMPRUNTS' },
  { code: '161', label: "Emprunts obligataires", class: '1', type: 'P', parent: '16', bilanLine: 'EMPRUNTS' },
  { code: '162', label: "Emprunts auprès des établissements de crédit", class: '1', type: 'P', parent: '16', bilanLine: 'EMPRUNTS' },
  { code: '163', label: "Avances reçues de l'État", class: '1', type: 'P', parent: '16', bilanLine: 'EMPRUNTS' },
  { code: '17', label: "Dettes de location-financement", class: '1', type: 'P', bilanLine: 'DETTES_LOCFIN' },
  { code: '18', label: "Dettes liées à des participations & comptes courants associés", class: '1', type: 'P', bilanLine: 'DETTES_PARTICIP' },
  { code: '19', label: "Provisions financières pour risques et charges", class: '1', type: 'P', bilanLine: 'PROV_RC' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 2 — Actif immobilisé
// ─────────────────────────────────────────────────────────────────────────────
const class2: SyscoAccount[] = [
  { code: '20', label: 'Charges immobilisées', class: '2', type: 'A', bilanLine: 'IMMO_INCORP' },
  { code: '21', label: "Immobilisations incorporelles", class: '2', type: 'A', bilanLine: 'IMMO_INCORP' },
  { code: '211', label: 'Frais de recherche et de développement', class: '2', type: 'A', parent: '21', bilanLine: 'IMMO_INCORP' },
  { code: '212', label: "Brevets, licences, concessions", class: '2', type: 'A', parent: '21', bilanLine: 'IMMO_INCORP' },
  { code: '213', label: 'Logiciels et sites internet', class: '2', type: 'A', parent: '21', bilanLine: 'IMMO_INCORP' },
  { code: '214', label: 'Marques', class: '2', type: 'A', parent: '21', bilanLine: 'IMMO_INCORP' },
  { code: '215', label: "Fonds commercial", class: '2', type: 'A', parent: '21', bilanLine: 'IMMO_INCORP' },
  { code: '22', label: 'Terrains', class: '2', type: 'A', bilanLine: 'IMMO_CORP' },
  { code: '23', label: "Bâtiments, installations techniques et agencements", class: '2', type: 'A', bilanLine: 'IMMO_CORP' },
  { code: '231', label: "Bâtiments industriels, agricoles, administratifs", class: '2', type: 'A', parent: '23', bilanLine: 'IMMO_CORP' },
  { code: '24', label: 'Matériel, mobilier et actifs biologiques', class: '2', type: 'A', bilanLine: 'IMMO_CORP' },
  { code: '241', label: "Matériel et outillage industriel et commercial", class: '2', type: 'A', parent: '24', bilanLine: 'IMMO_CORP' },
  { code: '244', label: "Matériel et mobilier de bureau", class: '2', type: 'A', parent: '24', bilanLine: 'IMMO_CORP' },
  { code: '245', label: "Matériel de transport", class: '2', type: 'A', parent: '24', bilanLine: 'IMMO_CORP' },
  { code: '25', label: "Avances et acomptes versés sur immobilisations", class: '2', type: 'A', bilanLine: 'IMMO_CORP' },
  { code: '26', label: "Titres de participation", class: '2', type: 'A', bilanLine: 'IMMO_FIN' },
  { code: '27', label: "Autres immobilisations financières", class: '2', type: 'A', bilanLine: 'IMMO_FIN' },
  { code: '275', label: "Dépôts et cautionnements versés", class: '2', type: 'A', parent: '27', bilanLine: 'IMMO_FIN' },
  { code: '28', label: "Amortissements", class: '2', type: 'A', bilanLine: 'AMORT' },
  { code: '281', label: "Amortissements des immobilisations incorporelles", class: '2', type: 'A', parent: '28', bilanLine: 'AMORT' },
  { code: '282', label: "Amortissements des terrains", class: '2', type: 'A', parent: '28', bilanLine: 'AMORT' },
  { code: '283', label: "Amortissements des bâtiments", class: '2', type: 'A', parent: '28', bilanLine: 'AMORT' },
  { code: '284', label: "Amortissements du matériel", class: '2', type: 'A', parent: '28', bilanLine: 'AMORT' },
  { code: '29', label: "Provisions pour dépréciation des immobilisations", class: '2', type: 'A', bilanLine: 'DEPREC_IMMO' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 3 — Stocks et en-cours
// ─────────────────────────────────────────────────────────────────────────────
const class3: SyscoAccount[] = [
  { code: '31', label: 'Marchandises', class: '3', type: 'A', bilanLine: 'STOCK_MARCH' },
  { code: '32', label: 'Matières premières et fournitures liées', class: '3', type: 'A', bilanLine: 'STOCK_MP' },
  { code: '33', label: 'Autres approvisionnements', class: '3', type: 'A', bilanLine: 'STOCK_AUTRE' },
  { code: '34', label: 'Produits en cours', class: '3', type: 'A', bilanLine: 'STOCK_ENCOURS' },
  { code: '35', label: "Services en cours", class: '3', type: 'A', bilanLine: 'STOCK_ENCOURS' },
  { code: '36', label: "Produits finis", class: '3', type: 'A', bilanLine: 'STOCK_PF' },
  { code: '37', label: "Produits intermédiaires et résiduels", class: '3', type: 'A', bilanLine: 'STOCK_PF' },
  { code: '38', label: "Stocks en cours de route, en consignation ou en dépôt", class: '3', type: 'A', bilanLine: 'STOCK_AUTRE' },
  { code: '39', label: "Provisions pour dépréciation des stocks", class: '3', type: 'A', bilanLine: 'STOCK_DEPREC' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 4 — Tiers
// ─────────────────────────────────────────────────────────────────────────────
const class4: SyscoAccount[] = [
  { code: '40', label: 'Fournisseurs et comptes rattachés', class: '4', type: 'P', bilanLine: 'DETTES_FOURN' },
  { code: '401', label: "Fournisseurs", class: '4', type: 'P', parent: '40', bilanLine: 'DETTES_FOURN' },
  { code: '408', label: "Fournisseurs, factures non parvenues", class: '4', type: 'P', parent: '40', bilanLine: 'DETTES_FOURN' },
  { code: '409', label: "Fournisseurs débiteurs (avances, RRR à obtenir)", class: '4', type: 'A', parent: '40', bilanLine: 'CREANCES_AUTRES' },
  { code: '41', label: 'Clients et comptes rattachés', class: '4', type: 'A', bilanLine: 'CREANCES_CLIENTS' },
  { code: '411', label: "Clients", class: '4', type: 'A', parent: '41', bilanLine: 'CREANCES_CLIENTS' },
  { code: '416', label: "Créances clients litigieuses ou douteuses", class: '4', type: 'A', parent: '41', bilanLine: 'CREANCES_CLIENTS' },
  { code: '418', label: "Clients, produits à recevoir", class: '4', type: 'A', parent: '41', bilanLine: 'CREANCES_CLIENTS' },
  { code: '419', label: "Clients créditeurs (avances reçues)", class: '4', type: 'P', parent: '41', bilanLine: 'DETTES_AUTRES' },
  { code: '42', label: 'Personnel', class: '4', type: 'P', bilanLine: 'DETTES_AUTRES' },
  { code: '421', label: "Personnel, avances et acomptes", class: '4', type: 'A', parent: '42', bilanLine: 'CREANCES_AUTRES' },
  { code: '422', label: "Personnel, rémunérations dues", class: '4', type: 'P', parent: '42', bilanLine: 'DETTES_AUTRES' },
  { code: '43', label: "Organismes sociaux", class: '4', type: 'P', bilanLine: 'DETTES_AUTRES' },
  { code: '44', label: "État et collectivités publiques", class: '4', type: 'P', bilanLine: 'DETTES_FISC' },
  { code: '441', label: "État, impôt sur les bénéfices", class: '4', type: 'P', parent: '44', bilanLine: 'DETTES_FISC' },
  { code: '443', label: "État, TVA facturée", class: '4', type: 'P', parent: '44', bilanLine: 'DETTES_FISC' },
  { code: '445', label: "État, TVA récupérable", class: '4', type: 'A', parent: '44', bilanLine: 'CREANCES_AUTRES' },
  { code: '447', label: "État, impôts retenus à la source", class: '4', type: 'P', parent: '44', bilanLine: 'DETTES_FISC' },
  { code: '46', label: 'Associés et groupe', class: '4', type: 'P', bilanLine: 'DETTES_AUTRES' },
  { code: '47', label: "Débiteurs et créditeurs divers", class: '4', type: 'A', bilanLine: 'CREANCES_AUTRES' },
  { code: '48', label: "Créances et dettes hors activités ordinaires (HAO)", class: '4', type: 'A', bilanLine: 'CREANCES_AUTRES' },
  { code: '49', label: "Provisions pour dépréciation des comptes de tiers", class: '4', type: 'A', bilanLine: 'DEPREC_TIERS' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 5 — Trésorerie
// ─────────────────────────────────────────────────────────────────────────────
const class5: SyscoAccount[] = [
  { code: '50', label: "Titres de placement", class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '51', label: "Valeurs à encaisser", class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '52', label: 'Banques', class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '521', label: "Banques locales", class: '5', type: 'A', parent: '52', bilanLine: 'TRESO_ACTIVE' },
  { code: '53', label: "Établissements financiers et assimilés", class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '54', label: "Instruments de monnaie électronique", class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '56', label: "Banques, crédits de trésorerie et d'escompte", class: '5', type: 'P', bilanLine: 'TRESO_PASSIVE' },
  { code: '57', label: 'Caisse', class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '58', label: "Régies d'avances, accréditifs et virements internes", class: '5', type: 'A', bilanLine: 'TRESO_ACTIVE' },
  { code: '59', label: "Provisions pour dépréciation des comptes financiers", class: '5', type: 'A', bilanLine: 'TRESO_DEPREC' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 6 — Charges des activités ordinaires
// ─────────────────────────────────────────────────────────────────────────────
const class6: SyscoAccount[] = [
  { code: '60', label: 'Achats et variations de stocks', class: '6', type: 'C', crLine: 'ACHAT', sigContrib: 'ACHAT_MARCH' },
  { code: '601', label: 'Achats de marchandises', class: '6', type: 'C', parent: '60', crLine: 'ACHAT_MARCH', sigContrib: 'ACHAT_MARCH' },
  { code: '602', label: "Achats de matières premières et fournitures liées", class: '6', type: 'C', parent: '60', crLine: 'ACHAT_MP', sigContrib: 'ACHAT_MP' },
  { code: '604', label: "Achats stockés de matières et fournitures consommables", class: '6', type: 'C', parent: '60', crLine: 'ACHAT_MP', sigContrib: 'ACHAT_MP' },
  { code: '605', label: "Autres achats", class: '6', type: 'C', parent: '60', crLine: 'ACHAT_MP', sigContrib: 'ACHAT_MP' },
  { code: '608', label: "Achats d'emballages", class: '6', type: 'C', parent: '60', crLine: 'ACHAT_MP', sigContrib: 'ACHAT_MP' },
  { code: '6031', label: "Variations des stocks de marchandises", class: '6', type: 'C', parent: '60', crLine: 'VAR_STOCK_MARCH', sigContrib: 'VAR_STOCK_MARCH' },
  { code: '6032', label: "Variations des stocks de matières premières", class: '6', type: 'C', parent: '60', crLine: 'VAR_STOCK_MP', sigContrib: 'VAR_STOCK_MP' },
  { code: '61', label: 'Transports', class: '6', type: 'C', crLine: 'TRANSPORT', sigContrib: 'TRANSPORT' },
  { code: '62', label: "Services extérieurs A", class: '6', type: 'C', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '622', label: "Locations et charges locatives", class: '6', type: 'C', parent: '62', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '624', label: "Entretien, réparations et maintenance", class: '6', type: 'C', parent: '62', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '625', label: "Primes d'assurances", class: '6', type: 'C', parent: '62', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '63', label: "Services extérieurs B", class: '6', type: 'C', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '631', label: "Frais bancaires", class: '6', type: 'C', parent: '63', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '632', label: "Rémunérations d'intermédiaires et de conseils", class: '6', type: 'C', parent: '63', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '633', label: "Frais de formation du personnel", class: '6', type: 'C', parent: '63', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '637', label: "Rémunérations de personnel extérieur à l'entreprise", class: '6', type: 'C', parent: '63', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '638', label: "Autres charges externes", class: '6', type: 'C', parent: '63', crLine: 'SERV_EXT', sigContrib: 'SERV_EXT' },
  { code: '64', label: 'Impôts et taxes', class: '6', type: 'C', crLine: 'IMPOTS', sigContrib: 'IMPOTS' },
  { code: '65', label: 'Autres charges', class: '6', type: 'C', crLine: 'AUTRE_CHARGE', sigContrib: 'AUTRE_CHARGE' },
  { code: '66', label: 'Charges de personnel', class: '6', type: 'C', crLine: 'PERSONNEL', sigContrib: 'PERSONNEL' },
  { code: '661', label: "Rémunérations directes versées au personnel national", class: '6', type: 'C', parent: '66', crLine: 'PERSONNEL', sigContrib: 'PERSONNEL' },
  { code: '664', label: "Charges sociales", class: '6', type: 'C', parent: '66', crLine: 'PERSONNEL', sigContrib: 'PERSONNEL' },
  { code: '67', label: "Frais financiers et charges assimilées", class: '6', type: 'C', crLine: 'CHARGE_FIN', sigContrib: 'CHARGE_FIN' },
  { code: '671', label: "Intérêts des emprunts", class: '6', type: 'C', parent: '67', crLine: 'CHARGE_FIN', sigContrib: 'CHARGE_FIN' },
  { code: '68', label: 'Dotations aux amortissements', class: '6', type: 'C', crLine: 'DOTATION', sigContrib: 'DOTATION_EXPL' },
  { code: '681', label: "Dotations aux amortissements d'exploitation", class: '6', type: 'C', parent: '68', crLine: 'DOTATION', sigContrib: 'DOTATION_EXPL' },
  { code: '69', label: "Dotations aux provisions et aux dépréciations", class: '6', type: 'C', crLine: 'DOTATION', sigContrib: 'DOTATION_EXPL' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 7 — Produits des activités ordinaires
// ─────────────────────────────────────────────────────────────────────────────
const class7: SyscoAccount[] = [
  { code: '70', label: 'Ventes', class: '7', type: 'R', crLine: 'CA', sigContrib: 'CA' },
  { code: '701', label: 'Ventes de marchandises', class: '7', type: 'R', parent: '70', crLine: 'CA_MARCH', sigContrib: 'CA' },
  { code: '702', label: 'Ventes de produits finis', class: '7', type: 'R', parent: '70', crLine: 'CA_PROD', sigContrib: 'CA' },
  { code: '703', label: "Ventes de produits intermédiaires", class: '7', type: 'R', parent: '70', crLine: 'CA_PROD', sigContrib: 'CA' },
  { code: '704', label: "Ventes de produits résiduels", class: '7', type: 'R', parent: '70', crLine: 'CA_PROD', sigContrib: 'CA' },
  { code: '705', label: 'Travaux facturés', class: '7', type: 'R', parent: '70', crLine: 'CA_PROD', sigContrib: 'CA' },
  { code: '706', label: 'Services vendus', class: '7', type: 'R', parent: '70', crLine: 'CA_SERV', sigContrib: 'CA' },
  { code: '707', label: "Produits accessoires", class: '7', type: 'R', parent: '70', crLine: 'CA_SERV', sigContrib: 'CA' },
  { code: '71', label: 'Subventions d\'exploitation', class: '7', type: 'R', crLine: 'SUBV_EXPL', sigContrib: 'SUBV_EXPLOIT' },
  { code: '72', label: 'Production immobilisée', class: '7', type: 'R', crLine: 'PROD_IMMO', sigContrib: 'PROD_IMMO' },
  { code: '73', label: 'Variations des stocks de biens et de services produits', class: '7', type: 'R', crLine: 'VAR_STOCK_PROD', sigContrib: 'PROD_STOCKEE' },
  { code: '75', label: 'Autres produits', class: '7', type: 'R', crLine: 'AUTRE_PROD', sigContrib: 'AUTRE_PROD' },
  { code: '77', label: "Revenus financiers et produits assimilés", class: '7', type: 'R', crLine: 'PROD_FIN', sigContrib: 'PROD_FIN' },
  { code: '78', label: 'Transferts de charges', class: '7', type: 'R', crLine: 'TRANSF_CHARGE', sigContrib: 'AUTRE_PROD' },
  { code: '79', label: 'Reprises de provisions et de dépréciations', class: '7', type: 'R', crLine: 'REPRISE', sigContrib: 'REPRISE_EXPL' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSE 8 — Autres charges et autres produits
// ─────────────────────────────────────────────────────────────────────────────
const class8: SyscoAccount[] = [
  { code: '81', label: "Valeurs comptables des cessions d'immobilisations", class: '8', type: 'C', crLine: 'CHARGE_HAO', sigContrib: 'CHARGE_HAO' },
  { code: '82', label: "Produits des cessions d'immobilisations", class: '8', type: 'R', crLine: 'PROD_HAO', sigContrib: 'PROD_HAO' },
  { code: '83', label: "Charges hors activités ordinaires (HAO)", class: '8', type: 'C', crLine: 'CHARGE_HAO', sigContrib: 'CHARGE_HAO' },
  { code: '84', label: "Produits hors activités ordinaires (HAO)", class: '8', type: 'R', crLine: 'PROD_HAO', sigContrib: 'PROD_HAO' },
  { code: '85', label: "Dotations HAO", class: '8', type: 'C', crLine: 'CHARGE_HAO', sigContrib: 'CHARGE_HAO' },
  { code: '86', label: "Reprises HAO", class: '8', type: 'R', crLine: 'PROD_HAO', sigContrib: 'PROD_HAO' },
  { code: '87', label: "Participation des travailleurs", class: '8', type: 'C', crLine: 'PARTICIP', sigContrib: 'PARTICIPATION' },
  { code: '89', label: "Impôts sur le résultat", class: '8', type: 'C', crLine: 'IMPOT_RES', sigContrib: 'IMPOT_RES' },
];

export const SYSCOHADA_COA: SyscoAccount[] = [
  ...class1, ...class2, ...class3, ...class4, ...class5, ...class6, ...class7, ...class8,
];

// Index par code exact
export const COA_BY_CODE = new Map(SYSCOHADA_COA.map((a) => [a.code, a]));

// Trouver le compte SYSCOHADA correspondant à un code arbitraire
// (ex: "411001" → renvoie le compte "411" puis "41")
export function findSyscoAccount(code: string): SyscoAccount | undefined {
  if (!code) return undefined;
  const trimmed = String(code).trim();
  // Match exact
  if (COA_BY_CODE.has(trimmed)) return COA_BY_CODE.get(trimmed);
  // Recherche par préfixe — du plus long au plus court (max 4 chiffres)
  for (let len = Math.min(trimmed.length, 4); len >= 2; len--) {
    const prefix = trimmed.substring(0, len);
    if (COA_BY_CODE.has(prefix)) return COA_BY_CODE.get(prefix);
  }
  return undefined;
}

export function classOf(code: string): AccountClass | undefined {
  if (!code) return undefined;
  const c = String(code).trim()[0];
  if (c >= '1' && c <= '9') return c as AccountClass;
  return undefined;
}
