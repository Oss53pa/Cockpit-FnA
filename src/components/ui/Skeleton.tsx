import clsx from 'clsx';

/**
 * Skeleton loader avec shimmer animation.
 * Remplace les "Chargement..." spinners par des placeholders structures.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

/** Skeleton typographique (1 ligne de texte). */
export function SkeletonText({ width = '100%', className }: { width?: string; className?: string }) {
  return <Skeleton className={clsx('h-3', className)} />;
}

/** Skeleton pour KPI card. */
export function SkeletonKPI() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-24" />
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
