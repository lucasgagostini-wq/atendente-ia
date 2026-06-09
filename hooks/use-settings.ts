"use client";

import { apiRequest as request } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";
import { Settings } from "@/types";



export function useSettings() {
  const activeSlug = useActiveProfileSlug();

  return useQuery({
    queryKey: ["settings", activeSlug],
    queryFn: () => request<Settings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

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
