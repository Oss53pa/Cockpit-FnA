import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type Props = {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
};

export function Collapsible({ title, defaultOpen = true, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-primary-200/50 dark:hover:bg-primary-800/50 transition"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-primary-500" /> : <ChevronRight className="w-3.5 h-3.5 text-primary-500" />}
          <span className="text-[11px] uppercase tracking-wider text-primary-600 dark:text-primary-300 font-semibold">{title}</span>
        </div>
        {badge}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-primary-200 dark:border-primary-800">{children}</div>}
    </div>
  );
}
