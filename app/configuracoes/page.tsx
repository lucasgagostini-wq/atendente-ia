"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Warning,
  CheckCircle,
  QrCode,
  ArrowsClockwise,
  FloppyDisk,
  PaperPlaneTilt,
  Sparkle,
  WifiHigh,
  Gear,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useIntegrationsStatus } from "@/hooks/use-integrations";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { Settings } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";

const modelOptions = [
  { label: "openai/gpt-oss-20b:free", value: "openai/gpt-oss-20b:free" },
  { label: "google/gemma-4-31b-it:free", value: "google/gemma-4-31b-it:free" },
  { label: "qwen/qwen3-next-80b-a3b-instruct:free", value: "qwen/qwen3-next-80b-a3b-instruct:free" },
  { label: "deepseek/deepseek-chat", value: "deepseek/deepseek-chat" },
  { label: "qwen/qwen-2.5-72b-instruct", value: "qwen/qwen-2.5-72b-instruct" },
  { label: "google/gemini-flash-1.5", value: "google/gemini-flash-1.5" },
  { label: "meta-llama/llama-3.1-70b-instruct", value: "meta-llama/llama-3.1-70b-instruct" },
  { label: "openai/gpt-4o-mini", value: "openai/gpt-4o-mini" },
];

type EvolutionStatus = {
  connected: boolean;
  configured: boolean;
  number?: string | null;
  raw?: any;
};

function extractQr(payload: any) {
  return (
    payload?.connected?.base64 ||
    payload?.connected?.qrcode ||
    payload?.connected?.qr ||
    payload?.connected?.data?.base64 ||
    null
  );
}

