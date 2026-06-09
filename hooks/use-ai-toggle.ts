"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";

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
  const activeSlug = useActiveProfileSlug();

  return useQuery({
    queryKey: ["ai-paused", activeSlug],
    queryFn: () =>
      request<{ aiPaused: boolean }>(
        `/api/settings/ai-toggle?profile=${encodeURIComponent(activeSlug)}`,
      ),
    refetchInterval: 10_000,
  });
}

/** Alterna pausa/ativa da IA globalmente */
export function useToggleAiPause() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

  return useMutation({
    mutationFn: () =>
      request<{ aiPaused: boolean }>(
        `/api/settings/ai-toggle?profile=${encodeURIComponent(activeSlug)}`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["ai-paused", activeSlug], data);
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}
