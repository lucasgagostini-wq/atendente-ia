import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, action, icon, className }: Props) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
