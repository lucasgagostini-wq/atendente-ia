"use client";

import { useMemo } from "react";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  ChatCircleText,
  CheckCircle,
  Fire,
  Gear,
  Lightning,
  MapPin,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Robot,
  Target,
  TrendUp,
  Users,
  Warning,
  WhatsappLogo,
  TreeStructure,
} from "@phosphor-icons/react";

import { AnimatedDashboardBackground } from "@/components/ui/animated-background";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MessagesChart } from "@/components/dashboard/messages-chart";
import { Surface } from "@/components/ui/surface";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/use-conversations";
import { useLeads } from "@/hooks/use-leads";
import { useIntegrationsStatus } from "@/hooks/use-integrations";
import { useProfiles } from "@/hooks/use-profiles";
import { useAiPausedState, useToggleAiPause } from "@/hooks/use-ai-toggle";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";
import { buildProfileHref } from "@/lib/profile-utils";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const stageLabelMap: Record<string, string> = {
  COLD: "Frio", WARM: "Morno", HOT: "Quente", CHECKOUT: "Checkout", CUSTOMER: "Cliente",
};
const stageBadgeMap: Record<string, "default" | "info" | "warning" | "success" | "purple"> = {
  COLD: "default", WARM: "info", HOT: "warning", CHECKOUT: "purple", CUSTOMER: "success",
};

