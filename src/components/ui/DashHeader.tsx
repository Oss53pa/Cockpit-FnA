/**
 * Hero du dashboard — niveau premium Cockpit CR / Linear.
 *
 * Améliorations vs version précédente :
 * - Gradient triple-stop (plus de profondeur)
 * - Lueur accent en bas-droite (signature visuelle)
 * - Border ring premium avec glow subtil
 * - Eyebrow plus aérée
 * - Backdrop-blur sur la badge icône
 */
export function DashHeader({ icon, title, subtitle, gradient }: { icon: string; title: string; subtitle: string; gradient?: string }) {
  const bg = gradient ?? 'linear-gradient(135deg, rgb(var(--p-950)) 0%, rgb(var(--p-900)) 40%, rgb(var(--p-800)) 100%)';
  return (
    <div className="relative overflow-hidden rounded-2xl mb-4"
      style={{ boxShadow: '0 8px 28px -6px rgb(0 0 0 / 0.15), 0 0 0 1px rgb(0 0 0 / 0.05)' }}>
      <div className="relative px-5 py-4 sm:px-6 sm:py-5 text-primary-50" style={{ background: bg }}>
        {/* Lueur accent haut-droite */}
        <div aria-hidden
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(var(--accent) / 0.20) 0%, transparent 65%)' }} />
        {/* Lueur secondaire bas-gauche */}
        <div aria-hidden
          className="absolute -bottom-20 -left-16 w-48 h-48 rounded-full pointer-events-none opacity-60"
          style={{ background: 'radial-gradient(circle, rgb(255 255 255 / 0.05) 0%, transparent 65%)' }} />
        {/* Highlight subtle haut */}
        <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-sm font-bold tracking-tight shrink-0"
            style={{ boxShadow: 'inset 0 1px 0 0 rgb(255 255 255 / 0.15), 0 0 0 1px rgb(255 255 255 / 0.10)' }}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.18em] font-semibold text-white/55 leading-none mb-1.5">Dashboard</p>
            <h1 className="text-[19px] sm:text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
            <p className="text-[11px] text-white/65 mt-0.5 leading-relaxed">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
