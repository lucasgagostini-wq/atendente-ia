"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "@/types";

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

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => request<Settings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<Settings>) =>
      request<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

