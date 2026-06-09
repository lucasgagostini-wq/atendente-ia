import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { prisma } from "@/lib/prisma";
import { settingsSchema } from "@/lib/validations";
import { getSettings, invalidateSettingsCache } from "@/lib/settings-cache";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-oss-20b:free";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

function toActorId(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : "compass/crawler-google-places";
}

export async function GET(request: Request) {
  const settings = await getSettings();
  const activeProfile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(request),
  );

  return NextResponse.json({
    ...settings,
    profileId: activeProfile.id,
    profileSlug: activeProfile.slug,
    profileStatus: activeProfile.status,
    profileAiEnabled: activeProfile.aiEnabled,
    whatsappNumber: activeProfile.whatsappNumber,
    whatsappSessionName: activeProfile.whatsappSessionName,
    pixKey: activeProfile.pixKey,
    pixName: activeProfile.pixName,
    pixBank: activeProfile.pixBank,
  });
}

export async function PATCH(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = settingsSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        evolutionApiUrl: toNullable(data.evolutionApiUrl),
        evolutionApiKey: toNullable(data.evolutionApiKey),
        evolutionInstanceName: toNullable(data.evolutionInstanceName),
        webhookUrl: toNullable(data.webhookUrl),
        openRouterApiKey: toNullable(data.openRouterApiKey),
        openRouterModel: data.openRouterModel,
        apifyApiToken: toNullable(data.apifyApiToken),
        prospectorMapsActorId: toActorId(data.prospectorMapsActorId),
        temperature: data.temperature,
        minDelaySeconds: data.minDelaySeconds,
        maxDelaySeconds: data.maxDelaySeconds,
        safeMode: data.safeMode,
        defaultCheckoutUrl: toNullable(data.defaultCheckoutUrl),
      },
      create: {
        id: "default",
        evolutionApiUrl: toNullable(data.evolutionApiUrl) ?? undefined,
        evolutionApiKey: toNullable(data.evolutionApiKey) ?? undefined,
        evolutionInstanceName: toNullable(data.evolutionInstanceName) ?? undefined,
        webhookUrl: toNullable(data.webhookUrl) ?? undefined,
        openRouterApiKey: toNullable(data.openRouterApiKey) ?? undefined,
        openRouterModel: data.openRouterModel ?? DEFAULT_OPENROUTER_MODEL,
        apifyApiToken: toNullable(data.apifyApiToken) ?? undefined,
        prospectorMapsActorId: toActorId(data.prospectorMapsActorId),
        temperature: data.temperature ?? 0.6,
        minDelaySeconds: data.minDelaySeconds ?? 2,
        maxDelaySeconds: data.maxDelaySeconds ?? 8,
        safeMode: data.safeMode ?? true,
        defaultCheckoutUrl: toNullable(data.defaultCheckoutUrl) ?? undefined,
      },
    });

    // Invalidar cache para que a próxima requisição busque os dados atualizados
    invalidateSettingsCache();

    const profileUpdates: Record<string, unknown> = {};
    if (typeof body?.whatsappNumber === "string") {
      profileUpdates.whatsappNumber = toNullable(body.whatsappNumber);
    }
    if (typeof body?.whatsappSessionName === "string") {
      profileUpdates.whatsappSessionName = toNullable(body.whatsappSessionName);
    }
    if (typeof body?.pixKey === "string") {
      profileUpdates.pixKey = toNullable(body.pixKey);
    }
    if (typeof body?.pixName === "string") {
      profileUpdates.pixName = toNullable(body.pixName);
    }
    if (typeof body?.pixBank === "string") {
      profileUpdates.pixBank = toNullable(body.pixBank);
    }

    if (Object.keys(profileUpdates).length > 0) {
      await prisma.profile.update({
        where: { id: activeProfile.id },
        data: profileUpdates,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar configurações",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
