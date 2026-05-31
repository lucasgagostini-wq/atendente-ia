"use client";

import { useMemo, useState } from "react";
import { Search, Save } from "lucide-react";
import { toast } from "sonner";
import { useLeads, useUpdateLead } from "@/hooks/use-leads";
import { formatPhone } from "@/lib/utils";
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

export default function LeadsPage() {
  const { data: leads = [], isLoading } = useLeads();
  const updateLead = useUpdateLead();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const bySearch =
        !search ||
        (lead.name || "").toLowerCase().includes(search.toLowerCase()) ||
        lead.phone.includes(search.trim());
      const byStage = stageFilter === "ALL" || lead.funnelStage === stageFilter;
      const byStatus = statusFilter === "ALL" || lead.status === statusFilter;
      return bySearch && byStage && byStatus;
    });
  }, [leads, search, stageFilter, statusFilter]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;

  async function saveLead() {
    if (!selectedLead) return;
    await updateLead.mutateAsync({
      id: selectedLead.id,
      body: {
        summary: summaryDraft,
      },
    });
    toast.success("Lead atualizado.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Leads</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Gestão de funil, status, tags e contexto de conversão.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Filtro de leads</CardTitle>
          <div className="grid gap-2 md:grid-cols-3">
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Estágio</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2">Última interação</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={8}>
                      Carregando leads...
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/60 ${
                        selectedLeadId === lead.id ? "bg-zinc-900/80" : ""
                      }`}
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setSummaryDraft(lead.summary || "");
                      }}
                    >
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
                      <td className="px-3 py-3 text-zinc-300">
                        {lead.status === "CONVERTED" ? "Sim" : "Não"}
                      </td>
                    </tr>
                  ))}
                {!isLoading && filtered.length === 0 && (
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

      {selectedLead && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhe do lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Nome</p>
                <p className="text-sm text-zinc-200">{selectedLead.name || "Sem nome"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Telefone</p>
                <p className="text-sm text-zinc-200">{formatPhone(selectedLead.phone)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">IA</p>
                <p className="text-sm text-zinc-200">
                  {selectedLead.aiEnabled ? "Ativa" : "Pausada"}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-500">Resumo da conversa</p>
              <Textarea
                value={summaryDraft}
                onChange={(event) => setSummaryDraft(event.target.value)}
                placeholder="Contexto, interesse, objeções e próximos passos"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={saveLead}
                disabled={updateLead.isPending}
              >
                <Save className="mr-1 size-4" />
                Salvar detalhe
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

