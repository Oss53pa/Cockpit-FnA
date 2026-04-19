/**
 * Hero du dashboard — design premium last-generation.
 * - Dégradé monochrome profond
 * - Typographie hiérarchisée (pré-titre, titre XL, sous-titre)
 * - Pastille d'icône avec anneau subtil
 * - Barre d'accent au pied pour marquer la fin du bloc
 */
export function DashHeader({ icon, title, subtitle, gradient }: { icon: string; title: string; subtitle: string; gradient?: string }) {
  const bg = gradient
    ?? 'linear-gradient(135deg, rgb(var(--p-900) / 1) 0%, rgb(var(--p-800) / 1) 55%, rgb(var(--p-700) / 0.95) 100%)';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-200/40 dark:border-primary-800/80 mb-6 shadow-sm">
      <div
        className="relative px-6 py-5 sm:px-8 sm:py-6 text-primary-50"
        style={{ background: bg }}
      >
        {/* Ornement géométrique discret */}
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute -bottom-20 -right-8 w-56 h-56 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-lg font-bold tracking-tight ring-1 ring-white/15 shrink-0"
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 mb-0.5">Dashboard</p>
            <h1 className="text-2xl sm:text-[28px] font-bold leading-none tracking-tight">{title}</h1>
            <p className="text-[12px] text-white/70 mt-1.5">{subtitle}</p>
          </div>
        </div>
      </div>
      <div aria-hidden className="h-1 bg-gradient-to-r from-primary-900/0 via-primary-900/10 to-primary-900/0 dark:via-primary-100/10" />
    </div>
  );
}