async function getLocalBridgeStatus(): Promise<EvolutionStatus | null> {
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

export default function ConfiguracoesPage() {
  const settingsQuery = useSettings();
  const integrationsStatus = useIntegrationsStatus();
  const refetchIntegrations = integrationsStatus.refetch;
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState<Partial<Settings>>({});
  const [evolutionStatus, setEvolutionStatus] = useState<EvolutionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrAutoRefresh, setQrAutoRefresh] = useState(false);
  const [connectingEvolution, setConnectingEvolution] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Mensagem de teste do Atendente IA");
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const refreshEvolutionStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/evolution/status");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao buscar status");
      const localStatus = payload?.connected ? null : await getLocalBridgeStatus();
      const mergedStatus = localStatus || payload;
      setEvolutionStatus(mergedStatus);
      if (mergedStatus?.connected) {
        setQrAutoRefresh(false);
        setQrCode(null);
      }
      await refetchIntegrations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao buscar status.");
    }
  }, [refetchIntegrations]);

  useEffect(() => {
    refreshEvolutionStatus();
  }, [refreshEvolutionStatus]);

  const updateField = (key: keyof Settings, value: string | number | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const isLocalWebhook = (url: string) =>
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);

  async function saveConfig() {
    const payload: Partial<Settings> = { ...form };
    const normalizedWebhook = payload.webhookUrl?.trim();

    if (
      typeof window !== "undefined" &&
      (!normalizedWebhook || isLocalWebhook(normalizedWebhook))
    ) {
      payload.webhookUrl = `${window.location.origin.replace(/\/$/, "")}/api/webhooks/evolution`;
      setForm((previous) => ({ ...previous, webhookUrl: payload.webhookUrl }));
    }

    await updateSettings.mutateAsync(payload);
    toast.success("Configurações salvas.");
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
  }

  const connectEvolution = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setConnectingEvolution(true);
    const response = await fetch("/api/evolution/connect", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      if (!options?.silent) {
        toast.error(payload.error || "Falha ao conectar Evolution");
      }
      if (!options?.silent) setConnectingEvolution(false);
      return;
    }

    const possibleQr = extractQr(payload);

    if (possibleQr && typeof possibleQr === "string") {
      setQrCode(
        possibleQr.startsWith("data:image")
          ? possibleQr
          : `data:image/png;base64,${possibleQr}`,
      );
      setQrAutoRefresh(true);
    }

    if (!options?.silent) {
      toast.success("Conexão iniciada. Escaneie o QR Code se disponível.");
    }
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
    if (!options?.silent) setConnectingEvolution(false);
  }, [refetchIntegrations, refreshEvolutionStatus]);

  async function saveAndConnectEvolution() {
    try {
      await saveConfig();
      await connectEvolution();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar e conectar.");
    }
  }

  async function reconnectEvolution() {
    const response = await fetch("/api/evolution/reconnect", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error || "Falha ao reconectar.");
      return;
    }
    toast.success("Reconexão solicitada.");
    setQrAutoRefresh(true);
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
  }

  useEffect(() => {
    if (!qrAutoRefresh || evolutionStatus?.connected) return;

    const interval = setInterval(() => {
      connectEvolution({ silent: true });
    }, 12000);

    return () => clearInterval(interval);
  }, [connectEvolution, qrAutoRefresh, evolutionStatus?.connected]);

  async function testSend() {
    const response = await fetch("/api/evolution/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, text: testMessage }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.detail || payload.error || "Falha no envio de teste.");
      return;
    }
    toast.success("Envio de teste concluído.");
  }

  async function testAi() {
    try {
      setTestingAi(true);
      const response = await fetch("/api/integrations/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Escreva uma mensagem curta para iniciar conversa com uma hamburgueria.",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.detail || payload.error || "Falha no teste de IA.");
        return;
      }
      toast.success(`IA OK (${payload.model}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no teste de IA.");
    } finally {
      setTestingAi(false);
    }
  }

  const checks = integrationsStatus.data?.checks;
  const aiHealth = integrationsStatus.data?.ai;
  const missing = integrationsStatus.data?.missing ?? [];
  const healthy = useMemo(() => {
    if (!checks) return false;
    return (
      checks.evolutionConfigured &&
      checks.evolutionConnected &&
      checks.webhookConfigured &&
      checks.openRouterConfigured
    );
  }, [checks]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Configurações"
        description="Evolution API, OpenRouter, Apify, delays e modo seguro."
        icon={<Gear size={18} weight="duotone" className="text-indigo-400" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Prontidão de integrações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={healthy ? "success" : "warning"}>
              {healthy ? "Operação pronta" : "Configuração pendente"}
            </Badge>
            <Badge variant={checks?.evolutionConfigured ? "success" : "warning"}>
              Evolution: {checks?.evolutionConfigured ? "credenciais OK" : "faltando"}
            </Badge>
            <Badge variant={checks?.evolutionConnected ? "success" : "warning"}>
              WhatsApp: {checks?.evolutionConnected ? "conectado" : "desconectado"}
            </Badge>
            <Badge variant={checks?.openRouterConfigured ? "success" : "warning"}>
              OpenRouter: {checks?.openRouterConfigured ? "ativo" : "faltando chave"}
            </Badge>
            <Badge variant={checks?.webhookConfigured ? "success" : "warning"}>
              Webhook: {checks?.webhookConfigured ? "configurado" : "faltando URL"}
            </Badge>
          </div>

          {!healthy && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              <div className="mb-1 flex items-center gap-2">
                <Warning size={16} weight="duotone" />
                Itens pendentes
              </div>
              {missing.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </div>
          )}

          {healthy && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} weight="duotone" />
                Tudo pronto para receber e responder mensagens automáticas.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saúde da IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={aiHealth?.configured ? "success" : "warning"}>
              OpenRouter: {aiHealth?.configured ? "configurado" : "sem chave"}
            </Badge>
            <Badge variant={aiHealth?.alerts?.freeModel ? "warning" : "success"}>
              Modelo: {aiHealth?.primaryModel || "não definido"}
            </Badge>
            <Badge variant={aiHealth?.alerts?.rateLimit ? "warning" : "default"}>
              Rate limit 24h: {aiHealth?.rateLimit24h ?? 0}
            </Badge>
            <Badge variant={(aiHealth?.blocked24h ?? 0) > 0 ? "warning" : "success"}>
              Bloqueios 24h: {aiHealth?.blocked24h ?? 0}
            </Badge>
            <Badge variant={(aiHealth?.fallback24h ?? 0) > 0 ? "warning" : "success"}>
              Fallbacks 24h: {aiHealth?.fallback24h ?? 0}
            </Badge>
          </div>
          <div className="grid gap-2 text-sm text-zinc-400 md:grid-cols-2">
            <p>Fallback: {aiHealth?.fallbackModel || "não definido"}</p>
            <p>Retry/timeout: {aiHealth?.maxRetries ?? 1} retry, {aiHealth?.timeoutMs ?? 20000}ms</p>
            <p>
              Último sucesso:{" "}
              {aiHealth?.lastSuccess?.createdAt
                ? new Date(aiHealth.lastSuccess.createdAt).toLocaleString("pt-BR")
                : "sem registro"}
            </p>
            <p>
              Último erro:{" "}
              {aiHealth?.lastError?.createdAt
                ? new Date(aiHealth.lastError.createdAt).toLocaleString("pt-BR")
                : "sem registro"}
            </p>
          </div>
          {aiHealth?.alerts?.freeModel && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              Modelo gratuito em uso. Funciona para teste, mas pode sofrer limite ou instabilidade em operação real.
            </div>
          )}
          {aiHealth?.alerts?.rateLimit && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              Rate limit detectado nas últimas 24h. A camada de segurança mantém respostas humanas, mas vale trocar o modelo se isso repetir.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Status WhatsApp (Evolution API)</CardTitle>
          <Button size="sm" variant="outline" onClick={refreshEvolutionStatus}>
            <ArrowsClockwise size={14} weight="bold" />
            Atualizar status
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={evolutionStatus?.connected ? "success" : "warning"}>
              {evolutionStatus?.connected ? "Conectado" : "Desconectado"}
            </Badge>
            <Badge variant="default">
              Número: {evolutionStatus?.number || "não identificado"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={saveAndConnectEvolution}
              disabled={connectingEvolution}
            >
              <QrCode size={14} weight="duotone" />
              Salvar + Conectar / QR Code
            </Button>
            <Button
              variant="outline"
              onClick={() => connectEvolution()}
              disabled={connectingEvolution}
            >
              <WifiHigh size={14} weight="duotone" />
              {connectingEvolution ? "Conectando..." : "Conectar com dados salvos"}
            </Button>
            <Button variant="outline" onClick={reconnectEvolution}>
              <ArrowsClockwise size={14} weight="bold" />
              Reconectar sessão
            </Button>
          </div>
          {qrCode && (
            <div className="w-fit rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <Image
                src={qrCode}
                alt="QR Code Evolution API"
                width={224}
                height={224}
                className="size-56"
                unoptimized
              />
              <p className="mt-2 text-xs text-zinc-400">
                QR atualizado automaticamente a cada 12s.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais e comportamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Evolution API URL"
            value={form.evolutionApiUrl || ""}
            onChange={(event) => updateField("evolutionApiUrl", event.target.value)}
          />
          <Input
            placeholder="Evolution API Key"
            value={form.evolutionApiKey || ""}
            onChange={(event) => updateField("evolutionApiKey", event.target.value)}
          />
          <Input
            placeholder="Instance Name"
            value={form.evolutionInstanceName || ""}
            onChange={(event) =>
              updateField("evolutionInstanceName", event.target.value)
            }
          />
          <Input
            placeholder="Webhook URL (deixe vazio para auto preencher)"
            value={form.webhookUrl || ""}
            onChange={(event) => updateField("webhookUrl", event.target.value)}
          />
          <Input
            placeholder="OpenRouter API Key"
            value={form.openRouterApiKey || ""}
            onChange={(event) => updateField("openRouterApiKey", event.target.value)}
          />
          <Input
            placeholder="Apify API Token"
            value={form.apifyApiToken || ""}
            onChange={(event) => updateField("apifyApiToken", event.target.value)}
          />
          <Select
            options={modelOptions}
            value={form.openRouterModel || modelOptions[0].value}
            onChange={(event) => updateField("openRouterModel", event.target.value)}
          />
          <Input
            placeholder="Actor Google Maps (Apify)"
            value={form.prospectorMapsActorId || "compass/crawler-google-places"}
            onChange={(event) =>
              updateField("prospectorMapsActorId", event.target.value)
            }
          />
          <Input
            type="number"
            step="0.1"
            min={0}
            max={2}
            placeholder="Temperatura"
            value={form.temperature ?? 0.6}
            onChange={(event) => updateField("temperature", Number(event.target.value))}
          />
          <Input
            type="number"
            min={0}
            placeholder="Delay mínimo (segundos)"
            value={form.minDelaySeconds ?? 2}
            onChange={(event) =>
              updateField("minDelaySeconds", Number(event.target.value))
            }
          />
          <Input
            type="number"
            min={0}
            placeholder="Delay máximo (segundos)"
            value={form.maxDelaySeconds ?? 8}
            onChange={(event) =>
              updateField("maxDelaySeconds", Number(event.target.value))
            }
          />
          <Input
            placeholder="Checkout padrão"
            value={form.defaultCheckoutUrl || ""}
            onChange={(event) =>
              updateField("defaultCheckoutUrl", event.target.value)
            }
          />
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(form.safeMode)}
              onChange={(event) => updateField("safeMode", event.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900"
            />
            Modo seguro ativado
          </label>
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={testAi} disabled={testingAi}>
              <Sparkle size={14} weight="duotone" />
              {testingAi ? "Testando IA..." : "Testar IA"}
            </Button>
            <Button
              variant="secondary"
              onClick={saveConfig}
              disabled={updateSettings.isPending}
            >
              <FloppyDisk size={14} weight="duotone" />
              Salvar configurações
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teste de envio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-[1fr,2fr,auto]">
          <Input
            placeholder="Telefone ex: 5511999999999"
            value={testPhone}
            onChange={(event) => setTestPhone(event.target.value)}
          />
          <Input
            placeholder="Mensagem de teste"
            value={testMessage}
            onChange={(event) => setTestMessage(event.target.value)}
          />
          <Button variant="outline" onClick={testSend}>
            <PaperPlaneTilt size={14} weight="duotone" />
            Testar envio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
