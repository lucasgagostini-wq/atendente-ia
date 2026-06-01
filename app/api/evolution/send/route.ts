import { NextResponse } from "next/server";
import { evolutionSendSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { leadService } from "@/services/lead.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = evolutionSendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const lead = await leadService.upsertByPhone(parsed.data.phone);
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
