"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Robot, LockKey, EnvelopeSimple, SignIn, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AnimatedDashboardBackground } from "@/components/ui/animated-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao entrar.");
      toast.success("Login realizado com sucesso.");
      const params = new URLSearchParams(window.location.search);
      router.replace(params.get("next") || "/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center bg-zinc-950 px-4 text-zinc-100">
      <AnimatedDashboardBackground />

      <div className="relative w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="relative grid size-14 place-items-center rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-500/25 shadow-lg shadow-indigo-500/10">
            <Robot size={28} weight="duotone" className="text-indigo-400" />
            <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-400 ring-2 ring-zinc-950 status-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-50">Atendente IA</h1>
            <p className="mt-1 text-sm text-zinc-500">Acesso restrito · Painel administrativo</p>
          </div>
        </div>

        {/* Card */}
        <Surface variant="elevated" padding="lg">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                <EnvelopeSimple size={13} />
                E-mail
              </label>
              <Input
                type="email"
                placeholder="admin@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                <LockKey size={13} />
                Senha
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              type="submit"
              className="mt-2 w-full"
              variant="secondary"
              disabled={loading || !email || !password}
            >
              {loading ? (
                "Entrando..."
              ) : (
                <>
                  <SignIn size={15} weight="bold" />
                  Entrar na plataforma
                </>
              )}
            </Button>
          </form>
        </Surface>

        {/* Footer hint */}
        <p className="mt-4 text-center text-xs text-zinc-700">
          Primeiro acesso?{" "}
          <a href="/setup-admin" className="text-indigo-500 hover:text-indigo-400 transition-colors">
            Configurar conta admin
          </a>
        </p>
      </div>
    </div>
  );
}
