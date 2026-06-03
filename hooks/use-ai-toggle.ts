"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Erro na requisição");
  return data;
}

/** Estado atual da pausa global da IA */
export function useAiPausedState() {
  return useQuery({
    queryKey: ["ai-paused"],
    queryFn: () => request<{ aiPaused: boolean }>("/api/settings/ai-toggle"),
    refetchInterval: 10_000,
  });
}

/** Alterna pausa/ativa da IA globalmente */
export function useToggleAiPause() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      request<{ aiPaused: boolean }>("/api/settings/ai-toggle", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["ai-paused"], data);
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
    },
  });
}
