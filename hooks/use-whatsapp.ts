"use client";

/**
 * use-whatsapp.ts
 *
 * Hook reutilizável para gerenciar o estado do WhatsApp (Evolution API / Baileys).
 * Centraliza a lógica de conexão, QR code e status para evitar duplicação.
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

type EvolutionStatus = {
  connected: boolean;
  configured: boolean;
  number?: string | null;
  raw?: unknown;
};

type QrState = {
  image: string | null;
  autoRefresh: boolean;
};

function extractBase64Qr(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const raw =
    (p as any)?.connected?.base64 ||
    (p as any)?.connected?.qrcode ||
    (p as any)?.connected?.qr ||
    (p as any)?.connected?.data?.base64 ||
    null;
  if (!raw || typeof raw !== "string") return null;
  return raw.startsWith("data:image") ? raw : `data:image/png;base64,${raw}`;
}

async function getLocalBridgeStatus(): Promise<EvolutionStatus | null> {
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);

  try {
    const response = await fetch("http://127.0.0.1:8080/health", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload?.connected) return null;

    return {
      connected: true,
      configured: true,
      number: payload.ownerJid?.replace(/\D/g, "") || null,
      raw: {
        statusSource: "local_baileys_bridge",
        localBridge: payload,
      },
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getMergedWhatsAppStatus() {
  const serverStatus = await api.get<EvolutionStatus>("/api/evolution/status");
  if (serverStatus.connected) return serverStatus;

  const localStatus = await getLocalBridgeStatus();
  return localStatus || serverStatus;
}

/** Busca o status da conexão WhatsApp a cada 8 segundos */
export function useWhatsAppStatus() {
  return useQuery<EvolutionStatus>({
    queryKey: ["evolution-status"],
    queryFn: getMergedWhatsAppStatus,
    refetchInterval: 8_000,
    staleTime: 5_000,
    retry: 2,
  });
}

/** Hook completo para gerenciar conexão (status + QR code + ações) */
export function useWhatsAppConnection() {
  const statusQuery = useWhatsAppStatus();
  const [qr, setQr] = useState<QrState>({ image: null, autoRefresh: false });
  const [isConnecting, setIsConnecting] = useState(false);

  // Auto-refresh do QR a cada 12 segundos enquanto não conectado
  useEffect(() => {
    if (!qr.autoRefresh || statusQuery.data?.connected) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.post<unknown>("/api/evolution/connect");
        const image = extractBase64Qr(data);
        if (image) setQr((prev) => ({ ...prev, image }));
      } catch { /* silencioso no auto-refresh */ }
    }, 12_000);

    return () => clearInterval(interval);
  }, [qr.autoRefresh, statusQuery.data?.connected]);

  // Para o auto-refresh quando conectar
  useEffect(() => {
    if (statusQuery.data?.connected) {
      setQr({ image: null, autoRefresh: false });
    }
  }, [statusQuery.data?.connected]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const data = await api.post<unknown>("/api/evolution/connect");
      const image = extractBase64Qr(data);
      if (image) {
        setQr({ image, autoRefresh: true });
        toast.info("QR Code disponível. Escaneie com seu WhatsApp.");
      } else {
        toast.success("Conexão iniciada.");
      }
      await statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar");
    } finally {
      setIsConnecting(false);
    }
  }, [statusQuery]);

  const reconnect = useCallback(async () => {
    try {
      await api.post("/api/evolution/reconnect");
      toast.success("Reconexão solicitada.");
      setQr({ image: null, autoRefresh: true });
      await statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reconectar");
    }
  }, [statusQuery]);

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    qrImage: qr.image,
    qrAutoRefresh: qr.autoRefresh,
    isConnecting,
    connect,
    reconnect,
    refetch: statusQuery.refetch,
  };
}
