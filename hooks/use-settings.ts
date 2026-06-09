"use client";

import { apiRequest as request } from "@/lib/api-client";
import { getClientProfileSlug } from "@/lib/profile-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "@/types";



export function useSettings() {
  const activeSlug = getClientProfileSlug();

  return useQuery({
    queryKey: ["settings", activeSlug],
    queryFn: () => request<Settings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const activeSlug = getClientProfileSlug();

  return useMutation({
    mutationFn: (body: Partial<Settings>) =>
      request<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings", activeSlug] }),
        queryClient.invalidateQueries({ queryKey: ["integrations-status"] }),
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
      ]);
    },
  });
}
