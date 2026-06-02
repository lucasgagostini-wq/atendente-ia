"use client";

import { apiRequest as request } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Conversation } from "@/types";



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
    // 8s é suficiente para perceber mensagens novas sem sobrecarregar o banco
    refetchInterval: 8_000,
    // Não refaz ao focar a aba se a última busca foi há menos de 5s
    refetchOnWindowFocus: false,
    staleTime: 5_000,
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
