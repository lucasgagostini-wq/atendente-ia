"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretRight, ArrowLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  showBack?: boolean;
  className?: string;
};

export function Breadcrumb({ items, showBack = false, className }: Props) {
  const router = useRouter();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showBack && (
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center size-7 rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
          aria-label="Voltar"
        >
          <ArrowLeft size={13} weight="bold" />
        </button>
      )}

      <nav className="flex items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && <CaretRight size={11} className="text-zinc-700" />}
              {isLast || !item.href ? (
                <span className={cn(isLast ? "font-semibold text-zinc-200" : "text-zinc-500")}>
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  {item.label}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
