"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import {
  ArrowLeft,
  Robot,
  SignOut,
} from "@phosphor-icons/react";
import { AdminCommandPalette } from "@/components/admin-console/admin-command-palette";
import { cn } from "@/lib/utils";
import { buildBreadcrumbItems, getPageContext, navGroups } from "@/lib/navigation";

type Props = { children: ReactNode };

export function AppShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = pathname === "/login" || pathname === "/setup-admin";
  const pageContext = getPageContext(pathname);
  const breadcrumbItems = buildBreadcrumbItems(pathname);
  const siblingItems = pageContext.group?.items ?? [];
  const showBack = !isPublicPage && pathname !== "/dashboard";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/dashboard");
  }

  if (isPublicPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AdminCommandPalette />
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">

                {/* Mobile brand */}
                <div className="flex items-center gap-2.5 lg:hidden">
                  <div className="grid size-7 place-items-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/20">
                    <Robot size={14} weight="duotone" className="text-indigo-400" />
                  </div>
                  <span className="text-sm font-bold tracking-tight">Atendente IA</span>
                </div>

                <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
                  {showBack && (
                    <button
                      onClick={goBack}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-zinc-500 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                      aria-label="Voltar"
                    >
                      <ArrowLeft size={14} weight="bold" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      {breadcrumbItems.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                          {index > 0 && <span className="text-zinc-700">/</span>}
                          {item.href ? (
                            <Link href={item.href} className="transition-colors hover:text-zinc-300">
                              {item.label}
                            </Link>
                          ) : (
                            <span className="font-medium text-zinc-200">{item.label}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-600">
                      {pageContext.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
                    <span className="size-1.5 rounded-full bg-emerald-400 status-pulse" />
                    {(process.env.NEXT_PUBLIC_APP_URL ?? "").includes("localhost") ? "local" : "produção"}
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

              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
                {showBack && (
                  <button
                    onClick={goBack}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
                  >
                    <ArrowLeft size={12} weight="bold" />
                    Voltar
                  </button>
                )}

                {siblingItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all",
                        active
                          ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                          : "border-zinc-800/60 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-800/70 hover:text-zinc-200",
                      )}
                    >
                      <Icon size={12} weight={active ? "duotone" : "regular"} />
                      {item.shortLabel}
                    </Link>
                  );
                })}
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
