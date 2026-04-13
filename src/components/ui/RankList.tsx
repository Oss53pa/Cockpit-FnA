import { fmtMoney } from '../../lib/format';

type Item = { label: string; sub?: string; value: number };

export function RankList({ items, color = '#171717' }: { items: Item[]; color?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => {
        const pct = (Math.abs(it.value) / max) * 100;
        return (
          <li key={i} className="relative">
            <div className="flex items-center gap-3">
              <span className="num text-[10px] font-bold text-primary-400 w-5 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{it.label}</span>
                  <span className="num text-xs font-semibold shrink-0">{fmtMoney(it.value)}</span>
                </div>
                <div className="h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color} 0%, ${color}88 100%)` }} />
                </div>
                {it.sub && <p className="text-[10px] text-primary-500 mt-0.5">{it.sub}</p>}
              </div>
            </div>
          </li>
        );
      })}
      {items.length === 0 && <li className="text-xs text-primary-500 py-4 text-center">Aucune donnée</li>}
    </ol>
  );
}
