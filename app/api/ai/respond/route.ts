import { NextResponse } from "next/server";
import { aiRespondSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { openRouterService } from "@/services/openrouter.service";
import { promptService } from "@/services/prompt.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = aiRespondSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const conversation = await conversationService.getConversationById(
      parsed.data.conversationId,
    );

    if (!conversation || conversation.leadId !== parsed.data.leadId) {
      return NextResponse.json(
        { error: "Conversa não encontrada para esse lead" },
        { status: 404 },
      );
    }

    const prompt = await promptService.getActivePrompt();
    const recentHistory = await conversationService.getRecentHistory(
      conversation.id,
      14,
    );
    const systemPrompt = promptService.composeSystemPrompt({
      prompt,
      lead: conversation.lead,
      recentHistory,
    });

    const generated = await openRouterService.generateResponse({
      messages: [
        { role: "system", content: systemPrompt },
        ...(parsed.data.incomingMessage
          ? [{ role: "user" as const, content: parsed.data.incomingMessage }]
          : []),
      ],
      maxTokens: 350,
    });

    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: conversation.lead.id,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: "TEXT",
      content: generated.output,
      metadata: {
        model: generated.model,
        usage: generated.usage,
        fallback: generated.fallback ?? false,
      },
    });

    return NextResponse.json(generated);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao responder com IA",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
