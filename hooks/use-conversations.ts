"use client";

import { apiRequest as request } from "@/lib/api-client";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveProfileSlug } from "@/hooks/use-active-profile-slug";
import { Conversation } from "@/types";

const CONVERSATIONS_POLL_INTERVAL_MS = 5_000;
const ACTIVE_CONVERSATION_POLL_INTERVAL_MS = 3_000;

function getLatestMessageTimestamp(conversation: Conversation) {
  const latestMessage = conversation.messages?.reduce((latest, message) => {
    if (!latest) return message;
    return new Date(message.createdAt).getTime() > new Date(latest.createdAt).getTime()
      ? message
      : latest;
  }, conversation.messages?.[0]);

  return new Date(latestMessage?.createdAt ?? conversation.updatedAt).getTime();
}

function mergeConversationIntoList(
  current: Conversation[] | undefined,
  incoming: Conversation,
) {
  if (!current?.length) return current;

  const next = current.some((conversation) => conversation.id === incoming.id)
    ? current.map((conversation) => (
        conversation.id === incoming.id
          ? {
              ...conversation,
              ...incoming,
            }
          : conversation
      ))
    : [incoming, ...current];

  return [...next].sort(
    (left, right) => getLatestMessageTimestamp(right) - getLatestMessageTimestamp(left),
  );
}


export function useConversations() {
  const activeSlug = useActiveProfileSlug();

  return useQuery<Conversation[]>({
    queryKey: ["conversations", activeSlug],
    queryFn: () => request<Conversation[]>("/api/conversations"),
    refetchInterval: CONVERSATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });
}

export function useConversation(id?: string) {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

  const query = useQuery<Conversation>({
    queryKey: ["conversation", activeSlug, id],
    queryFn: () => request<Conversation>(`/api/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: ACTIVE_CONVERSATION_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  useEffect(() => {
    if (!query.data) return;

    queryClient.setQueryData<Conversation[] | undefined>(
      ["conversations", activeSlug],
      (current) => mergeConversationIntoList(current, query.data as Conversation),
    );
  }, [activeSlug, query.data, queryClient]);

  return query;
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

  return useMutation({
    mutationFn: (body: { leadId: string }) =>
      request<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversations", activeSlug] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  const activeSlug = useActiveProfileSlug();

  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      request<Conversation>(`/api/conversations/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations", activeSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["conversation", activeSlug, variables.id],
        }),
      ]);
    },
  });
}
