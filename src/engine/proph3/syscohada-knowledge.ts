// Connaissance SYSCOHADA experte de Proph3t — codes, intitulés officiels,
// règles comptables, normes sectorielles, glossaire, principes.
// Utilisé pour répondre aux questions et enrichir les commentaires.

export const SYSCOHADA_CLASSES = {
  '1': { label: 'Comptes de ressources durables', desc: 'Capitaux propres, dettes financières long terme, provisions pour risques et charges. Financements stables au passif du bilan.' },
  '2': { label: 'Comptes d\'actif immobilisé', desc: 'Immobilisations incorporelles, corporelles, financières et amortissements. Patrimoine stable de l\'entreprise.' },
  '3': { label: 'Comptes de stocks', desc: 'Marchandises, matières premières, produits finis, en-cours de production. Valorisés au CMP ou FIFO.' },
  '4': { label: 'Comptes de tiers', desc: 'Créances et dettes du cycle d\'exploitation : clients (411), fournisseurs (401), personnel (42), État (44), associés (46).' },
  '5': { label: 'Comptes financiers', desc: 'Trésorerie : banques (52), caisse (57), VMP (50), virements internes (58).' },
  '6': { label: 'Comptes de charges', desc: 'Consommations de la période : achats (60), services extérieurs (62-63), charges de personnel (66), charges financières (67), dotations (68).' },
  '7': { label: 'Comptes de produits', desc: 'Revenus de la période : ventes (70-71), production stockée (72), production immobilisée (73), subventions (74), produits financiers (77), reprises (78).' },
  '8': { label: 'Comptes hors activités ordinaires (HAO)', desc: 'Charges (81, 83, 85) et produits (82, 84, 86, 88) exceptionnels, plus impôts sur le résultat (87, 89).' },
  '9': { label: 'Comptes de comptabilité analytique', desc: 'Optionnels — analyse par centre de coût, projet, activité.' },
};

export const SYSCOHADA_KEY_RATIOS = [
  { code: 'autonomie', label: 'Autonomie financière', formula: 'Capitaux propres / Total Passif', target: '> 50 %', interpretation: 'Indique la part du financement par les actionnaires. Au-delà de 50 %, l\'entreprise est financièrement indépendante. En deçà de 30 %, dépendance préoccupante aux dettes.' },
  { code: 'liquidite_gen', label: 'Liquidité générale', formula: 'Actif circulant / Dettes circulantes', target: '> 1,5', interpretation: 'Mesure la capacité à honorer les engagements court terme. > 1,5 = confortable. Entre 1 et 1,5 = limite. < 1 = risque de défaut.' },
  { code: 'liquidite_red', label: 'Liquidité réduite (acid test)', formula: '(Actif circulant - Stocks) / Dettes circulantes', target: '> 1', interpretation: 'Liquidité hors stocks (qui peuvent être difficiles à liquider rapidement). > 1 = position saine.' },
  { code: 'rotation_actif', label: 'Rotation de l\'actif', formula: 'CA / Total Actif', target: '> 1', interpretation: 'Efficience d\'utilisation des actifs. Plus le ratio est élevé, plus l\'entreprise génère de CA par unité d\'actif investie.' },
  { code: 'roa', label: 'Return on Assets (ROA)', formula: 'Résultat net / Total Actif × 100', target: '> 5 %', interpretation: 'Rentabilité économique globale. Indépendant de la structure de financement.' },
  { code: 'roe', label: 'Return on Equity (ROE)', formula: 'Résultat net / Capitaux propres × 100', target: '> 10 %', interpretation: 'Rentabilité actionnariale. Combine la rentabilité opérationnelle et l\'effet de levier.' },
  { code: 'marge_ebe', label: 'Taux d\'EBE', formula: 'EBE / CA × 100', target: '> 15 %', interpretation: 'Rentabilité opérationnelle pure (avant amortissements et financement). Comparable entre entreprises de tailles différentes.' },
  { code: 'dso', label: 'DSO (Days Sales Outstanding)', formula: '(Créances clients / CA) × 360', target: '< 60 j', interpretation: 'Délai moyen d\'encaissement. La norme OHADA limite à 60 jours date de facture.' },
  { code: 'dpo', label: 'DPO (Days Payables Outstanding)', formula: '(Dettes fournisseurs / Achats) × 360', target: '> 30 j', interpretation: 'Délai moyen de paiement. Un DPO élevé est favorable au cash mais ne doit pas dégrader les relations fournisseurs.' },
  { code: 'levier', label: 'Levier financier', formula: 'Total Actif / Capitaux propres', target: '< 3', interpretation: 'Effet d\'amplification de la dette sur le ROE. Au-delà de 3, le risque financier devient significatif.' },
];

