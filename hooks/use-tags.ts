"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag } from "@/types";

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

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => request<Tag[]>("/api/tags"),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; color?: string }) =>
      request<Tag>("/api/tags", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
    },
  });
}

