export function DashHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string; gradient?: string }) {
  return (
    <div className="card px-6 py-4 mb-5">
      <p className="text-lg font-bold text-primary-900 dark:text-primary-50">{icon} {title}</p>
      <p className="text-[11px] text-primary-500 mt-0.5">{subtitle}</p>
    </div>
  );
}
