/**
 * POST /api/settings/ai-toggle
 *
 * Liga ou desliga a IA globalmente.
 * Quando pausada, o webhook salva as mensagens recebidas mas não gera resposta automática.
 * Nenhum lead é modificado — ao reativar, tudo volta como estava.
 */

import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { prisma } from "@/lib/prisma";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    if (!profile.aiEnabled && profile.status === "AWAITING_WHATSAPP") {
      return NextResponse.json(
        { error: "Conecte o WhatsApp deste perfil antes de ativar a IA." },
        { status: 412 },
      );
    }
    const nextEnabled = !profile.aiEnabled;

    const updatedProfile = await profileService.setAiEnabled(profile.id, nextEnabled);

    await prisma.log.create({
      data: {
        type: nextEnabled ? "AI_PROFILE_RESUMED" : "AI_PROFILE_PAUSED",
        message: nextEnabled
          ? `IA reativada para o perfil ${updatedProfile.slug}.`
          : `IA pausada para o perfil ${updatedProfile.slug}.`,
        payload: {
          profileId: updatedProfile.id,
          profileSlug: updatedProfile.slug,
          aiEnabled: updatedProfile.aiEnabled,
        },
      },
    });

    return NextResponse.json({
      aiPaused: !updatedProfile.aiEnabled,
      profile: updatedProfile,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Falha ao alternar estado da IA", detail: error instanceof Error ? error.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const profile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(request),
  );
  return NextResponse.json({
    aiPaused: !profile.aiEnabled,
    profile,
  });
}
