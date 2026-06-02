import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evolutionService } from "@/services/evolution.service";

export const dynamic = "force-dynamic";

const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL || "google/gemma-4-31b-it:free";

function normalize(value?: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function isLocalWebhook(url: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

export async function GET(request: Request) {
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const evolutionApiUrl = normalize(settings.evolutionApiUrl) || normalize(process.env.EVOLUTION_API_URL);
  const evolutionApiKey = normalize(settings.evolutionApiKey) || normalize(process.env.EVOLUTION_API_KEY);
  const evolutionInstanceName =
    normalize(settings.evolutionInstanceName) || normalize(process.env.EVOLUTION_INSTANCE_NAME);
  const openRouterApiKey =
    normalize(settings.openRouterApiKey) || normalize(process.env.OPENROUTER_API_KEY);
  const apifyApiToken =
    normalize(settings.apifyApiToken) || normalize(process.env.APIFY_API_TOKEN);

  const settingsWebhookUrl = normalize(settings.webhookUrl);
  const envWebhookBase = normalize(process.env.NEXT_PUBLIC_APP_URL);
  const envWebhookUrl = envWebhookBase
    ? `${envWebhookBase.replace(/\/$/, "")}/api/webhooks/evolution`
    : null;
  const requestWebhookUrl = `${new URL(request.url).origin.replace(/\/$/, "")}/api/webhooks/evolution`;

  const webhookUrl =
    (settingsWebhookUrl && !isLocalWebhook(settingsWebhookUrl)
      ? settingsWebhookUrl
      : null) ||
    (envWebhookUrl && !isLocalWebhook(envWebhookUrl) ? envWebhookUrl : null) ||
    requestWebhookUrl;

  const evolutionStatus = await evolutionService.getStatus();
  const evolutionConfigured = Boolean(
    evolutionApiUrl && evolutionApiKey && evolutionInstanceName,
  );

  const checks = {
    evolutionConfigured,
    evolutionConnected: Boolean(evolutionStatus.connected),
    webhookConfigured: Boolean(webhookUrl),
    openRouterConfigured: Boolean(openRouterApiKey),
    apifyConfigured: Boolean(apifyApiToken),
  };

  const missing: string[] = [];
  if (!checks.evolutionConfigured) {
    missing.push("Evolution API URL/API Key/Instance Name");
  }
  if (checks.evolutionConfigured && !checks.evolutionConnected) {
    missing.push("Conexão da instância WhatsApp (QR Code)");
  }
  if (!checks.webhookConfigured) {
    missing.push("Webhook URL");
  }
  if (!checks.openRouterConfigured) {
    missing.push("OpenRouter API Key");
  }

  return NextResponse.json({
    checks,
    missing,
    evolution: {
      configured: evolutionConfigured,
      connected: evolutionStatus.connected,
      number: evolutionStatus.number ?? null,
      raw: evolutionStatus.raw ?? null,
    },
    ai: {
      configured: Boolean(openRouterApiKey),
      model: settings.openRouterModel || DEFAULT_OPENROUTER_MODEL,
    },
    prospector: {
      configured: Boolean(apifyApiToken),
    },
    webhookUrl,
  });
}
