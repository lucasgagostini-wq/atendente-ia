import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { evolutionSendSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = evolutionSendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (activeProfile.status === "AWAITING_WHATSAPP") {
      return NextResponse.json(
        { error: "Perfil ainda sem WhatsApp conectado" },
        { status: 412 },
      );
    }

    const lead = await leadService.upsertByPhone(
      parsed.data.phone,
      undefined,
      activeProfile.id,
      { profileSlug: activeProfile.slug },
    );
    const conversation = await conversationService.getOrCreateOpenConversation(
      lead.id,
    );

    const sent = await evolutionService.sendTextStrict(lead.phone, parsed.data.text);

    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "OUTBOUND",
      role: "HUMAN",
      type: "TEXT",
      content: parsed.data.text,
      whatsappMessageId:
        typeof sent?.key?.id === "string"
          ? sent.key.id
          : typeof sent?.serverId === "string"
            ? sent.serverId
            : null,
      metadata: sent,
    });

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";

    return NextResponse.json(
      {
        error: "Falha ao enviar mensagem",
        detail: message,
      },
      { status: /não configurada/i.test(message) ? 412 : 500 },
    );
  }
}
