"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateProspectingJob,
  useImportProspectingLeads,
  useProspectingJob,
  useProspectingJobs,
} from "@/hooks/use-prospector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProspectingJob } from "@/types";

const EMPTY_JOBS: ProspectingJob[] = [];

export default function ProspeccaoPage() {
  const jobsQuery = useProspectingJobs();
  const createJob = useCreateProspectingJob();
  const importLeads = useImportProspectingLeads();

  const [searchQuery, setSearchQuery] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const selectedJobQuery = useProspectingJob(selectedJobId ?? undefined);
  const jobs = jobsQuery.data || EMPTY_JOBS;
  const selectedJob = selectedJobQuery.data;

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  useEffect(() => {
    setSelectedLeadIds([]);
  }, [selectedJobId]);

  const notImportedLeads = useMemo(() => {
    return (selectedJob?.leads ?? []).filter((lead) => !lead.imported);
  }, [selectedJob?.leads]);

  async function executeSearch(event: FormEvent) {
    event.preventDefault();

    try {
      const job = await createJob.mutateAsync({
        query: searchQuery,
        maxResults,
      });

      if (job?.id) {
        setSelectedJobId(job.id);
        await selectedJobQuery.refetch();
      }

      toast.success("Varredura de Google Maps concluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na prospecção.");
    }
  }

  async function importSelected() {
    if (!selectedJobId || selectedLeadIds.length === 0) return;
    try {
      const result = await importLeads.mutateAsync({
        jobId: selectedJobId,
        leadIds: selectedLeadIds,
      });

      toast.success(`${result.importedCount} lead(s) importado(s) para o CRM.`);
      setSelectedLeadIds([]);
      await Promise.all([selectedJobQuery.refetch(), jobsQuery.refetch()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar.");
    }
  }

  function toggleLeadSelection(id: string) {
    setSelectedLeadIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleSelectAll() {
    const allIds = notImportedLeads.map((lead) => lead.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds(allSelected ? [] : allIds);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Prospecção</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Varredura de Google Maps para encontrar leads e importar direto no CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova varredura</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr,160px,auto]" onSubmit={executeSearch}>
            <Input
              placeholder="Ex: hamburgueria em Florianópolis"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              required
            />
            <Input
              type="number"
              min={1}
              max={100}
              value={maxResults}
              onChange={(event) => setMaxResults(Number(event.target.value))}
            />
            <Button type="submit" variant="secondary" disabled={createJob.isPending}>
              {createJob.isPending ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Search className="mr-1 size-4" />
                  Buscar no Maps
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        <Card className="min-h-[520px]">
          <CardHeader>
            <CardTitle>Histórico de jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobsQuery.isLoading && <p className="text-sm text-zinc-500">Carregando...</p>}
            {!jobsQuery.isLoading && jobs.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum job executado ainda.</p>
            )}

            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`w-full rounded-md border p-3 text-left ${
                  selectedJobId === job.id
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900"
                }`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium text-zinc-200">{job.query}</p>
                  <Badge
                    variant={
                      job.status === "COMPLETED"
                        ? "success"
                        : job.status === "FAILED"
                          ? "error"
                          : "warning"
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">
                  {new Date(job.createdAt).toLocaleString("pt-BR")}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Resultados: {job.resultsCount} | Importados: {job.importedCount}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-[520px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leads encontrados</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                disabled={notImportedLeads.length === 0}
              >
                Selecionar todos
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={importSelected}
                disabled={selectedLeadIds.length === 0 || importLeads.isPending}
              >
                <Upload className="mr-1 size-4" />
                Importar ({selectedLeadIds.length})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedJobId && (
              <p className="text-sm text-zinc-500">Selecione um job para visualizar os leads.</p>
            )}

            {selectedJobQuery.isLoading && selectedJobId && (
              <p className="text-sm text-zinc-500">Carregando resultados...</p>
            )}

            {selectedJob && selectedJob.leads && (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2">Sel.</th>
                      <th className="px-3 py-2">Empresa</th>
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Avaliação</th>
                      <th className="px-3 py-2">Endereço</th>
                      <th className="px-3 py-2">Site</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedJob.leads.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-zinc-500" colSpan={7}>
                          Este job não retornou leads.
                        </td>
                      </tr>
                    )}

                    {selectedJob.leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-zinc-900">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead.id)}
                            onChange={() => toggleLeadSelection(lead.id)}
                            disabled={lead.imported}
                            className="size-4 rounded border-zinc-700 bg-zinc-900"
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-zinc-200">
                          <div className="flex items-center gap-1">
                            <MapPin className="size-3 text-zinc-500" />
                            {lead.companyName}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-400">{lead.phone || "-"}</td>
                        <td className="px-3 py-3 text-zinc-400">
                          {lead.rating !== null
                            ? `${lead.rating} (${lead.reviewsCount ?? 0} aval.)`
                            : "-"}
                        </td>
                        <td className="px-3 py-3 text-zinc-400">{lead.address || "-"}</td>
                        <td className="px-3 py-3 text-zinc-400">
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-300 hover:underline"
                            >
                              Abrir
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={lead.imported ? "success" : "default"}>
                            {lead.imported ? "Importado" : "Pendente"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
