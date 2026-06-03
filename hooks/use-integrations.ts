"use client";

import { apiRequest as request } from "@/lib/api-client";
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
    primaryModel: string;
    fallbackModel: string;
    timeoutMs: number;
    maxRetries: number;
    usingFreeModel: boolean;
    lastSuccess: { createdAt: string; message: string; payload: unknown } | null;
    lastError: { createdAt: string; message: string; payload: unknown } | null;
    errors24h: number;
    fallback24h: number;
    blocked24h: number;
    rateLimit24h: number;
    alerts: {
      freeModel: boolean;
      rateLimit: boolean;
      recentErrors: boolean;
    };
  };
  prospector: {
    configured: boolean;
  };
  webhookUrl: string | null;
};



export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => request<IntegrationStatus>("/api/integrations/status"),
    refetchInterval: 8000,
  });
}
