"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Automation } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Falha de requisição");
  return payload;
}

export default function AutomacoesPage() {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [message, setMessage] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(30);

  const automationsQuery = useQuery({
    queryKey: ["automations"],
    queryFn: () => request<Automation[]>("/api/automations"),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request("/api/automations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success("Automação criada.");
      setName("");
      setTrigger("");
      setMessage("");
      setDelayMinutes(30);
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { id: string; active: boolean }) =>
      request(`/api/automations/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: args.active }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      request(`/api/automations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      toast.success("Automação removida.");
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  async function createAutomation(event: FormEvent) {
    event.preventDefault();
    await createMutation.mutateAsync({
      name,
      trigger,
      message,
      delayMinutes: Number(delayMinutes),
      active: true,
    });
  }

  const automations = automationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1>Automações</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Follow-up inteligente por condição, delay e status ativo/inativo.
        </p>
      </div>

      {/* Banner de aviso — execução ainda não implementada */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-600/30 bg-amber-500/8 px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-amber-300">
            Funcionalidade em desenvolvimento
          </p>
          <p className="text-xs text-amber-400/80">
            As regras abaixo são salvas no banco de dados, mas <strong>ainda não são disparadas automaticamente</strong>.
            A execução real requer um job agendado (Vercel Cron ou worker dedicado), que será implementado em versão futura.
            Por enquanto, use os <strong>Disparos Manuais</strong> para enviar mensagens em lote.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova automação</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createAutomation} className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Nome da automação"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              placeholder="Condição de disparo"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
              required
            />
            <Textarea
              className="md:col-span-2"
              placeholder="Mensagem de follow-up"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
            <Input
              type="number"
              min={0}
              placeholder="Delay em minutos"
              value={delayMinutes}
              onChange={(event) => setDelayMinutes(Number(event.target.value))}
            />
            <div className="flex items-end justify-end">
              <Button type="submit" variant="secondary" disabled={createMutation.isPending}>
                <Plus className="mr-1 size-4" />
                Criar automação
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de automações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {automationsQuery.isLoading && (
            <p className="text-sm text-zinc-500">Carregando automações...</p>
          )}
          {!automationsQuery.isLoading && automations.length === 0 && (
            <p className="text-sm text-zinc-500">Nenhuma automação cadastrada.</p>
          )}
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-zinc-200">{automation.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={automation.active ? "success" : "warning"}>
                    {automation.active ? "Ativa" : "Inativa"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: automation.id,
                        active: !automation.active,
                      })
                    }
                  >
                    {automation.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(automation.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-zinc-400">Condição: {automation.trigger}</p>
              <p className="mt-1 text-sm text-zinc-300">{automation.message}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Delay: {automation.delayMinutes} minuto(s)
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

