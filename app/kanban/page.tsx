"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Columns3, MessageCircle, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { useKanbanLeads, useUpdateOperationStage } from "@/hooks/use-kanban";
import { useProfiles } from "@/hooks/use-profiles";
import {
  MUSIC_OPERATION_STAGE_LABELS,
  MUSIC_OPERATION_STAGE_ORDER,
  isMusicProfileSlug,
} from "@/lib/lead-profile";
import { buildProfileHref } from "@/lib/profile-utils";
import { formatRelativeConversationTime } from "@/lib/relative-time";
import { formatPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lead, OperationStage } from "@/types";

function KanbanCard({
  lead,
  activeProfileSlug,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  activeProfileSlug: string;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
}) {
  const conversationId = lead.conversations?.[0]?.id;
  const conversationHref = conversationId
    ? buildProfileHref(`/conversas?conversationId=${conversationId}`, activeProfileSlug)
    : buildProfileHref("/conversas", activeProfileSlug);

  return (
    <article
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.18)] transition hover:border-zinc-700 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {lead.name || formatPhone(lead.phone)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{formatPhone(lead.phone)}</p>
        </div>
        <Badge variant="info">{lead.funnelStage}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="warning">Música Personalizada</Badge>
        <Badge variant="success">{lead.status}</Badge>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
        <p className="truncate text-xs text-zinc-300">{lead.lastMessage || "Sem mensagem recente"}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {lead.lastMessageAt
            ? `${formatRelativeConversationTime(lead.lastMessageAt, Date.now())} · ${new Date(lead.lastMessageAt).toLocaleString("pt-BR")}`
            : new Date(lead.updatedAt).toLocaleString("pt-BR")}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Link
          href={conversationHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 transition hover:text-indigo-300"
        >
          <MessageCircle className="size-3.5" />
          Abrir conversa
        </Link>
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
          Arraste
          <MoveRight className="size-3" />
        </span>
      </div>
    </article>
  );
}

function KanbanColumn({
  stage,
  leads,
  isOver,
  onDropLead,
  onDragOver,
  activeProfileSlug,
  onDragStart,
  onDragEnd,
}: {
  stage: OperationStage;
  leads: Lead[];
  isOver: boolean;
  onDropLead: (stage: OperationStage) => void;
  onDragOver: () => void;
  activeProfileSlug: string;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropLead(stage);
      }}
      className={`flex min-h-[640px] min-w-[320px] flex-1 flex-col rounded-[28px] border px-4 py-4 transition ${
        isOver
          ? "border-amber-400/70 bg-amber-500/8"
          : "border-zinc-800/80 bg-zinc-900/55"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            {MUSIC_OPERATION_STAGE_LABELS[stage]}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {leads.length === 1 ? "1 pedido" : `${leads.length} pedidos`}
          </p>
        </div>
        <Badge variant="default">{leads.length}</Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 px-4 text-center text-sm text-zinc-500">
            Nenhum pedido aqui
          </div>
        )}

        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            activeProfileSlug={activeProfileSlug}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </section>
  );
}

export default function KanbanPage() {
  const { data: profileContext } = useProfiles();
  const { data: leads = [], isLoading } = useKanbanLeads();
  const updateOperationStage = useUpdateOperationStage();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [hoveredStage, setHoveredStage] = useState<OperationStage | null>(null);

  const activeProfile = profileContext?.activeProfile;
  const activeSlug = profileContext?.activeSlug || activeProfile?.slug || "musica-personalizada";
  const musicProfile = isMusicProfileSlug(activeProfile?.slug);

  const groupedLeads = useMemo(() => {
    const initial = Object.fromEntries(
      MUSIC_OPERATION_STAGE_ORDER.map((stage) => [stage, [] as Lead[]]),
    ) as Record<OperationStage, Lead[]>;

    for (const lead of leads) {
      const operationStage = lead.operationStage || "PAID_ORDER";
      initial[operationStage].push(lead);
    }

    return initial;
  }, [leads]);

  async function moveLead(nextStage: OperationStage) {
    if (!draggedLeadId) return;
    const currentLead = leads.find((lead) => lead.id === draggedLeadId);
    if (!currentLead || currentLead.operationStage === nextStage) {
      setDraggedLeadId(null);
      setHoveredStage(null);
      return;
    }

    try {
      await updateOperationStage.mutateAsync({
        leadId: currentLead.id,
        operationStage: nextStage,
      });
      toast.success(`Pedido movido para ${MUSIC_OPERATION_STAGE_LABELS[nextStage]}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao mover pedido.");
    } finally {
      setDraggedLeadId(null);
      setHoveredStage(null);
    }
  }

  if (!musicProfile) {
    return (
      <div className="space-y-4">
        <div>
          <h1>Kanban operacional</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Esta visualização foi preparada para o perfil de música personalizada.
          </p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Troque para o perfil <span className="font-medium text-zinc-300">Música Personalizada</span> para ver o board de entrega.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Columns3 className="size-5 text-amber-400" />
            <h1>Kanban operacional</h1>
            {activeProfile && <Badge variant="info">{activeProfile.name}</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Organize os pedidos pagos da música personalizada em um fluxo de entrega estilo Trello.
          </p>
        </div>
        <Badge variant="success">
          {leads.length === 1 ? "1 pedido total" : `${leads.length} pedidos totais`}
        </Badge>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Carregando Kanban...
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum pedido ainda</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-500">
            Assim que os clientes da música entrarem no CRM, eles aparecerão aqui em <strong className="text-zinc-300">Pedido pago</strong>.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {MUSIC_OPERATION_STAGE_ORDER.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                leads={groupedLeads[stage]}
                isOver={hoveredStage === stage}
                activeProfileSlug={activeSlug}
                onDragStart={setDraggedLeadId}
                onDragEnd={() => {
                  setDraggedLeadId(null);
                  setHoveredStage(null);
                }}
                onDragOver={() => setHoveredStage(stage)}
                onDropLead={moveLead}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
