"use client";

import { apiRequest as request } from "@/lib/api-client";
import { getClientProfileSlug } from "@/lib/profile-utils";
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
  profile?: {
    id: string;
    slug: string;
    name: string;
    status: string;
    aiEnabled: boolean;
    whatsappNumber: string | null;
    whatsappSessionName: string | null;
    usesSharedTransport: boolean;
  };
  webhookUrl: string | null;
};

async function getLocalBridgeHealth() {
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);

  try {
    const response = await fetch("http://127.0.0.1:8080/health", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const health = await response.json();
    if (!health?.connected) return null;

    return health as {
      connected: boolean;
      state?: string;
      ownerJid?: string | null;
      hasWebhook?: boolean;
      instanceName?: string;
      lastError?: unknown;
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getMergedIntegrationStatus() {
  const status = await request<IntegrationStatus>("/api/integrations/status");
  const localBridge = await getLocalBridgeHealth();

  if (!localBridge?.connected || !status.profile?.usesSharedTransport) return status;

  const number = localBridge.ownerJid?.replace(/\D/g, "") || status.evolution.number;

  return {
    ...status,
    checks: {
      ...status.checks,
      evolutionConfigured: true,
      evolutionConnected: true,
    },
    missing: status.missing.filter(
      (item) => !/WhatsApp|Conexão da instância|QR Code/i.test(item),
    ),
    evolution: {
      ...status.evolution,
      configured: true,
      connected: true,
      number,
      raw: {
        server: status.evolution.raw,
        localBridge,
        statusSource: "local_baileys_bridge",
      },
    },
  };
}

export function useIntegrationsStatus() {
  const activeSlug = getClientProfileSlug();

  return useQuery({
    queryKey: ["integrations-status", activeSlug],
    queryFn: getMergedIntegrationStatus,
    refetchInterval: 8000,
  });
}