export default function DashboardPage() {
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: integrations } = useIntegrationsStatus();
  const { data: profileContext } = useProfiles();
  const { data: aiState } = useAiPausedState();
  const toggleAi = useToggleAiPause();
  const activeProfileSlug = useActiveProfileSlug();

  const loading = leadsLoading || conversationsLoading;
  const aiPaused = aiState?.aiPaused ?? false;
  const activeProfile = profileContext?.activeProfile;
  const profileAwaitingWhatsapp = activeProfile?.status === "AWAITING_WHATSAPP";
  const profilePaused = activeProfile?.status === "PAUSED";

  const metrics = useMemo(() => {
    const today = new Date();
    const totalLeads = leads.length;
    const openConversations = conversations.filter((c) => c.status === "OPEN").length;
    const hotLeads = leads.filter((l) => ["HOT", "CHECKOUT"].includes(l.funnelStage)).length;
    const conversions = leads.filter((l) => l.status === "CONVERTED").length;
    const messagesToday = conversations.filter((c) => {
      const latest = c.messages?.[0];
      return latest?.createdAt ? isSameDay(new Date(latest.createdAt), today) : false;
    }).length;
    const aiActive = leads.filter((l) => l.aiEnabled).length;
    return { totalLeads, openConversations, hotLeads, conversions, messagesToday, aiActive };
  }, [conversations, leads]);

  const weeklySeries = useMemo(() => {
    const today = new Date();

    return Array.from({ length: 7 }).map((_, i) => {
      const day = subDays(today, 6 - i);
      const value = leads.filter((l) =>
        l.lastMessageAt ? isSameDay(new Date(l.lastMessageAt), day) : false,
      ).length;
      return { label: format(day, "EEE", { locale: ptBR }), value };
    });
  }, [leads]);

  const recentActivity = useMemo(() =>
    conversations
      .filter((c) => c.messages?.[0])
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        name: c.lead?.name || "Lead sem nome",
        phone: c.lead?.phone,
        stage: c.lead?.funnelStage ?? "COLD",
        lastMessage: c.messages?.[0]?.content ?? "",
        time: c.messages?.[0]?.createdAt,
        status: c.status,
        aiEnabled: c.lead?.aiEnabled,
      })),
  [conversations]);

  const whatsappOk = integrations?.checks?.evolutionConnected ?? false;
  const aiOk = integrations?.checks?.openRouterConfigured ?? false;
  const webhookOk = integrations?.checks?.webhookConfigured ?? false;

  // Setup checklist
  const setupItems = [
    { label: "WhatsApp conectado",   done: whatsappOk, href: "/configuracoes", icon: WhatsappLogo, hint: whatsappOk ? "Pronto" : "npm run bridge" },
    { label: "IA configurada",       done: aiOk,       href: "/configuracoes", icon: Brain },
    { label: "Webhook ativo",        done: webhookOk,  href: "/configuracoes", icon: Lightning },
    { label: "Prompt personalizado", done: leads.length > 0 || !loading, href: "/prompt", icon: Robot },
  ];
  const setupDone = setupItems.filter((i) => i.done).length;
  const allSetup = setupDone === setupItems.length;
  const adminFlow = [
    {
      step: "01",
      title: "Preparar operação",
      description: "Conecte WhatsApp, IA e webhook antes de abrir o atendimento automático.",
      href: "/configuracoes",
      done: allSetup,
      icon: Gear,
    },
    {
      step: "02",
      title: "Definir a voz da IA",
      description: "Ajuste objetivo, tom e regras para a IA atender do jeito certo.",
      href: "/prompt",
      done: aiOk,
      icon: Robot,
    },
    {
      step: "03",
      title: "Abastecer o CRM",
      description: "Importe leads do Maps, revise tags e organize sua base para operar.",
      href: "/prospeccao",
      done: leads.length > 0,
      icon: MapPin,
    },
    {
      step: "04",
      title: "Operar e escalar",
      description: "Acompanhe conversas abertas e depois avance para disparos e automações.",
      href: "/conversas",
      done: conversations.length > 0,
      icon: ChatCircleText,
    },
  ];
  const workspaceGuide = [
    {
      title: "Atendimentos ao vivo",
      description: "Ver mensagens, assumir conversa, pausar IA e responder manualmente.",
      href: "/conversas",
      icon: ChatCircleText,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
      ring: "ring-sky-500/20",
    },
    {
      title: "Leads e CRM",
      description: "Editar dados, corrigir campos faltantes, criar tags e agir em massa.",
      href: "/leads",
      icon: Users,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      ring: "ring-indigo-500/20",
    },
    {
      title: "Prospecção no Maps",
      description: "Rodar varreduras, revisar resultados e importar só os leads úteis.",
      href: "/prospeccao",
      icon: Target,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/20",
    },
    {
      title: "Disparos e escala",
      description: "Separar por tag e preparar campanhas quando a base estiver pronta.",
      href: "/disparos",
      icon: Megaphone,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/20",
    },
  ];

  return (
    <>
      <AnimatedDashboardBackground />

      <div className="space-y-7">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1>Central de Controle</h1>
              {activeProfile && (
                <Badge variant={profileAwaitingWhatsapp ? "warning" : "info"}>
                  {activeProfile.name}
                </Badge>
              )}
              {allSetup ? (
                <StatusBadge status="active" />
              ) : (
                <Badge variant="warning">
                  <Warning size={11} weight="fill" />
                  {setupDone}/{setupItems.length} configurados
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {activeProfile
                ? `Visão geral do perfil ${activeProfile.name}.`
                : "Visão geral da operação de atendimento via WhatsApp com IA."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Botão de pausa da IA do perfil ativo */}
            <Button
              size="sm"
              variant={aiPaused ? "success" : "destructive"}
              onClick={() => toggleAi.mutate()}
              disabled={toggleAi.isPending || profileAwaitingWhatsapp}
              className="min-w-[148px] justify-center"
              aria-label={aiPaused ? "Reativar IA do perfil" : "Pausar IA do perfil"}
              aria-pressed={aiPaused}
            >
              {aiPaused ? (
                <><PlayCircle size={14} weight="duotone" aria-hidden="true" /> Ativar IA</>
              ) : (
                <><PauseCircle size={14} weight="duotone" aria-hidden="true" /> Pausar IA</>
              )}
            </Button>

            <Link href={buildProfileHref("/conversas", activeProfileSlug)}>
              <Button size="sm" variant="secondary">
                <ChatCircleText size={14} weight="duotone" aria-hidden="true" />
                Ver conversas
              </Button>
            </Link>
            <Link href={buildProfileHref("/configuracoes", activeProfileSlug)}>
              <Button size="sm" variant="outline">
                <Gear size={14} aria-hidden="true" />
                Configurar
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Banner de pausa global ──────────────────────────── */}
        {aiPaused && (
          <Surface variant="elevated" padding="none" className="overflow-hidden border-amber-700/40">
            <div className="flex items-center justify-between gap-4 bg-amber-500/8 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/25">
                  <PauseCircle size={18} weight="duotone" className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">IA pausada neste perfil</p>
                  <p className="text-xs text-amber-400/70">
                    As mensagens continuam sendo salvas, mas a IA não responde automaticamente no perfil atual.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="success"
                onClick={() => toggleAi.mutate()}
                disabled={toggleAi.isPending || profileAwaitingWhatsapp}
                className="shrink-0"
              >
                <PlayCircle size={14} weight="duotone" />
                Reativar IA
              </Button>
            </div>
          </Surface>
        )}

        {activeProfile && (
          <Surface
            variant="elevated"
            padding="md"
            className={profileAwaitingWhatsapp ? "border-amber-700/40" : undefined}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-200">{activeProfile.name}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {profileAwaitingWhatsapp
                    ? "Perfil criado. WhatsApp ainda não conectado."
                    : profilePaused
                      ? "Perfil pronto, com IA pausada por padrão."
                      : "Perfil em operação neste contexto."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={profileAwaitingWhatsapp ? "warning" : "default"}>
                  WhatsApp {integrations?.checks?.evolutionConnected ? "conectado" : "pendente"}
                </Badge>
                <Badge variant={aiPaused ? "warning" : "success"}>
                  IA {aiPaused ? "pausada" : "ativa"}
                </Badge>
              </div>
            </div>
          </Surface>
        )}

        {profileAwaitingWhatsapp && (
          <Surface variant="elevated" padding="md">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
                <WhatsappLogo size={18} weight="duotone" className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-200">WhatsApp deste perfil ainda não conectado</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  O perfil Música Personalizada já existe no app, mas ainda está aguardando o número dedicado.
                  Assim que o WhatsApp for conectado, o dashboard, as conversas e a IA passam a operar nesse contexto.
                </p>
              </div>
            </div>
          </Surface>
        )}

        {/* ── Setup checklist (só quando não está tudo configurado) ── */}
        {!allSetup && (
          <Surface variant="elevated" padding="none" className="overflow-hidden">
            <div className="border-b border-zinc-800/60 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-7 place-items-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
                    <Warning size={14} weight="duotone" className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">Configure para ativar o atendente</p>
                    <p className="text-xs text-zinc-500">{setupDone} de {setupItems.length} etapas concluídas</p>
                  </div>
                </div>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${(setupDone / setupItems.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/40 md:grid-cols-4 md:divide-y-0">
              {setupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={buildProfileHref(item.href, activeProfileSlug)}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-800/30"
                  >
                    <div className={`grid size-7 place-items-center rounded-lg ring-1 transition-colors ${
                      item.done
                        ? "bg-emerald-500/10 ring-emerald-500/20"
                        : "bg-zinc-800/60 ring-zinc-700/40"
                    }`}>
                      {item.done
                        ? <CheckCircle size={15} weight="duotone" className="text-emerald-400" />
                        : <Icon size={15} weight="duotone" className="text-zinc-500" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate text-xs font-medium ${item.done ? "text-zinc-300" : "text-zinc-500"}`}>
                        {item.label}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {item.done ? "Pronto" : ((item as { hint?: string }).hint ?? "Configurar →")}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Surface>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
          <Surface padding="none" className="overflow-hidden">
            <div className="border-b border-zinc-800/50 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Rotina do admin</p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    Ordem sugerida para usar a plataforma sem se perder.
                  </p>
                </div>
                <Badge variant={allSetup ? "success" : "warning"}>
                  {allSetup ? "Operação pronta" : "Em configuração"}
                </Badge>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/40">
              {adminFlow.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-zinc-800/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-900 ring-1 ring-zinc-800/70">
                        <span className="text-[11px] font-semibold text-zinc-400">{item.step}</span>
                      </div>
                      <div className={`grid size-9 shrink-0 place-items-center rounded-xl ring-1 ${
                        item.done ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-zinc-800/60 ring-zinc-700/40"
                      }`}>
                        <Icon size={17} weight="duotone" className={item.done ? "text-emerald-400" : "text-zinc-500"} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                        <Badge variant={item.done ? "success" : "default"}>
                          {item.done ? "Pronto" : "Abrir"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Surface>

          <Surface padding="none" className="overflow-hidden">
            <div className="border-b border-zinc-800/50 px-5 py-4">
              <p className="text-sm font-semibold text-zinc-200">Onde fazer cada coisa</p>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                Atalhos para as tarefas mais comuns dentro da operação.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {workspaceGuide.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={buildProfileHref(item.href, activeProfileSlug)}>
                    <Surface variant="interactive" padding="md" className="h-full">
                      <div className="flex items-start gap-3">
                        <div className={`grid size-9 shrink-0 place-items-center rounded-xl ring-1 ${item.bg} ${item.ring}`}>
                          <Icon size={17} weight="duotone" className={item.color} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-600">{item.description}</p>
                        </div>
                      </div>
                    </Surface>
                  </Link>
                );
              })}
            </div>
          </Surface>
        </div>

        {/* ── Status de serviços ─────────────────────── */}
        <div className="grid gap-2 sm:grid-cols-3">
          {(
          [
            {
              label: "WhatsApp",
              icon: WhatsappLogo,
              status: (whatsappOk ? "connected" : "disconnected") as "connected" | "disconnected",
              detail: whatsappOk ? integrations?.evolution?.number ?? "Conectado" : "Não configurado",
              href: "/configuracoes",
            },
            {
              label: "IA (OpenRouter)",
              icon: Brain,
              status: (aiOk ? "connected" : "disconnected") as "connected" | "disconnected",
              detail: aiOk ? (integrations?.ai?.model ?? "Configurado") : "Chave de API ausente",
              href: "/configuracoes",
            },
            {
              label: "Webhook",
              icon: Lightning,
              status: (webhookOk ? "connected" : "disconnected") as "connected" | "disconnected",
              detail: webhookOk ? "URL configurada" : "URL não definida",
              href: "/configuracoes",
            },
          ] as const
        ).map((svc) => {
            const Icon = svc.icon;
            return (
              <Link key={svc.label} href={buildProfileHref(svc.href, activeProfileSlug)}>
                <Surface variant="interactive" padding="sm" className="flex items-center gap-3">
                  <div className={`grid size-8 shrink-0 place-items-center rounded-lg ring-1 ${
                    svc.status === "connected"
                      ? "bg-emerald-500/10 ring-emerald-500/20"
                      : "bg-zinc-800/60 ring-zinc-700/40"
                  }`}>
                    <Icon size={16} weight="duotone" className={svc.status === "connected" ? "text-emerald-400" : "text-zinc-500"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-zinc-300">{svc.label}</p>
                      <StatusBadge status={svc.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-600">{svc.detail}</p>
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>

        {/* ── Métricas ────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy={loading} aria-label="Métricas da operação">
          <MetricCard title="Total de leads"      value={loading ? "—" : metrics.totalLeads}       description="Base total no funil"      icon={Users}          color="indigo" />
          <MetricCard title="Conversas abertas"   value={loading ? "—" : metrics.openConversations} description="Aguardando atendimento"   icon={ChatCircleText} color="sky"    />
          <MetricCard title="Mensagens hoje"      value={loading ? "—" : metrics.messagesToday}    description="Atividade nas últimas 24h" icon={TrendUp}        color="emerald" />
          <MetricCard title="Leads quentes"       value={loading ? "—" : metrics.hotLeads}         description="HOT + Checkout"           icon={Fire}           color="amber"  />
          <MetricCard title="Conversões"          value={loading ? "—" : metrics.conversions}      description="Status convertido"        icon={Target}         color="violet" />
          <MetricCard title="Com IA ativa"        value={loading ? "—" : metrics.aiActive}         description="IA respondendo agora"     icon={Robot}          color="rose"   />
        </div>

        {/* ── Chart + Atividade recente ─────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <MessagesChart series={weeklySeries} />

          <Surface padding="none">
            <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Atividade recente</p>
                <p className="text-[11px] text-zinc-600">Últimas conversas</p>
              </div>
              <Link href={buildProfileHref("/conversas", activeProfileSlug)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Ver todas <ArrowRight size={12} />
              </Link>
            </div>

            <div className="divide-y divide-zinc-800/40" aria-live="polite" aria-busy={loading}>
              {loading && (
                <div className="space-y-2 p-4" role="status" aria-label="Carregando atividade recente...">
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" aria-hidden="true" />)}
                </div>
              )}
              {!loading && recentActivity.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <ChatCircleText size={28} weight="duotone" className="text-zinc-700" />
                  <p className="text-sm text-zinc-600">Nenhuma conversa ainda</p>
                  <p className="text-xs text-zinc-700">Configure o WhatsApp e aguarde mensagens</p>
                </div>
              )}
              {recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={buildProfileHref("/conversas", activeProfileSlug)}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/30"
                >
                  <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400 ring-1 ring-zinc-700/50">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-zinc-200">{item.name}</p>
                      <Badge variant={stageBadgeMap[item.stage]}>{stageLabelMap[item.stage]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.lastMessage}</p>
                    {item.time && (
                      <p className="mt-0.5 text-[10px] text-zinc-700">
                        {formatDistanceToNow(new Date(item.time), { locale: ptBR, addSuffix: true })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Surface>
        </div>

        {/* ── Quick links ───────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/leads",      label: "Gerenciar Leads",    desc: "Ver e editar base de leads",    icon: Users,      color: "text-indigo-400",  bg: "bg-indigo-500/10",  ring: "ring-indigo-500/20"  },
            { href: "/prompt",     label: "Editar Prompt IA",   desc: "Personalizar comportamento",    icon: Robot,      color: "text-violet-400",  bg: "bg-violet-500/10",  ring: "ring-violet-500/20"  },
            { href: "/disparos",   label: "Criar Disparo",      desc: "Campanha de mensagens em massa", icon: Megaphone,  color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/20"   },
            { href: "/automacoes", label: "Automações",         desc: "Regras e gatilhos automáticos", icon: TreeStructure,   color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={buildProfileHref(link.href, activeProfileSlug)}>
                <Surface variant="interactive" padding="md" className="flex items-start gap-3 h-full">
                  <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1 ${link.bg} ${link.ring}`}>
                    <Icon size={16} weight="duotone" className={link.color} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{link.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{link.desc}</p>
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
