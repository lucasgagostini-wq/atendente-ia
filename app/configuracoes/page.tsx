"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { QrCode, RefreshCcw, Save, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
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
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [evolutionStatus, setEvolutionStatus] = useState<EvolutionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Mensagem de teste do Atendente IA");

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  async function refreshEvolutionStatus() {
    try {
      const response = await fetch("/api/evolution/status");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao buscar status");
      setEvolutionStatus(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao buscar status.");
    }
  }

  useEffect(() => {
    refreshEvolutionStatus();
  }, []);

  const updateField = (key: keyof Settings, value: string | number | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  async function saveConfig() {
    await updateSettings.mutateAsync(form);
    toast.success("Configurações salvas.");
    await refreshEvolutionStatus();
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
    await refreshEvolutionStatus();
  }

  async function reconnectEvolution() {
    const response = await fetch("/api/evolution/reconnect", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error || "Falha ao reconectar.");
      return;
    }
    toast.success("Reconexão solicitada.");
    await refreshEvolutionStatus();
  }

  async function testSend() {
    const response = await fetch("/api/evolution/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, text: testMessage }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error || "Falha no envio de teste.");
      return;
    }
    toast.success("Envio de teste concluído.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Configurações</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Evolution API, OpenRouter, delays e modo seguro.
        </p>
      </div>

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
            <Button variant="secondary" onClick={connectEvolution}>
              <QrCode className="mr-1 size-4" />
              Conectar / QR Code
            </Button>
            <Button variant="outline" onClick={reconnectEvolution}>
              <Wifi className="mr-1 size-4" />
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
            placeholder="Webhook URL"
            value={form.webhookUrl || ""}
            onChange={(event) => updateField("webhookUrl", event.target.value)}
          />
          <Input
            placeholder="OpenRouter API Key"
            value={form.openRouterApiKey || ""}
            onChange={(event) => updateField("openRouterApiKey", event.target.value)}
          />
          <Select
            options={modelOptions}
            value={form.openRouterModel || modelOptions[0].value}
            onChange={(event) => updateField("openRouterModel", event.target.value)}
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
          <div className="md:col-span-2 flex justify-end">
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
