import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { evolutionService } from "@/services/evolution.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    if (activeProfile.status === "AWAITING_WHATSAPP" && activeProfile.slug !== "restauracao-fotos") {
      return NextResponse.json(
        { error: "Perfil aguardando configuração do WhatsApp dedicado." },
        { status: 412 },
      );
    }

    const payload = await evolutionService.reconnect();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";

    return NextResponse.json(
      {
        error: "Falha ao reconectar instância",
        detail: message,
      },
      { status: /não configurada/i.test(message) ? 412 : 500 },
    );
  }
}
