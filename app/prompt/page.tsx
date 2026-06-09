"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";
import { Prompt } from "@/types";
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
  if (!response.ok) throw new Error(payload.error || "Falha na requisição");
  return payload;
}

export default function PromptPage() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();
  const [form, setForm] = useState<Partial<Prompt>>({});

  const promptQuery = useQuery({
    queryKey: ["prompt", activeSlug],
    queryFn: () => request<Prompt>("/api/prompt"),
  });

  useEffect(() => {
    if (promptQuery.data) {
      setForm(promptQuery.data);
    }
  }, [promptQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (body: Partial<Prompt>) =>
      request<Prompt>("/api/prompt", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success("Prompt master atualizado.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompt", activeSlug] }),
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
      ]);
    },
  });

  const updateField = (key: keyof Prompt, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  async function savePrompt() {
    await updateMutation.mutateAsync(form);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Prompt Master</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ajuste personalidade, regras e estratégia de conversão da Camila.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração principal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Nome do prompt"
            value={form.name || ""}
            onChange={(event) => updateField("name", event.target.value)}
          />
          <Input
            placeholder="Tom de voz"
            value={form.tone || ""}
            onChange={(event) => updateField("tone", event.target.value)}
          />
          <Textarea
            className="md:col-span-2"
            placeholder="Personalidade da atendente"
            value={form.personality || ""}
            onChange={(event) => updateField("personality", event.target.value)}
          />
          <Textarea
            className="md:col-span-2"
            placeholder="Objetivo principal"
            value={form.goal || ""}
            onChange={(event) => updateField("goal", event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdo estratégico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Textarea
            placeholder="Regras de atendimento"
            value={form.rules || ""}
            onChange={(event) => updateField("rules", event.target.value)}
          />
          <Textarea
            placeholder="FAQ"
            value={form.faq || ""}
            onChange={(event) => updateField("faq", event.target.value)}
          />
          <Textarea
            placeholder="Objeções e respostas"
            value={form.objections || ""}
            onChange={(event) => updateField("objections", event.target.value)}
          />
          <Textarea
            placeholder="Informações da oferta"
            value={form.offer || ""}
            onChange={(event) => updateField("offer", event.target.value)}
          />
          <Input
            placeholder="CTA padrão"
            value={form.cta || ""}
            onChange={(event) => updateField("cta", event.target.value)}
          />
          <Input
            placeholder="Link de checkout"
            value={form.checkoutUrl || ""}
            onChange={(event) => updateField("checkoutUrl", event.target.value)}
          />
          <Textarea
            className="md:col-span-2"
            placeholder="Gatilhos de transferência para humano"
            value={form.transferTriggers || ""}
            onChange={(event) => updateField("transferTriggers", event.target.value)}
          />
          <div className="md:col-span-2 flex justify-end">
            <Button
              onClick={savePrompt}
              variant="secondary"
              disabled={updateMutation.isPending || promptQuery.isLoading}
            >
              <Save className="mr-1 size-4" />
              Salvar prompt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
