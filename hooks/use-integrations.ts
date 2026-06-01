"use client";

import { useQuery } from "@tanstack/react-query";

type IntegrationStatus = {
  checks: {
    evolutionConfigured: boolean;
    evolutionConnected: boolean;
    webhookConfigured: boolean;
    openRouterConfigured: boolean;
    apifyConfigured: boolean;
  };
  missing: string[];
  evolution: {
    configured: boolean;
    connected: boolean;
    number: string | null;
    raw: unknown;
  };
  ai: {
    configured: boolean;
    model: string;
  };
  prospector: {
    configured: boolean;
  };
  webhookUrl: string | null;
};

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

export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => request<IntegrationStatus>("/api/integrations/status"),
    refetchInterval: 8000,
  });
}

