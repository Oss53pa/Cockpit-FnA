// Données fiscales OHADA et normes sectorielles — WiseBook/Atlas Finance

export interface TauxFiscauxPays {
  tva: number; is: number; imf_min: number; imf_taux: number; patente_base: number; devise: string; zone: 'UEMOA' | 'CEMAC' | 'Autre';
}

export const TAUX_FISCAUX_OHADA: Record<string, TauxFiscauxPays> = {
  CI: { tva: 18, is: 25, imf_min: 3_000_000, imf_taux: 0.5, patente_base: 0.5, devise: 'XOF', zone: 'UEMOA' },
  SN: { tva: 18, is: 30, imf_min: 500_000, imf_taux: 0.5, patente_base: 0.4, devise: 'XOF', zone: 'UEMOA' },
  BF: { tva: 18, is: 27.5, imf_min: 1_000_000, imf_taux: 0.5, patente_base: 0.5, devise: 'XOF', zone: 'UEMOA' },
  ML: { tva: 18, is: 30, imf_min: 500_000, imf_taux: 1, patente_base: 0.4, devise: 'XOF', zone: 'UEMOA' },
  BJ: { tva: 18, is: 30, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.45, devise: 'XOF', zone: 'UEMOA' },
  NE: { tva: 19, is: 30, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'XOF', zone: 'UEMOA' },
  TG: { tva: 18, is: 27, imf_min: 800_000, imf_taux: 1, patente_base: 0.4, devise: 'XOF', zone: 'UEMOA' },
  GW: { tva: 15, is: 25, imf_min: 500_000, imf_taux: 1, patente_base: 0.4, devise: 'XOF', zone: 'UEMOA' },
  CM: { tva: 19.25, is: 33, imf_min: 2_000_000, imf_taux: 1, patente_base: 0.55, devise: 'XAF', zone: 'CEMAC' },
  GA: { tva: 18, is: 30, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'XAF', zone: 'CEMAC' },
  CG: { tva: 18.9, is: 30, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'XAF', zone: 'CEMAC' },
  CF: { tva: 19, is: 30, imf_min: 500_000, imf_taux: 1, patente_base: 0.4, devise: 'XAF', zone: 'CEMAC' },
  TD: { tva: 18, is: 35, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'XAF', zone: 'CEMAC' },
  GQ: { tva: 15, is: 35, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'XAF', zone: 'CEMAC' },
  GN: { tva: 18, is: 35, imf_min: 3_000_000, imf_taux: 3, patente_base: 0.5, devise: 'GNF', zone: 'Autre' },
  KM: { tva: 10, is: 35, imf_min: 500_000, imf_taux: 1, patente_base: 0.4, devise: 'KMF', zone: 'Autre' },
  CD: { tva: 16, is: 35, imf_min: 1_000_000, imf_taux: 1, patente_base: 0.5, devise: 'CDF', zone: 'Autre' },
};

export function getTauxFiscaux(countryCode: string): TauxFiscauxPays | undefined {
  return TAUX_FISCAUX_OHADA[countryCode.toUpperCase()];
}

export const PAYS_OHADA = [
  { code: 'CI', nom: "Côte d'Ivoire", zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'SN', nom: 'Sénégal', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'BF', nom: 'Burkina Faso', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'ML', nom: 'Mali', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'BJ', nom: 'Bénin', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'NE', nom: 'Niger', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'TG', nom: 'Togo', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'GW', nom: 'Guinée-Bissau', zone: 'UEMOA' as const, devise: 'XOF' },
  { code: 'CM', nom: 'Cameroun', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'GA', nom: 'Gabon', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'CG', nom: 'Congo', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'CF', nom: 'Centrafrique', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'TD', nom: 'Tchad', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'GQ', nom: 'Guinée Équatoriale', zone: 'CEMAC' as const, devise: 'XAF' },
  { code: 'GN', nom: 'Guinée', zone: 'Autre' as const, devise: 'GNF' },
  { code: 'KM', nom: 'Comores', zone: 'Autre' as const, devise: 'KMF' },
  { code: 'CD', nom: 'RD Congo', zone: 'Autre' as const, devise: 'CDF' },
] as const;

