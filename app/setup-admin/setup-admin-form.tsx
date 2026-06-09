"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SetupAdminForm() {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [name, setName] = useState("Lucas");
  const [email, setEmail] = useState("lucasgagostini@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();

    try {
      setLoading(true);
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken, name, email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao criar admin.");

      toast.success("Admin criado. Faça login para continuar.");
      router.replace("/login");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao criar admin.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-zinc-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-lg bg-blue-500/20 text-blue-300">
            <ShieldCheck className="size-5" />
          </div>
          <CardTitle>Configurar primeiro admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <Input
              placeholder="Token de setup"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
            />
            <Input
              placeholder="Nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Senha do admin"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button
              type="submit"
              className="w-full"
              variant="secondary"
              disabled={loading || !setupToken || !email || password.length < 8}
            >
              <ShieldCheck className="mr-1 size-4" />
              {loading ? "Criando..." : "Criar admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
