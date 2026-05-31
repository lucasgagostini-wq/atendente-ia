"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lead } from "@/types";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Erro de requisição");
  }

  return response.json();
}

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: () => request<Lead[]>("/api/leads"),
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
      ]);
    },
  });
}

