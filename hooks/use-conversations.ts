"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Conversation } from "@/types";

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

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => request<Conversation[]>("/api/conversations"),
  });
}

export function useConversation(id?: string) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => request<Conversation>(`/api/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: 3000,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { leadId: string }) =>
      request<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      request<Conversation>(`/api/conversations/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", variables.id],
        }),
      ]);
    },
  });
}
