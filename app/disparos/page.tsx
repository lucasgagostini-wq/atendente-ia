"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Sparkles, Send, Clock3, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  useBroadcastRuns,
  useGenerateBroadcastSuggestion,
  useRunBroadcast,
} from "@/hooks/use-broadcast";
import { useLeads } from "@/hooks/use-leads";
import { useTags } from "@/hooks/use-tags";
import { Lead, Tag } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_TAGS: Tag[] = [];
const EMPTY_LEADS: Lead[] = [];

export default function DisparosPage() {
  const tagsQuery = useTags();
  const runsQuery = useBroadcastRuns();
  const suggestMutation = useGenerateBroadcastSuggestion();
  const runMutation = useRunBroadcast();

  const [selectedTagId, setSelectedTagId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState(
    "Gerar conversa qualificada com tom consultivo e não invasivo.",
  );
  const [baseMessage, setBaseMessage] = useState(
    "Oi {primeiro_nome}, tudo certo? Vi que vocês atuam com {tag} e queria te mostrar uma ideia rápida que pode trazer mais clientes pelo WhatsApp. Posso te explicar em 30 segundos?",
  );
  const [variationsText, setVariationsText] = useState("");
  const [minIntervalSeconds, setMinIntervalSeconds] = useState(4);
  const [maxIntervalSeconds, setMaxIntervalSeconds] = useState(10);
  const [maxLeads, setMaxLeads] = useState(80);

  const tags = tagsQuery.data ?? EMPTY_TAGS;
  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null;

  const leadsQuery = useLeads(
    { tagId: selectedTagId || undefined, onlyDialable: true },
    { enabled: Boolean(selectedTagId) },
  );

  const recipients = leadsQuery.data ?? EMPTY_LEADS;
  const parsedVariations = useMemo(
    () =>
      Array.from(
        new Set(
          variationsText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    [variationsText],
  );

  const tagOptions = useMemo(
    () => [
      { label: "Selecione uma tag", value: "" },
      ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
    ],
    [tags],
  );

  async function generateSuggestion() {
    if (!selectedTag) {
      toast.error("Selecione uma tag antes de pedir sugestão.");
      return;
    }

    try {
      const suggestion = await suggestMutation.mutateAsync({
        tagName: selectedTag.name,
        objective,
        baseMessage,
      });

      setBaseMessage(suggestion.suggestedMessage);
      setVariationsText(suggestion.variations.join("\n"));
      toast.success("Sugestão de copy gerada com IA.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar sugestão.");
    }
  }

  async function runBroadcast(event: FormEvent) {
    event.preventDefault();

    if (!selectedTagId) {
      toast.error("Selecione uma tag para disparo.");
      return;
    }

    if (!baseMessage.trim()) {
      toast.error("Informe a mensagem principal.");
      return;
    }

    try {
      const result = await runMutation.mutateAsync({
        tagId: selectedTagId,
        campaignName: campaignName || undefined,
        baseMessage,
        variations: parsedVariations,
        minIntervalSeconds,
        maxIntervalSeconds,
        maxLeads,
      });

      toast.success(
        `Disparo concluído: ${result.sent} enviados, ${result.failed} falhas.`,
      );
      await Promise.all([runsQuery.refetch(), leadsQuery.refetch()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao executar disparo.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Disparos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Envie mensagens em lote por tag com variações e intervalo configurável.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurar disparo</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={runBroadcast}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Tag de destino</p>
                <Select
                  options={tagOptions}
                  value={selectedTagId}
                  onChange={(event) => setSelectedTagId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Nome da campanha (opcional)</p>
                <Input
                  placeholder="Ex: prospecção hamburgueria junho"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr,auto]">
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Objetivo da comunicação</p>
                <Input
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateSuggestion}
                  disabled={suggestMutation.isPending || !selectedTag}
                >
                  {suggestMutation.isPending ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 size-4" />
                  )}
                  Gerar com IA
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Mensagem principal</p>
              <Textarea
                value={baseMessage}
                onChange={(event) => setBaseMessage(event.target.value)}
                placeholder="Mensagem que será enviada para os leads"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                Variações (uma por linha, opcional)
              </p>
              <Textarea
                value={variationsText}
                onChange={(event) => setVariationsText(event.target.value)}
                placeholder="Variação 1&#10;Variação 2&#10;Variação 3"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Intervalo mínimo (segundos)</p>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={minIntervalSeconds}
                  onChange={(event) => setMinIntervalSeconds(Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Intervalo máximo (segundos)</p>
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={maxIntervalSeconds}
                  onChange={(event) => setMaxIntervalSeconds(Number(event.target.value))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Máx. leads por execução</p>
                <Input
                  type="number"
                  min={1}
                  max={250}
                  value={maxLeads}
                  onChange={(event) => setMaxLeads(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
              Placeholders aceitos: {"{nome}"}, {"{primeiro_nome}"}, {"{tag}"},{" "}
              {"{interesse}"}, {"{telefone}"}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                {selectedTagId
                  ? `${recipients.length} leads com telefone válido para esta tag`
                  : "Selecione uma tag para estimar audiência"}
              </p>
              <Button type="submit" variant="secondary" disabled={runMutation.isPending}>
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    Executando disparo...
                  </>
                ) : (
                  <>
                    <Send className="mr-1 size-4" />
                    Iniciar disparo
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Prévia da audiência</CardTitle>
            <Tags className="size-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {!selectedTagId && (
              <p className="text-sm text-zinc-500">Escolha uma tag para visualizar leads.</p>
            )}

            {selectedTagId && leadsQuery.isLoading && (
              <p className="text-sm text-zinc-500">Carregando leads...</p>
            )}

            {selectedTagId && !leadsQuery.isLoading && recipients.length === 0 && (
              <p className="text-sm text-zinc-500">
                Nenhum lead com telefone válido nesta tag.
              </p>
            )}

            {recipients.length > 0 && (
              <div className="space-y-2">
                {recipients.slice(0, 8).map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                  >
                    <p className="text-sm text-zinc-200">{lead.name || "Sem nome"}</p>
                    <p className="text-xs text-zinc-500">{lead.phone}</p>
                  </div>
                ))}
                {recipients.length > 8 && (
                  <p className="text-xs text-zinc-500">
                    ... e mais {recipients.length - 8} lead(s).
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Últimos disparos</CardTitle>
            <Clock3 className="size-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {runsQuery.isLoading && <p className="text-sm text-zinc-500">Carregando histórico...</p>}

            {!runsQuery.isLoading && (runsQuery.data?.length ?? 0) === 0 && (
              <p className="text-sm text-zinc-500">Nenhum disparo registrado ainda.</p>
            )}

            <div className="space-y-2">
              {(runsQuery.data ?? []).map((run) => (
                <div
                  key={run.id}
                  className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                >
                  <p className="text-sm text-zinc-200">{run.message}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(run.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
