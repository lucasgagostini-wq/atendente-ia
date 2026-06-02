/**
 * page-header.tsx
 *
 * Cabeçalho padronizado de página com título, descrição, badge de status e ações.
 * Usado em todas as páginas para garantir hierarquia visual consistente.
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, badge, actions, className }: Props) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-zinc-50" style={{ letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
