import { ChartCard } from './ChartCard';
import { C } from '../../lib/colors';
import { fmtK } from '../../lib/format';

type SIG = {
  margeBrute: number; valeurAjoutee: number; ebe: number;
  re: number; rf: number; rhao: number; resultat: number;
};

const ROWS = [
  { key: 'margeBrute',    label: 'Marge brute',              color: C.primary },
  { key: 'valeurAjoutee', label: 'Valeur ajoutée',           color: C.secondary },
  { key: 'ebe',           label: 'EBE',                      color: C.accent3 },
  { key: 're',            label: "Résultat d'exploitation",  color: C.info },
  { key: 'rf',            label: 'Résultat financier',       color: C.danger },
  { key: 'rhao',          label: 'Résultat HAO',             color: C.accent1 },
  { key: 'resultat',      label: 'Résultat net',             color: C.success },
] as const;

export function SIGList({ sig, ca, title = '📋 Soldes Intermédiaires de Gestion (SIG)' }: { sig: SIG; ca: number; title?: string }) {
  return (
    <ChartCard title={title}>
      <div className="text-xs space-y-0">
        {ROWS.map((it) => {
          const value = sig[it.key];
          return (
            <div key={it.key} className="flex justify-between items-center py-2 border-b border-primary-100 dark:border-primary-800 last:border-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm" style={{ background: it.color }} />
                <span className="text-primary-700 dark:text-primary-300">{it.label}</span>
              </div>
              <div className="text-right">
                <span className="num font-semibold" style={{ color: value < 0 ? C.danger : undefined }}>{fmtK(value)}</span>
                <span className="text-[10px] text-primary-400 ml-2 num">{ca ? `${((value / ca) * 100).toFixed(1)} %` : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
