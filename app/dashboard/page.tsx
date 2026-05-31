"use client";

import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Flame,
  MessageSquareText,
  RefreshCcw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MessagesChart } from "@/components/dashboard/messages-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConversations } from "@/hooks/use-conversations";
import { useLeads } from "@/hooks/use-leads";
import { formatPhone } from "@/lib/utils";

function isSameDay(dateValue: Date, target: Date) {
  return (
    dateValue.getFullYear() === target.getFullYear() &&
    dateValue.getMonth() === target.getMonth() &&
    dateValue.getDate() === target.getDate()
  );
}

export default function DashboardPage() {
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: conversations = [], isLoading: conversationsLoading } =
    useConversations();

  const metrics = useMemo(() => {
    const totalLeads = leads.length;
    const activeConversations = conversations.filter(
      (conversation) => conversation.status === "OPEN",
    ).length;
    const hotLeads = leads.filter((lead) =>
      ["HOT", "CHECKOUT"].includes(lead.funnelStage),
    ).length;
    const conversions = leads.filter((lead) => lead.status === "CONVERTED").length;
    const messagesToday = conversations.filter((conversation) => {
      const latest = conversation.messages?.[0];
      return latest?.createdAt
        ? isSameDay(new Date(latest.createdAt), new Date())
        : false;
    }).length;
    const responseRate = totalLeads ? (activeConversations / totalLeads) * 100 : 0;

    return {
      totalLeads,
      activeConversations,
      hotLeads,
      conversions,
      messagesToday,
      responseRate,
    };
  }, [conversations, leads]);

  const weeklySeries = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const currentDay = subDays(new Date(), 6 - index);
      const value = leads.filter((lead) =>
        lead.lastMessageAt ? isSameDay(new Date(lead.lastMessageAt), currentDay) : false,
      ).length;

      return {
        label: format(currentDay, "EEE", { locale: ptBR }),
        value,
      };
    });
  }, [leads]);

  const recentConversations = conversations.slice(0, 7);
  const loading = leadsLoading || conversationsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Visão geral da operação de atendimento e conversão.
          </p>
        </div>
        <Badge variant="info">
          <RefreshCcw className="mr-1 size-3" />
          Atualização automática
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Total de leads"
          value={loading ? "..." : metrics.totalLeads}
          description="Base total no funil"
          icon={Users}
        />
        <MetricCard
          title="Conversas ativas"
          value={loading ? "..." : metrics.activeConversations}
          description="Conversa aberta no momento"
          icon={MessageSquareText}
        />
        <MetricCard
          title="Mensagens hoje"
          value={loading ? "..." : metrics.messagesToday}
          description="Últimas 24 horas"
          icon={TrendingUp}
        />
        <MetricCard
          title="Leads quentes"
          value={loading ? "..." : metrics.hotLeads}
          description="Próximos de checkout"
          icon={Flame}
        />
        <MetricCard
          title="Conversões"
          value={loading ? "..." : metrics.conversions}
          description="Leads com status convertido"
          icon={Target}
        />
        <MetricCard
          title="Taxa de resposta"
          value={loading ? "..." : `${metrics.responseRate.toFixed(1)}%`}
          description="Conversas ativas por lead"
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <MessagesChart series={weeklySeries} />
        <Card>
          <CardHeader>
            <CardTitle>Últimas conversas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentConversations.length === 0 && (
              <p className="text-sm text-zinc-500">
                Nenhuma conversa registrada ainda.
              </p>
            )}
            {recentConversations.map((conversation) => (
              <div
                key={conversation.id}
                className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-200">
                    {conversation.lead?.name || "Lead sem nome"}
                  </p>
                  <Badge
                    variant={
                      conversation.status === "OPEN"
                        ? "success"
                        : conversation.status === "ARCHIVED"
                          ? "warning"
                          : "default"
                    }
                  >
                    {conversation.status}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  {formatPhone(conversation.lead?.phone ?? "-")}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
                  {conversation.messages?.[0]?.content || "Sem mensagem recente."}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

