import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { prisma } from "@/lib/prisma";
import { evolutionService } from "@/services/evolution.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-oss-20b:free";
const DEFAULT_FALLBACK_MODEL =
  process.env.FALLBACK_AI_MODEL ||
  process.env.OPENROUTER_FALLBACK_MODEL ||
  "openai/gpt-oss-20b:free";

function normalize(value?: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function isLocalWebhook(url: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

export async function GET(request: Request) {
  const activeProfile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(request),
  );
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
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    lastSuccess,
    lastError,
    errors24h,
    fallback24h,
    blocked24h,
    rateLimit24h,
  ] = await Promise.all([
    prisma.log.findFirst({
      where: { type: "AI_RESPONSE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, message: true, payload: true },
    }),
    prisma.log.findFirst({
      where: { type: "AI_ERROR" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, message: true, payload: true },
    }),
    prisma.log.count({
      where: { type: "AI_ERROR", createdAt: { gte: since24h } },
    }),
    prisma.log.count({
      where: { type: "AI_FALLBACK_USED", createdAt: { gte: since24h } },
    }),
    prisma.log.count({
      where: { type: "AI_RESPONSE_BLOCKED", createdAt: { gte: since24h } },
    }),
    prisma.log.count({
      where: {
        type: "AI_ERROR",
        createdAt: { gte: since24h },
        payload: { path: ["status"], equals: 429 },
      },
    }),
  ]);
  const primaryModel = settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
  const fallbackModel = DEFAULT_FALLBACK_MODEL;
  const usingFreeModel = /:free\b/i.test(primaryModel) || /:free\b/i.test(fallbackModel);

  const profileAwaitingWhatsapp = activeProfile.status === "AWAITING_WHATSAPP";
  const profileDisconnected = activeProfile.status === "DISCONNECTED";
  const profileEvolutionConfigured = profileAwaitingWhatsapp
    ? false
    : evolutionConfigured;
  const profileEvolutionConnected =
    profileEvolutionConfigured &&
    !profileDisconnected &&
    Boolean(evolutionStatus.connected);

  const checks = {
    evolutionConfigured: profileEvolutionConfigured,
    evolutionConnected: profileEvolutionConnected,
    webhookConfigured: Boolean(webhookUrl),
    openRouterConfigured: Boolean(openRouterApiKey),
    apifyConfigured: Boolean(apifyApiToken),
  };

  const missing: string[] = [];
  if (profileAwaitingWhatsapp) {
    missing.push("WhatsApp deste perfil ainda não conectado");
  } else if (!checks.evolutionConfigured) {
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
      configured: profileEvolutionConfigured,
      connected: profileEvolutionConnected,
      number: activeProfile.whatsappNumber || evolutionStatus.number || null,
      raw: evolutionStatus.raw ?? null,
    },
    profile: {
      id: activeProfile.id,
      slug: activeProfile.slug,
      name: activeProfile.name,
      status: activeProfile.status,
      aiEnabled: activeProfile.aiEnabled,
      whatsappNumber: activeProfile.whatsappNumber,
      whatsappSessionName: activeProfile.whatsappSessionName,
      usesSharedTransport: activeProfile.slug === "restauracao-fotos",
    },
    ai: {
      configured: Boolean(openRouterApiKey),
      model: primaryModel,
      primaryModel,
      fallbackModel,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20_000),
      maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
      usingFreeModel,
      lastSuccess,
      lastError,
      errors24h,
      fallback24h,
      blocked24h,
      rateLimit24h,
      alerts: {
        freeModel: usingFreeModel,
        rateLimit: rateLimit24h > 0,
        recentErrors: errors24h > 0,
      },
    },
    prospector: {
      configured: Boolean(apifyApiToken),
    },
    webhookUrl,
  });
}
