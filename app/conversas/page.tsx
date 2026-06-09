"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useMemo, useState } from "react";
import {
  ExternalLink,
  Archive,
  Bot,
  FileText,
  MessageSquarePlus,
  Play,
  Search,
  Send,
  UserRound,
  UserRoundCog,
  Zap,
  ZapOff,
  Phone,
} from "lucide-react";
import { format, isToday, isYesterday, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Input } from "@/components/ui/input";
import {
  getMediaPlaceholder,
  normalizeMediaKind,
  resolveMessagePreviewText,
} from "@/lib/message-media";
import { Conversation, Message, MessageMediaKind, MessageMediaMetadata } from "@/types";

// ─── Helpers ──────────────────────────────────────────────

const stageLabelMap: Record<string, string> = {
  COLD: "Frio", WARM: "Morno", HOT: "Quente", CHECKOUT: "Checkout", CUSTOMER: "Cliente",
};
const stageVariantMap: Record<string, "default" | "info" | "warning" | "success" | "purple"> = {
  COLD: "default", WARM: "info", HOT: "warning", CHECKOUT: "purple", CUSTOMER: "success",
};

function formatMessageTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return `Ontem ${format(date, "HH:mm")}`;
  return format(date, "dd/MM HH:mm");
}

function formatSectionTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd 'de' MMMM", { locale: ptBR });
}

function shouldShowTimestamp(current: Message, previous: Message | undefined) {
  if (!previous) return true;
  return differenceInMinutes(new Date(current.createdAt), new Date(previous.createdAt)) > 10;
}

function isGrouped(current: Message, previous: Message | undefined) {
  if (!previous) return false;
  return (
    current.direction === previous.direction &&
    differenceInMinutes(new Date(current.createdAt), new Date(previous.createdAt)) < 2
  );
}

function getLatestMessage(messages: Message[] | undefined) {
  if (!messages?.length) return undefined;

  return messages.reduce((latest, message) => (
    new Date(message.createdAt).getTime() > new Date(latest.createdAt).getTime()
      ? message
      : latest
  ));
}

/**
 * Formata tempo relativo compacto para a lista de conversas.
 * Regras: agora (< 60s) → "agora"; < 60 min → "Xm"; < 24h → "Xh";
 * < 7d → "Xd"; senão → "dd/MM".
 * Usa `now` como âncora (atualiza a cada 30s) para evitar mostrar "1 min"
 * em mensagens recém-chegadas.
 */
