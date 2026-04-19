/**
 * Hero du dashboard — version compacte premium.
 */
export function DashHeader({ icon, title, subtitle, gradient }: { icon: string; title: string; subtitle: string; gradient?: string }) {
  const bg = gradient ?? 'linear-gradient(135deg, rgb(var(--p-900) / 1) 0%, rgb(var(--p-800) / 1) 55%, rgb(var(--p-700) / 0.95) 100%)';
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary-200/40 dark:border-primary-800/80 mb-4 shadow-sm">
      <div className="relative px-5 py-3.5 sm:px-6 sm:py-4 text-primary-50" style={{ background: bg }}>
        <div aria-hidden className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center text-[13px] font-bold tracking-tight ring-1 ring-white/15 shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-white/60 leading-none mb-1">Dashboard</p>
            <h1 className="text-[18px] sm:text-[20px] font-bold leading-tight tracking-tight">{title}</h1>
            <p className="text-[11px] text-white/70 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