export type Secteur = 'commerce' | 'industrie' | 'services' | 'agriculture' | 'btp' | 'general';

export interface NormeSectorielle {
  margeBrute: [number, number]; valeurAjoutee: [number, number]; ebe: [number, number];
  rentabiliteNette: [number, number]; liquiditeGenerale: [number, number]; autonomieFinanciere: [number, number];
  dso: [number, number]; dpo: [number, number]; endettement: [number, number];
}

export const NORMES_SECTORIELLES: Record<Secteur, NormeSectorielle> = {
  commerce:    { margeBrute: [20,40], valeurAjoutee: [15,30], ebe: [5,15], rentabiliteNette: [3,10], liquiditeGenerale: [1.2,2.0], autonomieFinanciere: [0.3,0.6], dso: [30,60], dpo: [30,60], endettement: [0.5,1.5] },
  industrie:   { margeBrute: [30,50], valeurAjoutee: [25,45], ebe: [10,25], rentabiliteNette: [5,15], liquiditeGenerale: [1.3,2.5], autonomieFinanciere: [0.4,0.7], dso: [45,90], dpo: [45,90], endettement: [0.5,2.0] },
  services:    { margeBrute: [40,70], valeurAjoutee: [35,60], ebe: [15,35], rentabiliteNette: [8,20], liquiditeGenerale: [1.5,3.0], autonomieFinanciere: [0.5,0.8], dso: [30,60], dpo: [30,45], endettement: [0.3,1.0] },
  agriculture: { margeBrute: [25,45], valeurAjoutee: [20,40], ebe: [8,20], rentabiliteNette: [3,12], liquiditeGenerale: [1.0,2.0], autonomieFinanciere: [0.3,0.5], dso: [60,120], dpo: [30,60], endettement: [0.5,2.5] },
  btp:         { margeBrute: [15,35], valeurAjoutee: [20,40], ebe: [5,15], rentabiliteNette: [2,8], liquiditeGenerale: [1.0,1.8], autonomieFinanciere: [0.25,0.5], dso: [60,120], dpo: [45,90], endettement: [1.0,3.0] },
  general:     { margeBrute: [25,50], valeurAjoutee: [20,40], ebe: [10,20], rentabiliteNette: [5,12], liquiditeGenerale: [1.2,2.0], autonomieFinanciere: [0.4,0.6], dso: [45,75], dpo: [30,60], endettement: [0.5,1.5] },
};

export function getNormes(secteur?: string): NormeSectorielle {
  return NORMES_SECTORIELLES[(secteur?.toLowerCase() ?? 'general') as Secteur] ?? NORMES_SECTORIELLES.general;
}

export type TailleEntreprise = 'tpe' | 'pme' | 'eti' | 'ge';
export const SEUILS_TAILLE: Record<TailleEntreprise, { label: string; caMin: number; caMax: number; systeme: 'SMT' | 'Allégé' | 'Normal' }> = {
  tpe: { label: 'Très petite entreprise', caMin: 0, caMax: 30_000_000, systeme: 'SMT' },
  pme: { label: 'PME', caMin: 30_000_000, caMax: 100_000_000, systeme: 'Allégé' },
  eti: { label: 'ETI', caMin: 100_000_000, caMax: 1_000_000_000, systeme: 'Normal' },
  ge:  { label: 'Grande entreprise', caMin: 1_000_000_000, caMax: Infinity, systeme: 'Normal' },
};

export function detecterTaille(ca: number): TailleEntreprise {
  if (ca < 30_000_000) return 'tpe';
  if (ca < 100_000_000) return 'pme';
  if (ca < 1_000_000_000) return 'eti';
  return 'ge';
}
