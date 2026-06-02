"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import {
  ChatCircleText,
  Gear,
  House,
  MapPin,
  Megaphone,
  Robot,
  SignOut,
  Sparkle,
  TreeStructure,
  Users,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard",  label: "Dashboard",    icon: House,          weight: "duotone" as const },
      { href: "/conversas",  label: "Conversas",    icon: ChatCircleText, weight: "duotone" as const },
      { href: "/leads",      label: "Leads",        icon: Users,          weight: "duotone" as const },
    ],
  },
  {
    label: "Automação",
    items: [
      { href: "/disparos",   label: "Disparos",     icon: Megaphone,      weight: "duotone" as const },
      { href: "/automacoes", label: "Automações",   icon: TreeStructure,  weight: "duotone" as const },
      { href: "/prospeccao", label: "Prospecção",   icon: MapPin,         weight: "duotone" as const },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/prompt",         label: "Prompt IA",      icon: Sparkle, weight: "duotone" as const },
      { href: "/configuracoes",  label: "Configurações",  icon: Gear,    weight: "duotone" as const },
    ],
  },
];

type Props = { children: ReactNode };

export function AppShell({ children }: Props) {
  const pathname = usePathname();
  const isPublicPage = pathname === "/login" || pathname === "/setup-admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (isPublicPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px]">

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="glass-sidebar hidden w-[248px] shrink-0 flex-col border-r border-zinc-800/40 lg:flex">

          {/* Brand */}
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="relative grid size-9 place-items-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25">
              <Robot size={18} weight="duotone" className="text-indigo-400" />
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-zinc-950 status-pulse" />
            </div>
            <div className="leading-none">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Plataforma</p>
              <p className="mt-0.5 text-sm font-bold tracking-tight text-zinc-100">Atendente IA</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 scrollbar-thin">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                          active
                            ? "bg-indigo-500/12 text-indigo-300"
                            : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200",
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-400" />
                        )}
                        <Icon
                          size={16}
                          weight={active ? "duotone" : "regular"}
                          className={cn(
                            "shrink-0 transition-all",
                            active ? "text-indigo-400" : "text-zinc-600 group-hover:text-zinc-400",
                          )}
                        />
                        <span className="font-medium tracking-tight">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-zinc-800/50 px-3 py-4 space-y-1">
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-all duration-150 hover:bg-zinc-800/50 hover:text-zinc-300"
            >
              <SignOut size={16} className="shrink-0" />
              <span className="font-medium">Sair da conta</span>
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">

          {/* Header */}
          <header className="sticky top-0 z-30 glass border-b border-zinc-800/40 px-5 py-3">
            <div className="flex items-center justify-between">

              {/* Mobile brand */}
              <div className="flex items-center gap-2.5 lg:hidden">
                <div className="grid size-7 place-items-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/20">
                  <Robot size={14} weight="duotone" className="text-indigo-400" />
                </div>
                <span className="text-sm font-bold tracking-tight">Atendente IA</span>
              </div>

              {/* Desktop breadcrumb placeholder — filled by pages */}
              <div className="hidden items-center gap-2 lg:flex" id="breadcrumb-slot">
                <span className="text-sm text-zinc-600">Operação via WhatsApp + IA</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
                  <span className="size-1.5 rounded-full bg-emerald-400 status-pulse" />
                  {process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ? "local" : "produção"}
                </div>
                <button
                  onClick={logout}
                  className="hidden lg:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300"
                >
                  <SignOut size={13} />
                  Sair
                </button>
              </div>
            </div>
          </header>

          {/* Page */}
          <main className="grid-bg flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