function formatRelativeConversationTime(dateStr: string, now: number): string {
  const diffMs = now - new Date(dateStr).getTime();
  if (diffMs < 0) return "agora";            // clock skew
  if (diffMs < 60_000) return "agora";        // < 1 min
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} d`;
  return format(new Date(dateStr), "dd/MM");
}

function getMessageMedia(message: Message): MessageMediaMetadata | null {
  const metadata = message.metadata as { media?: MessageMediaMetadata | null } | null | undefined;
  if (!metadata?.media) return null;

  return {
    ...metadata.media,
    kind: normalizeMediaKind(metadata.media.kind),
  };
}

function getMessageMediaKind(message: Message): MessageMediaKind {
  const media = getMessageMedia(message);
  if (media?.kind) return media.kind;
  if (message.type === "AUDIO") return "AUDIO";
  if (message.type === "IMAGE") return "IMAGE";
  return "TEXT";
}

function getConversationPreview(message: Message) {
  return resolveMessagePreviewText({
    content: message.content,
    mediaKind: getMessageMediaKind(message),
  });
}

function hasNonPlaceholderText(message: Message, mediaKind: MessageMediaKind) {
  const content = String(message.content || "").trim();
  if (!content) return false;
  return content !== getMediaPlaceholder(mediaKind);
}

function Initials({ name }: { name: string }) {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-700/50">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2" role="status" aria-label="IA digitando...">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-zinc-700/60 bg-zinc-800/80 px-3.5 py-2.5">
        <span aria-hidden="true" className="typing-dot size-1.5 rounded-full bg-zinc-400" />
        <span aria-hidden="true" className="typing-dot size-1.5 rounded-full bg-zinc-400" />
        <span aria-hidden="true" className="typing-dot size-1.5 rounded-full bg-zinc-400" />
      </div>
    </div>
  );
}

function MessageAttachment({ message }: { message: Message }) {
  const media = getMessageMedia(message);
  const mediaKind = getMessageMediaKind(message);
  const mediaUrl = media?.url || null;
  const placeholder = getMediaPlaceholder(mediaKind);

  if (mediaKind === "TEXT") return null;

  if (mediaKind === "IMAGE" || mediaKind === "STICKER") {
    if (mediaUrl) {
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="group block overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-950/40"
        >
          <Image
            src={mediaUrl}
            alt={placeholder}
            width={960}
            height={960}
            unoptimized
            className="max-h-72 w-full object-cover transition-transform group-hover:scale-[1.01]"
          />
        </a>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-300">
        {placeholder}
      </div>
    );
  }

  if (mediaKind === "AUDIO") {
    if (mediaUrl) {
      return (
        <audio controls preload="none" className="h-10 w-full min-w-[220px] max-w-[320px]">
          <source src={mediaUrl} type={media?.mimetype || "audio/ogg"} />
        </audio>
      );
    }

    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-700/70 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-300">
        <Play className="size-3.5" />
        {placeholder}
      </div>
    );
  }

  if (mediaKind === "VIDEO") {
    if (mediaUrl) {
      return (
        <video
          controls
          preload="metadata"
          className="max-h-72 w-full rounded-xl border border-zinc-700/60 bg-black"
        >
          <source src={mediaUrl} type={media?.mimetype || "video/mp4"} />
        </video>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-300">
        {placeholder}
      </div>
    );
  }

  return (
    <a
      href={mediaUrl || undefined}
      target={mediaUrl ? "_blank" : undefined}
      rel={mediaUrl ? "noreferrer" : undefined}
      className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-950/40 px-3 py-2 text-left text-xs text-zinc-200"
    >
      <FileText className="size-4 shrink-0 text-zinc-400" />
      <div className="min-w-0">
        <p className="truncate font-medium">
          {media?.fileName || placeholder}
        </p>
        <p className="truncate text-zinc-500">
          {media?.mimetype || placeholder}
        </p>
      </div>
      {mediaUrl && <ExternalLink className="ml-auto size-3.5 shrink-0 text-zinc-500" />}
    </a>
  );
}

// ─── Main component ────────────────────────────────────────

export default function ConversasPage() {
  const { data: conversations = [], isLoading } = useConversations();
  const { selectedConversationId, setSelectedConversationId } = useAppStore();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [manualMessage, setManualMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
  const [seenLatestMessageByConversation, setSeenLatestMessageByConversation] = useState<
    Record<string, string | null>
  >({});

  const updateConversation = useUpdateConversation();
  const updateLead = useUpdateLead();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedSeenStateRef = useRef(false);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const name = c.lead?.name?.toLowerCase() ?? "";
      const phone = c.lead?.phone ?? "";
      const bySearch = !search || name.includes(search.toLowerCase()) || phone.includes(search.trim());
      const byStage = stageFilter === "ALL" || c.lead?.funnelStage === stageFilter;
      return bySearch && byStage;
    });
  }, [conversations, search, stageFilter]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations.length > 0) {
      setSelectedConversationId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConversationId, setSelectedConversationId]);

  const { data: selectedData, refetch } = useConversation(selectedConversationId ?? undefined);
  const selected = selectedData as Conversation | undefined;
  const lead = selected?.lead;
  const messages = selected?.messages ?? [];
  const selectedLatestMessage = getLatestMessage(messages);

  useEffect(() => {
    // Atualiza a cada 30s para que mensagens recém-chegadas não apareçam
    // imediatamente como "1 min" quando relativeNow está até 59s desatualizado.
    const interval = window.setInterval(() => {
      setRelativeNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (initializedSeenStateRef.current || conversations.length === 0) return;

    initializedSeenStateRef.current = true;
    setSeenLatestMessageByConversation(
      Object.fromEntries(
        conversations.map((conversation) => [conversation.id, getLatestMessage(conversation.messages)?.id ?? null]),
      ),
    );
  }, [conversations]);

  useEffect(() => {
    if (!selectedConversationId || !selectedLatestMessage?.id) return;

    setSeenLatestMessageByConversation((current) => {
      if (current[selectedConversationId] === selectedLatestMessage.id) return current;
      return {
        ...current,
        [selectedConversationId]: selectedLatestMessage.id,
      };
    });
  }, [selectedConversationId, selectedLatestMessage?.id]);

  async function sendManualMessage(e: FormEvent) {
    e.preventDefault();
    if (!lead || !manualMessage.trim()) return;
    try {
      setSending(true);
      const res = await fetch("/api/evolution/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: lead.phone, text: manualMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar");
      setManualMessage("");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    if (!lead) return;
    const next = !lead.aiEnabled;
    await updateLead.mutateAsync({ id: lead.id, body: { aiEnabled: next, humanTakeover: !next } });
    toast.success(next ? "IA ativada para este lead." : "IA pausada.");
    await refetch();
  }

  async function assumeHuman() {
    if (!lead) return;
    await updateLead.mutateAsync({ id: lead.id, body: { aiEnabled: false, humanTakeover: true } });
    toast.success("Atendimento humano assumido.");
    await refetch();
  }

  async function archiveConversation() {
    if (!selectedConversationId) return;
    await updateConversation.mutateAsync({ id: selectedConversationId, body: { status: "ARCHIVED" } });
    toast.success("Conversa arquivada.");
    await refetch();
  }

  const stageOptions = [
    { value: "ALL", label: "Todos" },
    { value: "COLD", label: "Frio" },
    { value: "WARM", label: "Morno" },
    { value: "HOT", label: "Quente" },
    { value: "CHECKOUT", label: "Checkout" },
    { value: "CUSTOMER", label: "Cliente" },
  ];

  return (
    <div className="flex h-[calc(100vh-120px)] gap-3 overflow-hidden">

      {/* ── Conversation list ──────────────────────────── */}
      <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/60 shadow-card">

        {/* List header */}
        <div className="border-b border-zinc-800/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Conversas</h2>
            <Badge variant="default">
              {filteredConversations.filter((c) => c.status === "OPEN").length} abertas
            </Badge>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Buscar por nome ou número..."
              aria-label="Buscar conversas por nome ou número"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Stage filter */}
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1 scrollbar-thin" role="group" aria-label="Filtrar por etapa do funil">
            {stageOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStageFilter(opt.value)}
                aria-pressed={stageFilter === opt.value}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  stageFilter === opt.value
                    ? "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* List items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="space-y-2 p-3">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
            </div>
          )}

          {!isLoading && filteredConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <MessageSquarePlus className="size-8 text-zinc-700" />
              <p className="text-sm text-zinc-600">Nenhuma conversa encontrada</p>
            </div>
          )}

          {filteredConversations.map((conv) => {
            const active = conv.id === selectedConversationId;
            const latest = getLatestMessage(conv.messages);
            const name = conv.lead?.name || "Lead sem nome";
            const stage = conv.lead?.funnelStage ?? "COLD";
            const isOpen = conv.status === "OPEN";
            // Mostra não-lida sempre que a última mensagem (inbound OU outbound
            // da IA) ainda não foi vista pelo operador — assim a conversa continua
            // sinalizada mesmo que a IA já tenha respondido dentro da janela de poll.
            const isUnread = Boolean(
              latest &&
                !active &&
                seenLatestMessageByConversation[conv.id] !== latest.id,
            );

            return (
              <button
                key={conv.id}
                onClick={() => {
                  setSelectedConversationId(conv.id);
                  setSeenLatestMessageByConversation((current) => ({
                    ...current,
                    [conv.id]: latest?.id ?? null,
                  }));
                }}
                aria-current={active ? "true" : undefined}
                aria-label={`${name} — ${stageLabelMap[stage]}${isOpen ? " — aberta" : ""}${latest ? ` — ${latest.content.slice(0, 60)}` : ""}`}
                className={`group relative w-full border-b border-zinc-800/40 px-3 py-3 text-left transition-colors last:border-0 ${
                  active
                    ? "bg-indigo-500/8 border-l-2 border-l-indigo-400"
                    : "hover:bg-zinc-800/40"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative mt-0.5">
                    <Initials name={name} />
                    {isOpen && (
                      <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-1 ring-zinc-900 status-pulse" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {isUnread && (
                          <span
                            aria-label="Conversa com mensagem não lida"
                            className="size-2 shrink-0 rounded-full bg-sky-400 ring-2 ring-sky-400/20"
                          />
                        )}
                        <p className={`truncate text-sm font-medium ${active ? "text-indigo-300" : "text-zinc-200"}`}>
                          {name}
                        </p>
                      </div>
                      {latest?.createdAt && (
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {formatRelativeConversationTime(latest.createdAt, relativeNow)}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant={stageVariantMap[stage]}>
                        {stageLabelMap[stage]}
                      </Badge>
                      {conv.lead?.aiEnabled === false && (
                        <Badge variant="warning">humano</Badge>
                      )}
                    </div>

                    {latest && (
                      <p className={`mt-1 truncate text-xs ${isUnread ? "text-zinc-300" : "text-zinc-500"}`}>
                        {latest.direction === "OUTBOUND" && (
                          <span className="text-zinc-600">Você: </span>
                        )}
                        {getConversationPreview(latest)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/60 shadow-card">

        {/* Empty state */}
        {!selected && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700/50">
              <MessageSquarePlus className="size-6 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Selecione uma conversa</p>
              <p className="mt-0.5 text-xs text-zinc-600">Escolha uma conversa na lista ao lado</p>
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Initials name={lead?.name || "L"} />
                  {selected.status === "OPEN" && (
                    <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-1 ring-zinc-900 status-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-100">{lead?.name || "Lead sem nome"}</p>
                    {lead?.funnelStage && (
                      <Badge variant={stageVariantMap[lead.funnelStage]}>
                        {stageLabelMap[lead.funnelStage]}
                      </Badge>
                    )}
                    {lead && !lead.aiEnabled && (
                      <Badge variant="warning">Atendimento humano</Badge>
                    )}
                    {lead?.aiEnabled && (
                      <Badge variant="info">
                        <Bot className="size-2.5" />
                        IA ativa
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                    <Phone className="size-3" aria-hidden="true" />
                    <span>{formatPhone(lead?.phone || "-")}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleAi}
                  disabled={updateLead.isPending}
                  aria-label={lead?.aiEnabled ? "Pausar IA para este lead" : "Ativar IA para este lead"}
                >
                  {lead?.aiEnabled ? (
                    <><ZapOff className="size-3.5" aria-hidden="true" /> Pausar IA</>
                  ) : (
                    <><Zap className="size-3.5" aria-hidden="true" /> Ativar IA</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={assumeHuman}
                  disabled={updateLead.isPending}
                  aria-label="Assumir atendimento humano"
                >
                  <UserRoundCog className="size-3.5" aria-hidden="true" />
                  Assumir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={archiveConversation}
                  aria-label="Arquivar conversa"
                >
                  <Archive className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
              <div className="mx-auto max-w-2xl space-y-1">
                {messages.length === 0 && (
                  <p className="py-12 text-center text-sm text-zinc-600">Nenhuma mensagem ainda.</p>
                )}

                {messages.map((msg, i, arr) => {
                  const prev = arr[i - 1];
                  const inbound = msg.direction === "INBOUND";
                  const grouped = isGrouped(msg, prev);
                  const showTime = shouldShowTimestamp(msg, prev);
                  const isAi = msg.role === "ASSISTANT";
                  const isHuman = msg.role === "HUMAN";
                  const mediaKind = getMessageMediaKind(msg);
                  const showText = hasNonPlaceholderText(msg, mediaKind);

                  return (
                    <div key={msg.id} className="animate-fade-in-up">
                      {/* Timestamp divider */}
                      {showTime && (
                        <div className="my-4 flex items-center gap-3">
                          <div className="h-px flex-1 bg-zinc-800/60" />
                          <span className="text-[10px] text-zinc-600">
                            {formatSectionTime(msg.createdAt)}
                            {" · "}
                            {formatMessageTime(msg.createdAt)}
                          </span>
                          <div className="h-px flex-1 bg-zinc-800/60" />
                        </div>
                      )}

                      <div className={`flex ${inbound ? "justify-start" : "justify-end"} ${grouped ? "mt-0.5" : "mt-3"}`}>

                        {/* Inbound avatar placeholder */}
                        {inbound && (
                          <div className={`mr-2 mt-auto ${grouped ? "invisible" : ""}`}>
                            <Initials name={lead?.name || "L"} />
                          </div>
                        )}

                        <div className="flex flex-col gap-1" style={{ maxWidth: "72%" }}>
                          <div
                            className={`relative px-3.5 py-2.5 text-sm leading-relaxed transition-colors ${
                              inbound
                                ? `bg-zinc-800/80 text-zinc-100 border border-zinc-700/50 ${
                                    grouped
                                      ? "rounded-2xl rounded-tl-md"
                                      : "rounded-2xl rounded-tl-sm"
                                  }`
                                : isAi
                                ? `bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 ${
                                    grouped
                                      ? "rounded-2xl rounded-tr-md"
                                      : "rounded-2xl rounded-tr-sm"
                                  }`
                                : `bg-zinc-700/60 text-zinc-100 border border-zinc-600/40 ${
                                    grouped
                                      ? "rounded-2xl rounded-tr-md"
                                      : "rounded-2xl rounded-tr-sm"
                                  }`
                            }`}
                          >
                            <div className="space-y-2">
                              <MessageAttachment message={msg} />
                              {showText && (
                                <p className="whitespace-pre-wrap break-words">
                                  {msg.content}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Meta row */}
                          {!grouped && (
                            <div className={`flex items-center gap-1.5 px-1 ${inbound ? "justify-start" : "justify-end"}`}>
                              <span className="text-[10px] text-zinc-600">
                                {formatMessageTime(msg.createdAt)}
                              </span>
                              {isAi && (
                                <span className="flex items-center gap-0.5 text-[10px] text-indigo-500/70">
                                  <Bot className="size-2.5" /> IA
                                </span>
                              )}
                              {isHuman && (
                                <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                                  <UserRound className="size-2.5" /> humano
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Outbound avatar placeholder */}
                        {!inbound && (
                          <div className={`ml-2 mt-auto ${grouped ? "invisible" : ""}`}>
                            <div className={`grid size-7 shrink-0 place-items-center rounded-full ring-1 ${
                              isAi
                                ? "bg-indigo-500/15 ring-indigo-500/20 text-indigo-400"
                                : "bg-zinc-800 ring-zinc-700/50 text-zinc-400"
                            } text-xs font-semibold`}>
                              {isAi ? <Bot className="size-3.5" aria-hidden="true" /> : <UserRound className="size-3.5" aria-hidden="true" />}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {sending && (
                  <div className="mt-3 flex justify-end">
                    <div className="mr-9">
                      <TypingIndicator />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <form
              onSubmit={sendManualMessage}
              className="flex items-center gap-2 border-t border-zinc-800/60 px-4 py-3"
            >
              <div className="flex-1 relative">
                <Input
                  placeholder={lead?.aiEnabled ? "Mensagem manual (IA está respondendo)..." : "Responder..."}
                  aria-label="Digitar mensagem manual"
                  value={manualMessage}
                  onChange={(e) => setManualMessage(e.target.value)}
                  className="pr-10"
                  disabled={sending}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={!manualMessage.trim() || sending}
                className="shrink-0"
                aria-label="Enviar mensagem"
              >
                <Send className="size-3.5" />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
