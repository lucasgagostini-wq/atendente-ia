import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { leadService } from "@/services/lead.service";
import { openRouterService } from "@/services/openrouter.service";
import { promptService } from "@/services/prompt.service";

export const dynamic = "force-dynamic";

type IncomingPayload = {
  phone: string;
  text: string;
  type: "TEXT" | "IMAGE" | "AUDIO";
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

function normalizePhone(raw: string) {
  const cleaned = raw.replace(/\D/g, "");
  return cleaned.replace(/@s\.whatsapp\.net$/, "");
}

function extractIncomingPayload(payload: any): IncomingPayload | null {
  const messageNode =
    payload?.data?.message ||
    payload?.data?.messages?.[0]?.message ||
    payload?.message ||
    payload?.messages?.[0]?.message;

  const keyNode =
    payload?.data?.key ||
    payload?.data?.messages?.[0]?.key ||
    payload?.key ||
    payload?.messages?.[0]?.key;

  const remoteJid =
    keyNode?.remoteJid ||
    payload?.data?.sender ||
    payload?.sender ||
    payload?.from ||
    "";

  if (!remoteJid) return null;
  if (keyNode?.fromMe) return null;

  const text =
    messageNode?.conversation ||
    messageNode?.extendedTextMessage?.text ||
    messageNode?.imageMessage?.caption ||
    messageNode?.audioMessage?.caption ||
    "";

  if (!text || typeof text !== "string") return null;

  let type: IncomingPayload["type"] = "TEXT";
  if (messageNode?.imageMessage) type = "IMAGE";
  if (messageNode?.audioMessage) type = "AUDIO";

  return {
    phone: normalizePhone(remoteJid),
    text,
    type,
    senderName: payload?.data?.pushName || payload?.pushName,
    metadata: {
      event: payload?.event || payload?.data?.event || null,
      key: keyNode ?? null,
    } as Prisma.InputJsonValue,
  };
}

function shouldTransferToHuman(message: string) {
  return /(humano|atendente|pessoa real|suporte humano|falar com alguém)/i.test(
    message,
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const incoming = extractIncomingPayload(payload);

    if (!incoming) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const lead = await leadService.upsertByPhone(incoming.phone, {
      name: incoming.senderName,
      source: "whatsapp",
    });

    const conversation = await conversationService.getOrCreateOpenConversation(
      lead.id,
    );

    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "INBOUND",
      role: "LEAD",
      type: incoming.type,
      content: incoming.text,
      metadata: incoming.metadata,
    });

    await prisma.log.create({
      data: {
        type: "WEBHOOK_MESSAGE",
        message: `Mensagem recebida de ${lead.phone}`,
        payload,
      },
    });

    if (shouldTransferToHuman(incoming.text)) {
      await leadService.setAiState(lead.id, false);
      const transferText =
        "Perfeito. Vou pausar a IA e encaminhar você para nosso atendimento humano agora.";
      const sent = await evolutionService.sendTextStrict(lead.phone, transferText);

      await conversationService.saveMessage({
        conversationId: conversation.id,
        leadId: lead.id,
        direction: "OUTBOUND",
        role: "SYSTEM",
        type: "TEXT",
        content: transferText,
        metadata: sent,
      });

      return NextResponse.json({
        ok: true,
        transferred: true,
      });
    }

    if (!lead.aiEnabled || lead.humanTakeover) {
      return NextResponse.json({ ok: true, aiSkipped: true });
    }

    const prompt = await promptService.getActivePrompt();
    const recentHistory = await conversationService.getRecentHistory(
      conversation.id,
      16,
    );
    const systemPrompt = promptService.composeSystemPrompt({
      prompt,
      lead,
      recentHistory,
    });

    const aiResponse = await openRouterService.generateResponse({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: incoming.text },
      ],
      maxTokens: 350,
    });

    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: "TEXT",
      content: aiResponse.output,
      metadata: {
        model: aiResponse.model,
        usage: aiResponse.usage,
        fallback: aiResponse.fallback ?? false,
      },
    });

    const sent = await evolutionService.sendTextStrict(lead.phone, aiResponse.output);

    return NextResponse.json({
      ok: true,
      response: aiResponse.output,
      sent,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido no webhook";

    await prisma.log.create({
      data: {
        type: "WEBHOOK_ERROR",
        message,
      },
    });

    return NextResponse.json(
      {
        error: "Falha no processamento do webhook",
        detail: message,
      },
      {
        status: /não configurada/i.test(message) ? 412 : 500,
      },
    );
  }
}
