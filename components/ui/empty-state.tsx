import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-16 text-center", className)}>
      <div className="grid size-14 place-items-center rounded-2xl border border-zinc-800/60 bg-zinc-900/60 text-zinc-600 shadow-card">
        {icon}
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-zinc-300">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
