/**
 * webhooks/evolution/route.ts
 *
 * Processa mensagens recebidas da Evolution API (ou Baileys bridge).
 * Fluxo: receber → deduplicar → upsert lead → salvar mensagem → responder com IA
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { leadService } from "@/services/lead.service";
import { openRouterService } from "@/services/openrouter.service";
import { promptService } from "@/services/prompt.service";

export const dynamic = "force-dynamic";

// ── Tipos ──────────────────────────────────────────────────────

type IncomingPayload = {
  phone: string;
  text: string;
  messageId: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO";
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

// ── Helpers ────────────────────────────────────────────────────

/** Remove todos os não-dígitos e sufixo @s.whatsapp.net */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/@s\.whatsapp\.net$/, "");
}

/** Extrai os campos relevantes do payload da Evolution API / Baileys */
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

  // Ignorar se não tem remetente ou é mensagem própria
  if (!remoteJid) return null;
  if (keyNode?.fromMe) return null;

  // Ignorar mensagens de grupos
  if (remoteJid.endsWith("@g.us")) return null;

  const text =
    messageNode?.conversation ||
    messageNode?.extendedTextMessage?.text ||
    messageNode?.imageMessage?.caption ||
    messageNode?.audioMessage?.caption ||
    "";

  if (!text || typeof text !== "string" || text.trim().length === 0) return null;

  let type: IncomingPayload["type"] = "TEXT";
  if (messageNode?.imageMessage) type = "IMAGE";
  if (messageNode?.audioMessage) type = "AUDIO";

  return {
    phone: normalizePhone(remoteJid),
    text: text.trim(),
    messageId: keyNode?.id ?? null,
    type,
    senderName: payload?.data?.pushName || payload?.pushName || undefined,
    metadata: {
      event: payload?.event || payload?.data?.event || null,
      key: keyNode ?? null,
    } as Prisma.InputJsonValue,
  };
}

/** Verifica se a mensagem deve ser transferida para humano */
function shouldTransferToHuman(message: string): boolean {
  return /(humano|atendente|pessoa real|suporte humano|falar com algu[eé]m|quero falar com)/i.test(message);
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  let payload: any;

  try {
    payload = await request.json();
  } catch {
    // Payload inválido — retornar 200 para não causar retry da Evolution
    return NextResponse.json({ ok: true, ignored: true, reason: "invalid_json" });
  }

  try {
    const incoming = extractIncomingPayload(payload);

    if (!incoming) {
      return NextResponse.json({ ok: true, ignored: true, reason: "no_text" });
    }

    // ── Deduplicação ─────────────────────────────────────────
    // Evita processar a mesma mensagem duas vezes (retries do webhook)
    if (incoming.messageId) {
      const alreadyProcessed = await prisma.message.findFirst({
        where: {
          metadata: {
            path: ["key", "id"],
            equals: incoming.messageId,
          },
          direction: "INBOUND",
        },
        select: { id: true },
      });

      if (alreadyProcessed) {
        return NextResponse.json({ ok: true, ignored: true, reason: "duplicate" });
      }
    }

    // ── Upsert lead ──────────────────────────────────────────
    const lead = await leadService.upsertByPhone(incoming.phone, {
      name: incoming.senderName,
      source: "whatsapp",
    });

    // ── Criar/buscar conversa ────────────────────────────────
    const conversation = await conversationService.getOrCreateOpenConversation(lead.id);

    // ── Salvar mensagem recebida ─────────────────────────────
    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "INBOUND",
      role: "LEAD",
      type: incoming.type,
      content: incoming.text,
      metadata: incoming.metadata,
    });

    // ── Log assíncrono (não bloqueia o fluxo) ───────────────
    prisma.log.create({
      data: {
        type: "WEBHOOK_MESSAGE",
        message: `Mensagem recebida de ${incoming.phone}`,
        payload: { phone: incoming.phone, text: incoming.text.slice(0, 100) },
      },
    }).catch(() => { /* log silencioso */ });

    // ── Transferência para humano ────────────────────────────
    if (shouldTransferToHuman(incoming.text)) {
      await leadService.setAiState(lead.id, false);

      const transferText = "Perfeito. Vou pausar a IA e encaminhar você para nosso atendimento humano agora.";

      const [, sent] = await Promise.all([
        conversationService.saveMessage({
          conversationId: conversation.id,
          leadId: lead.id,
          direction: "OUTBOUND",
          role: "SYSTEM",
          type: "TEXT",
          content: transferText,
          metadata: {} as Prisma.InputJsonValue,
        }),
        evolutionService.sendTextStrict(lead.phone, transferText).catch((e) => ({
          error: e instanceof Error ? e.message : "falha no envio",
        })),
      ]);

      return NextResponse.json({ ok: true, transferred: true, sent });
    }

    // ── IA desativada para este lead ─────────────────────────
    if (!lead.aiEnabled || lead.humanTakeover) {
      return NextResponse.json({ ok: true, aiSkipped: true });
    }

    // ── Resposta da IA ───────────────────────────────────────
    const [prompt, recentHistory] = await Promise.all([
      promptService.getActivePrompt(),
      conversationService.getRecentHistory(conversation.id, 16),
    ]);

    const systemPrompt = promptService.composeSystemPrompt({ prompt, lead, recentHistory });

    const aiResponse = await openRouterService.generateResponse({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: incoming.text },
      ],
      maxTokens: 350,
    });

    // Salvar resposta e enviar ao WhatsApp em paralelo
    const [, sent] = await Promise.all([
      conversationService.saveMessage({
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
        } as Prisma.InputJsonValue,
      }),
      evolutionService.sendTextStrict(lead.phone, aiResponse.output),
    ]);

    return NextResponse.json({ ok: true, response: aiResponse.output, sent });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no webhook";

    // Log de erro sem bloquear o retorno
    prisma.log.create({
      data: { type: "WEBHOOK_ERROR", message, payload: { raw: String(payload).slice(0, 500) } },
    }).catch(() => { /* silencioso */ });

    // Retornar 200 para não causar retry infinito da Evolution API
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
