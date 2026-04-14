// Multi-devises — Taux de change et conversion

export interface ExchangeRate {
  date: string;       // YYYY-MM-DD
  from: string;       // EUR, USD, XOF...
  to: string;
  rate: number;
}

const KEY = 'exchange-rates';

export function loadRates(): ExchangeRate[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export function saveRates(rates: ExchangeRate[]): void {
  localStorage.setItem(KEY, JSON.stringify(rates));
}

export function addRate(rate: ExchangeRate): void {
  const rates = loadRates();
  rates.push(rate);
  rates.sort((a, b) => b.date.localeCompare(a.date));
  saveRates(rates);
}

export function getRate(from: string, to: string, date?: string): number | null {
  if (from === to) return 1;
  const rates = loadRates();
  const target = date ?? new Date().toISOString().split('T')[0];
  // Cherche le taux le plus proche (même jour ou avant)
  const candidates = rates.filter((r) =>
    ((r.from === from && r.to === to) || (r.from === to && r.to === from)) && r.date <= target
  ).sort((a, b) => b.date.localeCompare(a.date));

  if (candidates.length === 0) return null;
  const r = candidates[0];
  return r.from === from ? r.rate : 1 / r.rate;
}

export function convert(amount: number, from: string, to: string, date?: string): number | null {
  const rate = getRate(from, to, date);
  return rate !== null ? amount * rate : null;
}

// Devises courantes OHADA
export const CURRENCIES = [
  { code: 'XOF', name: 'Franc CFA UEMOA', symbol: 'FCFA' },
  { code: 'XAF', name: 'Franc CFA CEMAC', symbol: 'FCFA' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'Dollar US', symbol: '$' },
  { code: 'GBP', name: 'Livre sterling', symbol: '£' },
  { code: 'GNF', name: 'Franc guinéen', symbol: 'FG' },
  { code: 'CDF', name: 'Franc congolais', symbol: 'FC' },
  { code: 'KMF', name: 'Franc comorien', symbol: 'KMF' },
  { code: 'NGN', name: 'Naira nigérian', symbol: '₦' },
  { code: 'GHS', name: 'Cédi ghanéen', symbol: 'GH₵' },
] as const;

// Taux fixes UEMOA/CEMAC vs EUR
export const FIXED_RATES: ExchangeRate[] = [
  { date: '2000-01-01', from: 'EUR', to: 'XOF', rate: 655.957 },
  { date: '2000-01-01', from: 'EUR', to: 'XAF', rate: 655.957 },
];
