"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProspectingJob } from "@/types";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Erro de requisição");
  }

  return payload;
}

export function useProspectingJobs() {
  return useQuery({
    queryKey: ["prospecting-jobs"],
    queryFn: () => request<ProspectingJob[]>("/api/prospector/jobs"),
  });
}

export function useProspectingJob(id?: string) {
  return useQuery({
    queryKey: ["prospecting-job", id],
    queryFn: () => request<ProspectingJob>(`/api/prospector/jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProspectingJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { query: string; maxResults: number }) =>
      request<ProspectingJob>("/api/prospector/jobs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (job) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prospecting-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["prospecting-job", job.id] }),
      ]);
    },
  });
}

export function useImportProspectingLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { jobId: string; leadIds: string[] }) =>
      request<{ importedCount: number }>(`/api/prospector/jobs/${args.jobId}/import`, {
        method: "POST",
        body: JSON.stringify({ leadIds: args.leadIds }),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prospecting-jobs"] }),
        queryClient.invalidateQueries({
          queryKey: ["prospecting-job", variables.jobId],
        }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
    },
  });
}

