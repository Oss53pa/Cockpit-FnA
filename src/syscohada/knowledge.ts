// Knowledge base SYSCOHADA — Principes, écritures types, états financiers

export interface KnowledgeChunk {
  id: string; category: string; title: string; content: string; legalRefs?: string[]; keywords: string[];
}

export const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  { id: 'principes', category: 'principes', title: 'Les 10 principes comptables SYSCOHADA',
    content: `1. Prudence (Art. 3 AUDCIF)\n2. Permanence des méthodes (Art. 40)\n3. Correspondance bilan ouverture/clôture (Art. 34)\n4. Coût historique (Art. 35)\n5. Continuité d'exploitation (Art. 39)\n6. Indépendance des exercices (Art. 48)\n7. Intangibilité du bilan (Art. 34)\n8. Importance significative (Art. 33)\n9. Prééminence de la réalité sur l'apparence (Art. 6)\n10. Non-compensation (Art. 34)`,
    legalRefs: ['AUDCIF Art. 3, 6, 33-35, 39-40, 48'], keywords: ['principes', 'prudence', 'permanence', 'AUDCIF'] },
  { id: 'etats', category: 'etats_financiers', title: 'États financiers obligatoires SYSCOHADA',
    content: `Système Normal : Bilan, CR, TFT, Variation CP, Notes annexes.\nSystème Allégé : Bilan et CR simplifiés.\nDélai de dépôt : 4 mois après clôture.`,
    legalRefs: ['AUDCIF Art. 8, 23, 29-35'], keywords: ['bilan', 'CR', 'TFT', 'notes annexes', 'liasse'] },
  { id: 'sig', category: 'analyse', title: 'Soldes Intermédiaires de Gestion (SIG)',
    content: `MB = Ventes - Achats - Var. stocks\nVA = MB + Prod. immo. + Subv. - Services ext. - Impôts\nEBE = VA - Personnel\nRE = EBE - Dotations + Reprises\nRF = Prod. fin. - Charges fin.\nRAO = RE + RF\nRN = RAO + RHAO - Participation - Impôt`,
    keywords: ['SIG', 'marge brute', 'valeur ajoutée', 'EBE', 'résultat'] },
  { id: 'ratios', category: 'analyse', title: 'Ratios financiers SYSCOHADA',
    content: `Rentabilité : MB/CA (>30%), VA/CA (>35%), EBE/CA (>15%), RN/CA (>8%), ROE (>12%), ROA (>6%)\nLiquidité : LG (>1.5x), LR (>1.0x), LI (>0.3x)\nStructure : AF (>0.5), END (<1.0), CAP_REMB (<4x)\nActivité : DSO (<60j), DPO (45-60j)`,
    keywords: ['ratio', 'rentabilité', 'liquidité', 'structure', 'DSO', 'ROE'] },
  { id: 'frbfrtn', category: 'analyse', title: 'FR, BFR, Trésorerie nette',
    content: `FR = Ressources stables - Actif immobilisé\nBFR = Stocks + Créances - Dettes exploitation\nTN = FR - BFR = Tréso active - Tréso passive\nÉquation : FR - BFR = TN`,
    keywords: ['FR', 'BFR', 'trésorerie', 'fonds de roulement', 'cycle exploitation'] },
  { id: 'achat', category: 'ecritures', title: 'Achat de marchandises avec TVA',
    content: `D 601 Achats — HT\nD 4452 TVA récupérable — TVA\n  C 401 Fournisseurs — TTC`, keywords: ['achat', 'TVA', 'fournisseur'] },
  { id: 'vente', category: 'ecritures', title: 'Vente de marchandises avec TVA',
    content: `D 411 Clients — TTC\n  C 701 Ventes — HT\n  C 4431 TVA facturée — TVA`, keywords: ['vente', 'TVA', 'client'] },
  { id: 'salaire', category: 'ecritures', title: 'Comptabilisation des salaires',
    content: `D 661 Rémunérations — brut\n  C 421 Personnel — net\n  C 431 Sécurité sociale — part salariale\n  C 447 État, impôts retenus — ITS`, keywords: ['salaire', 'paie', 'personnel', 'CNPS'] },
  { id: 'amort', category: 'ecritures', title: 'Dotation aux amortissements',
    content: `D 681 Dotations amortissements — annuité\n  C 28x Amortissements — annuité\nDurées : Logiciels 3-5 ans, Bâtiments 20-50 ans, Matériel 5-10 ans, Transport 4-5 ans`, keywords: ['amortissement', 'dotation', 'immobilisation'] },
  { id: 'is', category: 'fiscalite', title: 'Impôt sur les Sociétés OHADA',
    content: `IS : CI 25%, SN 30%, CM 33%, GA 30%.\nIMF : 0.5% à 3% du CA selon le pays.\nÉcriture : D 891 / C 441.`, keywords: ['IS', 'impôt', 'IMF', 'sociétés'] },
  { id: 'tva', category: 'fiscalite', title: 'TVA en zone OHADA',
    content: `Taux normal : 18% (UEMOA) à 19.25% (CM).\nTVA à reverser = 443 - 445.\nÉcriture : D 443 / C 445 / C 444.`, keywords: ['TVA', 'collectée', 'déductible'] },
  { id: 'cloture', category: 'audit', title: 'Contrôles de clôture SYSCOHADA',
    content: `1. Équilibre général (D=C)\n2. Résultat cohérent (12 = classes 6-8)\n3. Bilan équilibré (A=P)\n4. Soldes anormaux\n5. Lettrage créances/dettes\n6. Rapprochement bancaire\n7. Cut-off\n8. Provisions\n9. Amortissements`, keywords: ['clôture', 'contrôle', 'audit', 'équilibre'] },
  { id: 'zscore', category: 'analyse', title: 'Z-Score Altman adapté SYSCOHADA',
    content: `Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5\nX1=BFR/Actif, X2=RN/Actif, X3=EBE/Actif, X4=CP/Dettes, X5=CA/Actif\nZ>2.99 Sûr, 1.81<Z<2.99 Grise, Z<1.81 Risque`,
    keywords: ['Z-Score', 'Altman', 'risque', 'défaillance', 'scoring'] },
];

export function searchKnowledge(query: string, limit = 5): KnowledgeChunk[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return KNOWLEDGE_BASE.map((c) => {
    let score = 0;
    const hay = `${c.title} ${c.content} ${c.keywords.join(' ')}`.toLowerCase();
    for (const w of words) {
      if (c.keywords.some((k) => k.includes(w))) score += 3;
      if (c.title.toLowerCase().includes(w)) score += 2;
      if (hay.includes(w)) score += 1;
    }
    return { c, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.c);
}
