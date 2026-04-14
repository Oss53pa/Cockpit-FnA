// Templates d'import ERP — Mappings spécifiques par logiciel comptable

export interface ERPTemplate {
  id: string;
  name: string;
  description: string;
  separator: ',' | ';' | '\t' | '|';
  encoding: 'utf-8' | 'latin1' | 'windows-1252';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY';
  decimalSeparator: '.' | ',';
  columns: Record<string, string[]>; // field → possible header names
  skipRows?: number;
  headerRow?: number;
  detectPatterns?: string[]; // patterns to auto-detect this ERP
}

export const ERP_TEMPLATES: ERPTemplate[] = [
  {
    id: 'sage',
    name: 'SAGE Comptabilité',
    description: 'SAGE 100 / SAGE Ligne 100 / SAGE i7',
    separator: ';',
    encoding: 'windows-1252',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    columns: {
      account: ['N° Compte', 'Compte', 'Compte Général', 'CompteG', 'N°Cpte'],
      label: ['Libellé', 'Libellé écriture', 'Lib', 'Intitulé'],
      date: ['Date', 'Date écriture', 'Date pièce', 'Dt'],
      journal: ['Journal', 'Code Journal', 'Jnl', 'Journal Code'],
      piece: ['N° Pièce', 'Pièce', 'NumPièce', 'Réf. Pièce'],
      debit: ['Débit', 'Montant Débit', 'Mvt Débit'],
      credit: ['Crédit', 'Montant Crédit', 'Mvt Crédit'],
      tiers: ['Compte Tiers', 'Tiers', 'Compte Auxiliaire', 'Auxiliaire'],
    },
    detectPatterns: ['SAGE', 'N° Compte', 'Code Journal', 'Réf. Pièce'],
  },
  {
    id: 'perfecto',
    name: 'PERFECTO',
    description: 'PERFECTO Comptabilité (Afrique de l\'Ouest)',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    columns: {
      account: ['COMPTE', 'NUM_COMPTE', 'CPT'],
      label: ['LIBELLE', 'LIB_ECRITURE', 'DESIGNATION'],
      date: ['DATE', 'DATE_ECRITURE', 'DATE_PIECE'],
      journal: ['JOURNAL', 'CODE_JOURNAL', 'JRN'],
      piece: ['PIECE', 'NUM_PIECE', 'REF'],
      debit: ['DEBIT', 'MT_DEBIT'],
      credit: ['CREDIT', 'MT_CREDIT'],
      tiers: ['TIERS', 'CODE_TIERS', 'AUX'],
    },
    detectPatterns: ['PERFECTO', 'NUM_COMPTE', 'CODE_JOURNAL'],
  },
  {
    id: 'saari',
    name: 'SAARI Comptabilité',
    description: 'SAARI / Sage Saari',
    separator: ';',
    encoding: 'windows-1252',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    columns: {
      account: ['Compte', 'N° Compte', 'N°Cpte'],
      label: ['Libellé', 'Intitulé', 'Lib'],
      date: ['Date', 'Date écriture'],
      journal: ['Journal', 'Jnl'],
      piece: ['Pièce', 'N° Pièce', 'Référence'],
      debit: ['Débit', 'Mvt Débit'],
      credit: ['Crédit', 'Mvt Crédit'],
      tiers: ['Tiers', 'Auxiliaire'],
    },
    detectPatterns: ['SAARI', 'Mvt Débit', 'Mvt Crédit'],
  },
  {
    id: 'cegid',
    name: 'CEGID',
    description: 'CEGID Expert / CEGID Quadra',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    columns: {
      account: ['Compte', 'Numéro de compte'],
      label: ['Libellé', 'Libellé de l\'écriture'],
      date: ['Date', 'Date comptable'],
      journal: ['Journal', 'Code journal'],
      piece: ['Pièce', 'Numéro de pièce'],
      debit: ['Débit', 'Montant débit'],
      credit: ['Crédit', 'Montant crédit'],
      tiers: ['Tiers', 'Compte auxiliaire'],
    },
    detectPatterns: ['CEGID', 'Quadra', 'Date comptable'],
  },
  {
    id: 'odoo',
    name: 'Odoo',
    description: 'Odoo Comptabilité (export CSV)',
    separator: ',',
    encoding: 'utf-8',
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
    columns: {
      account: ['Account', 'account_code', 'Code'],
      label: ['Label', 'Name', 'name', 'Communication'],
      date: ['Date', 'date', 'Invoice Date'],
      journal: ['Journal', 'journal_code', 'Journal Code'],
      piece: ['Reference', 'Ref', 'Move', 'Number'],
      debit: ['Debit', 'debit'],
      credit: ['Credit', 'credit'],
      tiers: ['Partner', 'partner_name', 'Customer'],
    },
    detectPatterns: ['Odoo', 'account_code', 'journal_code', 'partner_name'],
  },
  {
    id: 'sap',
    name: 'SAP',
    description: 'SAP Business One / SAP S/4HANA (export FBL3N)',
    separator: '\t',
    encoding: 'utf-8',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
    columns: {
      account: ['G/L Account', 'Compte', 'Account Number'],
      label: ['Text', 'Description', 'Document Header Text'],
      date: ['Posting Date', 'Document Date', 'Date'],
      journal: ['Document Type', 'Type'],
      piece: ['Document Number', 'Doc. No.', 'Reference'],
      debit: ['Debit', 'Amount in LC (Debit)'],
      credit: ['Credit', 'Amount in LC (Credit)'],
      tiers: ['Customer', 'Vendor', 'Business Partner'],
    },
    detectPatterns: ['SAP', 'G/L Account', 'Posting Date', 'Document Number'],
  },
  {
    id: 'generic',
    name: 'Générique',
    description: 'Format standard CockPit F&A',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
    columns: {
      account: ['COMPTE', 'Account', 'Compte'],
      label: ['LIBELLE', 'DESCRIPTION', 'Label', 'Libellé'],
      date: ['DATE', 'Date'],
      journal: ['JOURNAL', 'Journal'],
      piece: ['PIECE', 'NUMERO DE SAISIE', 'Reference'],
      debit: ['DEBIT', 'Débit', 'Debit'],
      credit: ['CREDIT', 'Crédit', 'Credit'],
      tiers: ['TIERS', 'Tiers', 'Partner'],
    },
    detectPatterns: [],
  },
];

export function detectERP(headers: string[]): ERPTemplate | null {
  const headerStr = headers.join(' ').toLowerCase();
  for (const tmpl of ERP_TEMPLATES) {
    if (!tmpl.detectPatterns?.length) continue;
    const matches = tmpl.detectPatterns.filter((p) => headerStr.includes(p.toLowerCase()));
    if (matches.length >= 2) return tmpl;
  }
  return null;
}

export function getTemplate(id: string): ERPTemplate | undefined {
  return ERP_TEMPLATES.find((t) => t.id === id);
}
