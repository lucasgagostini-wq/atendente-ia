"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  QrCode,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { useIntegrationsStatus } from "@/hooks/use-integrations";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { Settings } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const modelOptions = [
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

export default function ConfiguracoesPage() {
  const settingsQuery = useSettings();
  const integrationsStatus = useIntegrationsStatus();
  const refetchIntegrations = integrationsStatus.refetch;
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState<Partial<Settings>>({});
  const [evolutionStatus, setEvolutionStatus] = useState<EvolutionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
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
      setEvolutionStatus(payload);
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

  async function saveConfig() {
    const payload: Partial<Settings> = { ...form };
    if (!payload.webhookUrl && typeof window !== "undefined") {
      payload.webhookUrl = `${window.location.origin}/api/webhooks/evolution`;
      setForm((previous) => ({ ...previous, webhookUrl: payload.webhookUrl }));
    }

    await updateSettings.mutateAsync(payload);
    toast.success("Configurações salvas.");
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
  }

  async function connectEvolution() {
    const response = await fetch("/api/evolution/connect", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error || "Falha ao conectar Evolution");
      return;
    }

    const possibleQr =
      payload?.connected?.base64 ||
      payload?.connected?.qrcode ||
      payload?.connected?.qr ||
      payload?.connected?.data?.base64;

    if (possibleQr && typeof possibleQr === "string") {
      setQrCode(
        possibleQr.startsWith("data:image")
          ? possibleQr
          : `data:image/png;base64,${possibleQr}`,
      );
    }

    toast.success("Conexão iniciada. Escaneie o QR Code se disponível.");
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
  }

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
    await Promise.all([refreshEvolutionStatus(), refetchIntegrations()]);
  }

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
      <div>
        <h1>Configurações</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Evolution API, OpenRouter, Apify, delays e modo seguro.
        </p>
      </div>

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
                <AlertTriangle className="size-4" />
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
                <CheckCircle2 className="size-4" />
                Tudo pronto para receber e responder mensagens automáticas.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Status WhatsApp (Evolution API)</CardTitle>
          <Button size="sm" variant="outline" onClick={refreshEvolutionStatus}>
            <RefreshCcw className="mr-1 size-4" />
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
            <Button variant="secondary" onClick={saveAndConnectEvolution}>
              <QrCode className="mr-1 size-4" />
              Salvar + Conectar / QR Code
            </Button>
            <Button variant="outline" onClick={connectEvolution}>
              <Wifi className="mr-1 size-4" />
              Conectar com dados salvos
            </Button>
            <Button variant="outline" onClick={reconnectEvolution}>
              <RefreshCcw className="mr-1 size-4" />
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
              <Sparkles className="mr-1 size-4" />
              {testingAi ? "Testando IA..." : "Testar IA"}
            </Button>
            <Button
              variant="secondary"
              onClick={saveConfig}
              disabled={updateSettings.isPending}
            >
              <Save className="mr-1 size-4" />
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
            <Send className="mr-1 size-4" />
            Testar envio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
