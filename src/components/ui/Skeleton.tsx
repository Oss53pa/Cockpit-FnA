import clsx from 'clsx';

/**
 * Skeleton loader avec shimmer animation premium.
 * Remplace les "Chargement..." spinners par des placeholders structurés.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

/** Skeleton typographique (1 ligne de texte). */
export function SkeletonText({ width = '100%', className }: { width?: string; className?: string }) {
  return <div style={{ width }}><Skeleton className={clsx('h-3', className)} /></div>;
}

/** Skeleton pour KPI card avec barre supérieure (matches KpiPremium). */
export function SkeletonKPI() {
  return (
    <div className="card relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary-200 dark:bg-primary-800" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  );
}

/** Grille de skeleton KPI (4 par defaut). */
export function SkeletonKPIGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonKPI key={i} />)}
    </div>
  );
}

/** Skeleton pour table (n lignes, n colonnes). */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-primary-200/60 dark:border-primary-800/60 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1 max-w-[100px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-5 py-3 border-b border-primary-100 dark:border-primary-800/40 last:border-0 flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-3', c === 0 ? 'flex-1' : 'flex-1 max-w-[80px]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton pour chart (placeholder graphique avec barres). */
export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-3 w-32 mb-4" />
      <div className="flex items-end gap-2" style={{ height }}>
        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.65, 0.85, 0.50, 0.70].map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h * 100}%` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton pour page complète (header + KPIs + graphique + table). */
export function SkeletonPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-4 border-b border-primary-200/60 dark:border-primary-800/60">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-2.5 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <SkeletonKPIGrid count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
