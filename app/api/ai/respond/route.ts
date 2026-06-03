import { NextResponse } from "next/server";
import { aiRespondSchema } from "@/lib/validations";
import { conversationService } from "@/services/conversation.service";
import { openRouterService } from "@/services/openrouter.service";
import { promptService } from "@/services/prompt.service";
import {
  ensureSalesCTA,
  sanitizeAIResponse,
  splitResponseIntoWhatsAppMessages,
  validatePromptMaster,
} from "@/services/ai-safety.service";
import { prisma } from "@/lib/prisma";

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
    const promptValidation = validatePromptMaster(prompt);

    if (!promptValidation.valid) {
      await prisma.log.create({
        data: {
          type: "AI_PROMPT_WARNING",
          message: "Prompt Master incompleto antes de resposta manual com IA",
          payload: {
            leadId: conversation.lead.id,
            conversationId: conversation.id,
            missing: promptValidation.missing,
          },
        },
      });
    }

    const generated = await openRouterService.generateResponse({
      messages: [
        { role: "system", content: systemPrompt },
        ...(parsed.data.incomingMessage
          ? [{ role: "user" as const, content: parsed.data.incomingMessage }]
          : []),
      ],
      maxTokens: 350,
      safetyContext: {
        incomingText: parsed.data.incomingMessage,
        recentHistory,
      },
    });
    const safeResponse = sanitizeAIResponse(generated.output, {
      incomingText: parsed.data.incomingMessage,
      recentHistory,
    });
    const commercialResponse = ensureSalesCTA(safeResponse.output, {
      incomingText: parsed.data.incomingMessage,
      recentHistory,
    });
    const responseMessages = splitResponseIntoWhatsAppMessages(commercialResponse);

    if (safeResponse.blocked) {
      await prisma.log.create({
        data: {
          type: "AI_RESPONSE_BLOCKED",
          message: "Resposta bloqueada antes de salvar sugestão de IA",
          payload: {
            leadId: conversation.lead.id,
            conversationId: conversation.id,
            model: generated.model,
            rawResponse: generated.output,
            finalResponse: commercialResponse,
            reason: safeResponse.reason,
            fallbackStage: safeResponse.fallbackStage,
          },
        },
      });
    }

    if (commercialResponse !== safeResponse.output) {
      await prisma.log.create({
        data: {
          type: "AI_SALES_CTA_ENFORCED",
          message: "CTA comercial adicionado antes de salvar sugestão de IA",
          payload: {
            leadId: conversation.lead.id,
            conversationId: conversation.id,
            originalResponse: safeResponse.output,
            finalResponse: commercialResponse,
            messagesCount: responseMessages.length,
          },
        },
      });
    }

    for (let index = 0; index < responseMessages.length; index += 1) {
      await conversationService.saveMessage({
        conversationId: conversation.id,
        leadId: conversation.lead.id,
        direction: "OUTBOUND",
        role: "ASSISTANT",
        type: "TEXT",
        content: responseMessages[index],
        metadata: {
          model: generated.model,
          usage: generated.usage,
          fallback: Boolean(generated.fallback || safeResponse.blocked),
          sanitized: safeResponse.blocked,
          sanitizeReason: safeResponse.reason ?? null,
          promptValidationMissing: promptValidation.missing,
          commercialCtaEnforced: commercialResponse !== safeResponse.output,
          messagePart: index + 1,
          totalParts: responseMessages.length,
        },
      });
    }

    return NextResponse.json({
      ...generated,
      output: commercialResponse,
      messages: responseMessages,
      fallback: Boolean(generated.fallback || safeResponse.blocked),
      sanitized: safeResponse.blocked,
    });
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
