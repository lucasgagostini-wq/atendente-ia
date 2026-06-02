"use client";

import { apiRequest as request } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "@/types";



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

