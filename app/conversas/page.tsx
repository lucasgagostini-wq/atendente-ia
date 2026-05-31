"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bot, Search, Send, UserRound, UserRoundCog, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  useConversation,
  useConversations,
  useUpdateConversation,
} from "@/hooks/use-conversations";
import { useUpdateLead } from "@/hooks/use-leads";
import { formatPhone } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const stageOptions = [
  { label: "Todos os estágios", value: "ALL" },
  { label: "Frio", value: "COLD" },
  { label: "Morno", value: "WARM" },
  { label: "Quente", value: "HOT" },
  { label: "Checkout", value: "CHECKOUT" },
  { label: "Cliente", value: "CUSTOMER" },
];

export default function ConversasPage() {
  const { data: conversations = [], isLoading } = useConversations();
  const { selectedConversationId, setSelectedConversationId } = useAppStore();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [manualMessage, setManualMessage] = useState("");
  const [typing, setTyping] = useState(false);

  const updateConversation = useUpdateConversation();
  const updateLead = useUpdateLead();

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const leadName = conversation.lead?.name?.toLowerCase() ?? "";
      const leadPhone = conversation.lead?.phone ?? "";
      const bySearch =
        !search ||
        leadName.includes(search.toLowerCase()) ||
        leadPhone.includes(search.trim());
      const byStage =
        stageFilter === "ALL" || conversation.lead?.funnelStage === stageFilter;

      return bySearch && byStage;
    });
  }, [conversations, search, stageFilter]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations.length > 0) {
      setSelectedConversationId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConversationId, setSelectedConversationId]);

  const selectedConversation = useConversation(selectedConversationId ?? undefined);
  const selectedLead = selectedConversation.data?.lead;

  async function sendManualMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedLead || !manualMessage.trim()) return;

    try {
      setTyping(true);
      const response = await fetch("/api/evolution/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selectedLead.phone, text: manualMessage.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao enviar");

      setManualMessage("");
      toast.success("Mensagem enviada com sucesso.");
      await selectedConversation.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar mensagem.");
    } finally {
      setTyping(false);
    }
  }

  async function toggleAi() {
    if (!selectedLead) return;
    const nextState = !selectedLead.aiEnabled;
    await updateLead.mutateAsync({
      id: selectedLead.id,
      body: { aiEnabled: nextState, humanTakeover: !nextState },
    });
    toast.success(nextState ? "IA ativada para este lead." : "IA pausada para este lead.");
    await selectedConversation.refetch();
  }

  async function assumeHuman() {
    if (!selectedLead) return;
    await updateLead.mutateAsync({
      id: selectedLead.id,
      body: { aiEnabled: false, humanTakeover: true },
    });
    toast.success("Atendimento humano assumido.");
    await selectedConversation.refetch();
  }

  async function archiveConversation() {
    if (!selectedConversationId) return;
    await updateConversation.mutateAsync({
      id: selectedConversationId,
      body: { status: "ARCHIVED" },
    });
    toast.success("Conversa arquivada.");
    await selectedConversation.refetch();
  }

  return (
    <div className="grid h-[calc(100vh-140px)] grid-cols-1 gap-4 lg:grid-cols-[360px,1fr]">
      <Card className="flex min-h-0 flex-col">
        <div className="border-b border-zinc-800 p-4">
          <h1 className="text-lg">Conversas</h1>
          <p className="text-sm text-zinc-400">Estilo WhatsApp Web com IA e humano.</p>
          <div className="mt-4 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-zinc-500" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou telefone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              options={stageOptions}
            />
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading && <p className="p-3 text-sm text-zinc-400">Carregando...</p>}
          {!isLoading && filteredConversations.length === 0 && (
            <p className="p-3 text-sm text-zinc-500">Nenhuma conversa encontrada.</p>
          )}
          {filteredConversations.map((conversation) => {
            const active = conversation.id === selectedConversationId;
            const latest = conversation.messages?.[0]?.content;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
                className={`mb-2 w-full rounded-md border p-3 text-left transition ${
                  active
                    ? "border-blue-500/60 bg-blue-500/10"
                    : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium text-zinc-200">
                    {conversation.lead?.name || "Lead sem nome"}
                  </p>
                  <Badge variant={conversation.status === "OPEN" ? "success" : "default"}>
                    {conversation.status}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">{formatPhone(conversation.lead?.phone || "-")}</p>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
                  {latest || "Sem mensagens."}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col">
        {!selectedConversation.data && (
          <div className="grid flex-1 place-items-center text-zinc-500">
            Selecione uma conversa para começar.
          </div>
        )}

        {selectedConversation.data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
              <div>
                <h2>{selectedLead?.name || "Lead sem nome"}</h2>
                <p className="text-sm text-zinc-400">{formatPhone(selectedLead?.phone || "-")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={toggleAi}>
                  <Bot className="mr-1 size-4" />
                  {selectedLead?.aiEnabled ? "Desativar IA" : "Ativar IA"}
                </Button>
                <Button size="sm" variant="outline" onClick={assumeHuman}>
                  <UserRoundCog className="mr-1 size-4" />
                  Assumir humano
                </Button>
                <Button size="sm" variant="outline" onClick={archiveConversation}>
                  <Archive className="mr-1 size-4" />
                  Arquivar
                </Button>
              </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {selectedConversation.data.messages?.map((message) => {
                const inbound = message.direction === "INBOUND";
                return (
                  <div
                    key={message.id}
                    className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-md border px-3 py-2 text-sm ${
                        inbound
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-blue-500/40 bg-blue-500/20 text-blue-100"
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {new Date(message.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {message.role === "HUMAN" && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3" />
                            humano
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}

              {(typing || updateLead.isPending) && (
                <div className="text-xs text-zinc-500">Digitando...</div>
              )}
            </div>

            <form
              className="flex items-center gap-2 border-t border-zinc-800 p-4"
              onSubmit={sendManualMessage}
            >
              <Input
                placeholder="Responder manualmente..."
                value={manualMessage}
                onChange={(event) => setManualMessage(event.target.value)}
              />
              <Button type="submit" size="icon" disabled={!manualMessage.trim() || typing}>
                <Send className="size-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

