"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lead } from "@/types";

type LeadsFilters = {
  search?: string;
  stage?: string;
  status?: string;
  tagId?: string;
  onlyDialable?: boolean;
};

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

function buildLeadsQuery(filters: LeadsFilters = {}) {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.stage && filters.stage !== "ALL") params.set("stage", filters.stage);
  if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
  if (filters.tagId && filters.tagId !== "ALL") params.set("tagId", filters.tagId);
  if (filters.onlyDialable) params.set("onlyDialable", "true");

  const queryString = params.toString();
  return queryString ? `/api/leads?${queryString}` : "/api/leads";
}

export function useLeads(filters: LeadsFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: () => request<Lead[]>(buildLeadsQuery(filters)),
    enabled: options?.enabled ?? true,
  });
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => request<Lead>(`/api/leads/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      request<Lead>(`/api/leads/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["lead", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
      ]);
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean }>(`/api/leads/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
      ]);
    },
  });
}

export function useBulkLeadAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request<{ affected: number }>("/api/leads/bulk", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
      ]);
    },
  });
}