export const SYSCOHADA_PRINCIPLES = [
  { name: 'Continuité d\'exploitation', desc: 'Les comptes sont établis dans l\'hypothèse que l\'entreprise poursuit son activité.' },
  { name: 'Permanence des méthodes', desc: 'Les mêmes méthodes comptables doivent être appliquées d\'un exercice à l\'autre, sauf changement justifié.' },
  { name: 'Indépendance des exercices', desc: 'Chaque exercice est indépendant : les charges et produits sont rattachés à l\'exercice qui les concerne (principe de spécialisation).' },
  { name: 'Coût historique', desc: 'Les biens sont enregistrés à leur coût d\'acquisition ou de production, sans réévaluation systématique.' },
  { name: 'Prudence', desc: 'Les pertes probables doivent être anticipées (provisions), les gains seulement constatés s\'ils sont réalisés.' },
  { name: 'Importance significative', desc: 'Toute information significative pour la prise de décision doit être présentée dans les états financiers et les notes annexes.' },
  { name: 'Transparence', desc: 'Les états financiers doivent donner une image fidèle (fair view) du patrimoine, de la situation financière et du résultat.' },
  { name: 'Non-compensation', desc: 'Aucune compensation entre comptes d\'actif et passif, ou entre charges et produits, sauf disposition contraire.' },
  { name: 'Bonne information', desc: 'Les annexes doivent compléter les états financiers pour permettre une compréhension complète.' },
];

export const SYSCOHADA_SECTORAL_NORMS: Record<string, { dso: number; dpo: number; rotationStocks: number; margeEbe: number; autonomie: number }> = {
  'Industrie':       { dso: 60, dpo: 60, rotationStocks: 90,  margeEbe: 15, autonomie: 35 },
  'Commerce':        { dso: 30, dpo: 45, rotationStocks: 45,  margeEbe: 8,  autonomie: 25 },
  'Services':        { dso: 45, dpo: 30, rotationStocks: 0,   margeEbe: 18, autonomie: 40 },
  'BTP':             { dso: 90, dpo: 60, rotationStocks: 60,  margeEbe: 8,  autonomie: 30 },
  'Hôtellerie':      { dso: 15, dpo: 30, rotationStocks: 15,  margeEbe: 25, autonomie: 30 },
  'Agriculture':     { dso: 30, dpo: 60, rotationStocks: 180, margeEbe: 12, autonomie: 40 },
  'Transport':       { dso: 60, dpo: 45, rotationStocks: 30,  margeEbe: 12, autonomie: 25 },
  'Microfinance':    { dso: 0,  dpo: 0,  rotationStocks: 0,   margeEbe: 25, autonomie: 15 },
  'Immobilier':      { dso: 30, dpo: 30, rotationStocks: 0,   margeEbe: 35, autonomie: 50 },
};

export const SYSCOHADA_REQUIRED_STATEMENTS = [
  'Bilan (Actif / Passif équilibrés)',
  'Compte de résultat (par nature)',
  'Tableau des Flux de Trésorerie (TFT) — méthode indirecte recommandée',
  'État de Variation des Capitaux Propres',
  'Notes annexes (méthodes comptables, engagements hors bilan, événements postérieurs, parties liées)',
];

