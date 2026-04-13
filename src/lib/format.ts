export const fmtMoney = (v: number, currency = 'XOF') => {
  const abs = Math.abs(v);
  let str: string;
  if (abs >= 1_000_000_000) str = (v / 1_000_000_000).toFixed(2) + ' Md';
  else if (abs >= 1_000_000) str = (v / 1_000_000).toFixed(2) + ' M';
  else if (abs >= 1_000) str = (v / 1_000).toFixed(0) + ' k';
  else str = v.toFixed(0);
  return `${str} ${currency}`;
};

export const fmtFull = (v: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);

export const fmtPct = (v: number, digits = 1) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(digits)} %`;

export const fmtRatio = (v: number, digits = 2) => v.toFixed(digits);

export const fmtK = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}Md`
  : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M`
  : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
  : String(Math.round(v));
