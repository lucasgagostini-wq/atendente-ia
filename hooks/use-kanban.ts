"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest as request } from "@/lib/api-client";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";
import { Lead, OperationStage } from "@/types";

function sortLeads(leads: Lead[]) {
  return [...leads].sort((left, right) => {
    const leftTimestamp = new Date(left.lastMessageAt ?? left.updatedAt).getTime();
    const rightTimestamp = new Date(right.lastMessageAt ?? right.updatedAt).getTime();
    return rightTimestamp - leftTimestamp;
  });
}

export function useKanbanLeads() {
  const activeSlug = useActiveProfileSlug();

  return useQuery({
    queryKey: ["kanban-leads", activeSlug],
    queryFn: () => request<Lead[]>("/api/leads?limit=2000"),
    select: (data) => sortLeads(data),
  });
}

export function useUpdateOperationStage() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

  return useMutation({
    mutationFn: (args: { leadId: string; operationStage: OperationStage }) =>
      request<Lead>(`/api/leads/${args.leadId}/operation-stage`, {
        method: "PATCH",
        body: JSON.stringify({ operationStage: args.operationStage }),
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["kanban-leads", activeSlug] });
      const previous = queryClient.getQueryData<Lead[]>(["kanban-leads", activeSlug]);

      queryClient.setQueryData<Lead[]>(
        ["kanban-leads", activeSlug],
        (current) =>
          current
            ? sortLeads(
                current.map((lead) =>
                  lead.id === variables.leadId
                    ? { ...lead, operationStage: variables.operationStage }
                    : lead,
                ),
              )
            : current,
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["kanban-leads", activeSlug], context.previous);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kanban-leads", activeSlug] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    },
  });
}
