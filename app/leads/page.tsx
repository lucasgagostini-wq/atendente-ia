"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Filter,
  Pencil,
  Plus,
  Save,
  Search,
  Tags,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  useBulkLeadAction,
  useLeads,
  useUpdateLead,
} from "@/hooks/use-leads";
import { useCreateTag, useTags } from "@/hooks/use-tags";
import { formatPhone } from "@/lib/utils";
import { Lead, Tag } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const stageOptions = [
  { label: "Todos estágios", value: "ALL" },
  { label: "Frio", value: "COLD" },
  { label: "Morno", value: "WARM" },
  { label: "Quente", value: "HOT" },
  { label: "Checkout", value: "CHECKOUT" },
  { label: "Cliente", value: "CUSTOMER" },
];

const statusOptions = [
  { label: "Todos status", value: "ALL" },
  { label: "Novo", value: "NEW" },
  { label: "Qualificado", value: "QUALIFIED" },
  { label: "Negociação", value: "NEGOTIATION" },
  { label: "Convertido", value: "CONVERTED" },
  { label: "Perdido", value: "LOST" },
];

const bulkActionOptions = [
  { label: "Adicionar tag", value: "ADD_TAGS" },
  { label: "Remover tag", value: "REMOVE_TAGS" },
  { label: "Atualizar campos", value: "UPDATE_FIELDS" },
  { label: "Excluir leads", value: "DELETE" },
];

type LeadDraft = {
  id: string;
  name: string;
  phone: string;
  status: string;
  funnelStage: string;
  source: string;
  interest: string;
  summary: string;
  aiEnabled: boolean;
  humanTakeover: boolean;
  tagIds: string[];
};

const EMPTY_LEADS: Lead[] = [];
const EMPTY_TAGS: Tag[] = [];

