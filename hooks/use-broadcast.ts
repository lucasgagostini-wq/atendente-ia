"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BroadcastRunResult, BroadcastSuggestion, LogItem } from "@/types";

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

export function useBroadcastRuns() {
  return useQuery({
    queryKey: ["broadcast-runs"],
    queryFn: () => request<LogItem[]>("/api/disparos"),
  });
}

export function useGenerateBroadcastSuggestion() {
  return useMutation({
    mutationFn: (body: { tagName: string; objective?: string; baseMessage?: string }) =>
      request<BroadcastSuggestion>("/api/disparos/sugestao", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useRunBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      tagId: string;
      campaignName?: string;
      baseMessage: string;
      variations: string[];
      minIntervalSeconds: number;
      maxIntervalSeconds: number;
      maxLeads: number;
    }) =>
      request<BroadcastRunResult>("/api/disparos/enviar", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["broadcast-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
    },
  });
}

