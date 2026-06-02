"use client";

import { apiRequest as request } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag } from "@/types";



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