export const SYSCOHADA_GLOSSARY: Record<string, string> = {
  'CAFG': 'Capacité d\'Autofinancement Globale = EBE + autres produits encaissables - autres charges décaissables. Mesure la trésorerie potentiellement générée par l\'exploitation.',
  'CAHT': 'Chiffre d\'Affaires Hors Taxes = Ventes nettes de marchandises et produits, hors TVA.',
  'EBE': 'Excédent Brut d\'Exploitation = Valeur Ajoutée + Subventions d\'exploitation - Charges de personnel - Impôts et taxes. Indicateur clé de la rentabilité opérationnelle.',
  'VA': 'Valeur Ajoutée = Marge brute - Consommations intermédiaires (services extérieurs, transports). Richesse créée par l\'entreprise.',
  'BFR': 'Besoin en Fonds de Roulement = Stocks + Créances - Dettes circulantes. Cash immobilisé par le cycle d\'exploitation.',
  'FR': 'Fonds de Roulement = Ressources stables (CP + dettes LT) - Emplois stables (immobilisations).',
  'TN': 'Trésorerie Nette = FR - BFR = Trésorerie active - Trésorerie passive.',
  'DSO': 'Days Sales Outstanding = délai moyen d\'encaissement clients (en jours).',
  'DPO': 'Days Payables Outstanding = délai moyen de paiement fournisseurs (en jours).',
  'ROA': 'Return on Assets = Rentabilité économique = Résultat net / Total Actif.',
  'ROE': 'Return on Equity = Rentabilité financière = Résultat net / Capitaux propres.',
  'RCCM': 'Registre du Commerce et du Crédit Mobilier — équivalent OHADA du SIRET.',
  'IFU': 'Identifiant Fiscal Unique — numéro fiscal de l\'entreprise.',
  'OHADA': 'Organisation pour l\'Harmonisation en Afrique du Droit des Affaires (17 États membres).',
  'AUDCIF': 'Acte Uniforme relatif au Droit Comptable et à l\'Information Financière (révision SYSCOHADA 2017).',
  'SYSCOHADA': 'Système Comptable de l\'OHADA, applicable depuis 2018 dans les 17 États membres.',
};

export function explainCompte(code: string): string {
  if (!code) return '';
  const cls = code.charAt(0);
  const c = SYSCOHADA_CLASSES[cls as keyof typeof SYSCOHADA_CLASSES];
  if (!c) return `Compte ${code} — classe inconnue.`;
  return `Compte ${code} (Classe ${cls} — ${c.label}). ${c.desc}`;
}

export function getNormSectorielle(secteur: string) {
  return SYSCOHADA_SECTORAL_NORMS[secteur] || SYSCOHADA_SECTORAL_NORMS['Industrie'];
}

// Réponse à une question SYSCOHADA générique
export function answerSyscohadaQuestion(question: string): string | null {
  const q = question.toLowerCase();
  // Recherche dans le glossaire
  for (const [term, def] of Object.entries(SYSCOHADA_GLOSSARY)) {
    if (q.includes(term.toLowerCase())) {
      return `${term} : ${def}`;
    }
  }
  // Recherche par classe
  for (const [cls, info] of Object.entries(SYSCOHADA_CLASSES)) {
    if (q.includes(`classe ${cls}`) || q.includes(`compte ${cls}`)) {
      return `Classe ${cls} — ${info.label}. ${info.desc}`;
    }
  }
  // Recherche par ratio
  for (const r of SYSCOHADA_KEY_RATIOS) {
    if (q.includes(r.code) || q.includes(r.label.toLowerCase())) {
      return `${r.label} = ${r.formula}. Cible : ${r.target}. ${r.interpretation}`;
    }
  }
  // Recherche par principe
  for (const p of SYSCOHADA_PRINCIPLES) {
    if (q.includes(p.name.toLowerCase())) {
      return `${p.name} : ${p.desc}`;
    }
  }
  if (q.includes('états financiers') || q.includes('états obligatoires')) {
    return `États financiers SYSCOHADA obligatoires : ${SYSCOHADA_REQUIRED_STATEMENTS.join(' ; ')}.`;
  }
  return null;
}
