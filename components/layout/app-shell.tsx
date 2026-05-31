"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import {
  Bot,
  LayoutDashboard,
  MessageCircleMore,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversas", label: "Conversas", icon: MessageCircleMore },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/prompt", label: "Prompt", icon: Sparkles },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

type Props = {
  children: ReactNode;
};

export function AppShell({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-800/80 bg-zinc-950/90 p-5 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-blue-500/20 text-blue-300">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">Sistema</p>
              <p className="text-lg font-semibold text-zinc-100">Atendente IA</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <div className="grid size-8 place-items-center rounded-md bg-blue-500/20 text-blue-300">
                  <Bot className="size-4" />
                </div>
                <span className="text-base font-semibold">Atendente IA</span>
              </div>
              <p className="hidden text-sm text-zinc-400 lg:block">
                Operação de vendas e suporte via WhatsApp
              </p>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300">
                Produção local
              </div>
            </div>
          </header>

          <main className="grid-bg flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