function toDraft(lead: Lead): LeadDraft {
  return {
    id: lead.id,
    name: lead.name || "",
    phone: lead.phone,
    status: lead.status,
    funnelStage: lead.funnelStage,
    source: lead.source || "",
    interest: lead.interest || "",
    summary: lead.summary || "",
    aiEnabled: lead.aiEnabled,
    humanTakeover: lead.humanTakeover,
    tagIds: lead.leadTags?.map((item) => item.tagId) ?? [],
  };
}

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [tagFilter, setTagFilter] = useState("ALL");

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadDraft | null>(null);

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");

  const [bulkAction, setBulkAction] = useState("ADD_TAGS");
  const [bulkTagId, setBulkTagId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("NO_CHANGE");
  const [bulkStage, setBulkStage] = useState("NO_CHANGE");
  const [bulkAiMode, setBulkAiMode] = useState("NO_CHANGE");
  const [bulkSource, setBulkSource] = useState("");

  const filters = useMemo(
    () => ({
      search,
      stage: stageFilter,
      status: statusFilter,
      tagId: tagFilter,
    }),
    [search, stageFilter, statusFilter, tagFilter],
  );

  const leadsQuery = useLeads(filters);
  const tagsQuery = useTags();
  const updateLead = useUpdateLead();
  const createTag = useCreateTag();
  const bulkActionMutation = useBulkLeadAction();

  const leads = leadsQuery.data ?? EMPTY_LEADS;
  const tags = tagsQuery.data ?? EMPTY_TAGS;

  const tagOptions = useMemo(
    () => [
      { label: "Todas as tags", value: "ALL" },
      ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
    ],
    [tags],
  );

  const tagOptionsForBulk = useMemo(
    () => [
      { label: "Selecione uma tag", value: "" },
      ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
    ],
    [tags],
  );

  useEffect(() => {
    if (!selectedLeadId) return;
    const lead = leads.find((item) => item.id === selectedLeadId);
    if (!lead) {
      setSelectedLeadId(null);
      setDraft(null);
      return;
    }
    if (!draft || draft.id !== lead.id) {
      setDraft(toDraft(lead));
    }
  }, [leads, selectedLeadId, draft]);

  function toggleLeadSelection(id: string) {
    setSelectedLeadIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleSelectAll() {
    const allIds = leads.map((lead) => lead.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds(allSelected ? [] : allIds);
  }

  function toggleDraftTag(tagId: string) {
    if (!draft) return;

    setDraft((current) => {
      if (!current) return null;
      const exists = current.tagIds.includes(tagId);
      return {
        ...current,
        tagIds: exists
          ? current.tagIds.filter((item) => item !== tagId)
          : [...current.tagIds, tagId],
      };
    });
  }

  async function saveLead() {
    if (!draft) return;

    try {
      const updated = await updateLead.mutateAsync({
        id: draft.id,
        body: {
          name: draft.name,
          phone: draft.phone,
          status: draft.status,
          funnelStage: draft.funnelStage,
          source: draft.source,
          interest: draft.interest,
          summary: draft.summary,
          aiEnabled: draft.aiEnabled,
          humanTakeover: draft.humanTakeover,
          tagIds: draft.tagIds,
        },
      });

      setDraft(toDraft(updated));
      toast.success("Lead atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar lead.");
    }
  }

  async function createNewTag() {
    if (!newTagName.trim()) {
      toast.error("Informe um nome para a tag.");
      return;
    }

    try {
      const created = await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      });
      setNewTagName("");
      setBulkTagId(created.id);
      toast.success("Tag criada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar tag.");
    }
  }

  async function applyBulkAction() {
    if (selectedLeadIds.length === 0) {
      toast.error("Selecione pelo menos um lead.");
      return;
    }

    try {
      if (bulkAction === "DELETE") {
        const confirmed = window.confirm(
          `Excluir ${selectedLeadIds.length} lead(s)? Essa ação não pode ser desfeita.`,
        );
        if (!confirmed) return;
      }

      if ((bulkAction === "ADD_TAGS" || bulkAction === "REMOVE_TAGS") && !bulkTagId) {
        toast.error("Selecione uma tag para essa ação.");
        return;
      }

      if (bulkAction === "UPDATE_FIELDS") {
        const data: Record<string, unknown> = {};

        if (bulkStatus !== "NO_CHANGE") data.status = bulkStatus;
        if (bulkStage !== "NO_CHANGE") data.funnelStage = bulkStage;
        if (bulkSource.trim()) data.source = bulkSource.trim();
        if (bulkAiMode === "AI_ON") {
          data.aiEnabled = true;
          data.humanTakeover = false;
        }
        if (bulkAiMode === "HUMAN_ON") {
          data.aiEnabled = false;
          data.humanTakeover = true;
        }

        if (Object.keys(data).length === 0) {
          toast.error("Defina ao menos um campo para atualização em massa.");
          return;
        }

        const result = await bulkActionMutation.mutateAsync({
          leadIds: selectedLeadIds,
          action: "UPDATE_FIELDS",
          data,
        });
        toast.success(`Atualização em massa concluída (${result.affected}).`);
        return;
      }

      const result = await bulkActionMutation.mutateAsync({
        leadIds: selectedLeadIds,
        action: bulkAction,
        tagIds: bulkTagId ? [bulkTagId] : undefined,
      });

      setSelectedLeadIds([]);
      toast.success(`Ação em massa concluída (${result.affected}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na ação em massa.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Leads</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Edite dados manualmente e execute ações em massa com tags, status e estágio.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Filtros e tags</CardTitle>
          <div className="grid gap-3 md:grid-cols-[1fr,180px,180px,220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-zinc-500" />
              <Input
                className="pl-9"
                placeholder="Buscar nome ou telefone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              options={stageOptions}
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
            />
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            />
            <Select
              options={tagOptions}
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr,140px,auto]">
            <Input
              placeholder="Nova tag"
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
            />
            <Input
              type="color"
              value={newTagColor}
              onChange={(event) => setNewTagColor(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={createNewTag}
              disabled={createTag.isPending}
            >
              <Plus className="mr-1 size-4" />
              Criar tag
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WandSparkles className="size-4" />
            Ações em massa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Select
              options={bulkActionOptions}
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value)}
            />
            <Select
              options={tagOptionsForBulk}
              value={bulkTagId}
              onChange={(event) => setBulkTagId(event.target.value)}
            />
            <Select
              options={[{ label: "Status (sem mudança)", value: "NO_CHANGE" }, ...statusOptions.slice(1)]}
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
            />
            <Select
              options={[{ label: "Estágio (sem mudança)", value: "NO_CHANGE" }, ...stageOptions.slice(1)]}
              value={bulkStage}
              onChange={(event) => setBulkStage(event.target.value)}
            />
            <Select
              options={[
                { label: "IA/Humano (sem mudança)", value: "NO_CHANGE" },
                { label: "Ativar IA", value: "AI_ON" },
                { label: "Forçar humano", value: "HUMAN_ON" },
              ]}
              value={bulkAiMode}
              onChange={(event) => setBulkAiMode(event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr,auto]">
            <Input
              placeholder="Origem (opcional para atualização em massa)"
              value={bulkSource}
              onChange={(event) => setBulkSource(event.target.value)}
            />
            <Button
              variant={bulkAction === "DELETE" ? "destructive" : "secondary"}
              onClick={applyBulkAction}
              disabled={bulkActionMutation.isPending || selectedLeadIds.length === 0}
            >
              {bulkAction === "DELETE" ? (
                <Trash2 className="mr-1 size-4" />
              ) : (
                <Filter className="mr-1 size-4" />
              )}
              Aplicar em {selectedLeadIds.length} lead(s)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lista de leads</CardTitle>
          <Button size="sm" variant="outline" onClick={toggleSelectAll}>
            Selecionar todos da página
          </Button>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="text-left text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="px-3 py-2">Sel.</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Estágio</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2">Última interação</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Origem</th>
                </tr>
              </thead>
              <tbody>
                {leadsQuery.isLoading && (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={8}>
                      Carregando leads...
                    </td>
                  </tr>
                )}
                {!leadsQuery.isLoading &&
                  leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/60 ${
                        selectedLeadId === lead.id ? "bg-zinc-900/80" : ""
                      }`}
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setDraft(toDraft(lead));
                      }}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="size-4 rounded border-zinc-700 bg-zinc-900"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-zinc-200">
                        {lead.name || "Sem nome"}
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{formatPhone(lead.phone)}</td>
                      <td className="px-3 py-3">{lead.funnelStage}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {lead.leadTags?.length ? (
                            lead.leadTags.map((item) => (
                              <Badge key={item.tag.id}>{item.tag.name}</Badge>
                            ))
                          ) : (
                            <span className="text-zinc-600">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">
                        {lead.lastMessageAt
                          ? new Date(lead.lastMessageAt).toLocaleString("pt-BR")
                          : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={lead.status === "CONVERTED" ? "success" : "default"}
                        >
                          {lead.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{lead.source || "-"}</td>
                    </tr>
                  ))}
                {!leadsQuery.isLoading && leads.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={8}>
                      Nenhum lead encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="size-4" />
              Editar lead
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Nome"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
              />
              <Input
                placeholder="Telefone"
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, phone: event.target.value } : current,
                  )
                }
              />
              <Select
                options={statusOptions.slice(1)}
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, status: event.target.value } : current,
                  )
                }
              />
              <Select
                options={stageOptions.slice(1)}
                value={draft.funnelStage}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, funnelStage: event.target.value } : current,
                  )
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Origem"
                value={draft.source}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, source: event.target.value } : current,
                  )
                }
              />
              <Input
                placeholder="Interesse"
                value={draft.interest}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, interest: event.target.value } : current,
                  )
                }
              />
            </div>

            <div>
              <p className="mb-2 text-xs text-zinc-500">Resumo</p>
              <Textarea
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, summary: event.target.value } : current,
                  )
                }
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.aiEnabled}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, aiEnabled: event.target.checked } : current,
                    )
                  }
                  className="size-4 rounded border-zinc-700 bg-zinc-900"
                />
                IA habilitada
              </label>
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.humanTakeover}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, humanTakeover: event.target.checked }
                        : current,
                    )
                  }
                  className="size-4 rounded border-zinc-700 bg-zinc-900"
                />
                Atendimento humano
              </label>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                <Tags className="size-3" />
                Tags do lead
              </p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                  >
                    <input
                      type="checkbox"
                      checked={draft.tagIds.includes(tag.id)}
                      onChange={() => toggleDraftTag(tag.id)}
                      className="size-4 rounded border-zinc-700 bg-zinc-900"
                    />
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={saveLead}
                disabled={updateLead.isPending}
              >
                <Save className="mr-1 size-4" />
                Salvar alterações
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
