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
import {
  safeFallbackForStage,
  sanitizeAIResponse,
  validatePromptMaster,
} from "@/services/ai-safety.service";
import {
  AI_RESPONSE_TIMEOUT_MS,
  INCOMING_MESSAGE_DEBOUNCE_MS,
  calculateTypingDelay,
  remainingTypingDelay,
  sleep,
} from "@/lib/typing-delay";

export const dynamic = "force-dynamic";

// ── Tipos ──────────────────────────────────────────────────────

type IncomingPayload = {
  phone: string;
  text: string;
  messageId: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO";
  replyTransport?: "baileys_bridge" | "evolution";
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

// ── Helpers ────────────────────────────────────────────────────

/** Remove todos os não-dígitos de telefones/JIDs do WhatsApp */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
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
  const payloadPhone =
    payload?.data?.phone ||
    payload?.phone ||
    payload?.data?.number ||
    payload?.number ||
    "";

  // Ignorar se não tem remetente ou é mensagem própria
  if (!remoteJid) return null;
  if (keyNode?.fromMe) return null;

  // Ignorar mensagens de grupos
  if (remoteJid.endsWith("@g.us")) return null;

  let text =
    messageNode?.conversation ||
    messageNode?.extendedTextMessage?.text ||
    messageNode?.imageMessage?.caption ||
    messageNode?.audioMessage?.caption ||
    "";

  let type: IncomingPayload["type"] = "TEXT";
  if (messageNode?.imageMessage) type = "IMAGE";
  if (messageNode?.audioMessage) type = "AUDIO";

  if ((!text || typeof text !== "string" || text.trim().length === 0) && type === "IMAGE") {
    text = "Cliente enviou uma foto para restaurar.";
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) return null;

  const phone = normalizePhone(payloadPhone || remoteJid);
  if (!phone) return null;

  return {
    phone,
    text: text.trim(),
    messageId: keyNode?.id ?? null,
    type,
    replyTransport:
      payload?.data?.replyTransport === "baileys_bridge"
        ? "baileys_bridge"
        : "evolution",
    senderName: payload?.data?.pushName || payload?.pushName || undefined,
    metadata: {
      event: payload?.event || payload?.data?.event || null,
      key: keyNode ?? null,
      remoteJid,
      resolvedPhone: phone,
    } as Prisma.InputJsonValue,
  };
}

/** Verifica se a mensagem deve ser transferida para humano */
function shouldTransferToHuman(message: string): boolean {
  return /(humano|atendente|pessoa real|suporte humano|falar com algu[eé]m|quero falar com)/i.test(message);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          resolve({
            output: safeFallbackForStage("needs_photo"),
            model: "safe-fallback/timeout",
            usage: null,
            fallback: true,
            error: `AI response timeout after ${timeoutMs}ms`,
          } as T);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    const inboundMessage = await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "INBOUND",
      role: "LEAD",
      type: incoming.type,
      content: incoming.text,
      metadata: incoming.metadata,
    });
    const typingStartedAt = Date.now();

    if (incoming.replyTransport !== "baileys_bridge") {
      evolutionService.sendTypingPresence(lead.phone, 3000).catch(() => {});
    }

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

      await conversationService.saveMessage({
        conversationId: conversation.id,
        leadId: lead.id,
        direction: "OUTBOUND",
        role: "SYSTEM",
        type: "TEXT",
        content: transferText,
        metadata: {} as Prisma.InputJsonValue,
      });
      const typingDelayMs = calculateTypingDelay(transferText);
      const waitBeforeSendMs = remainingTypingDelay({
        calculatedDelayMs: typingDelayMs,
        elapsedMs: Date.now() - typingStartedAt,
      });

      if (incoming.replyTransport === "baileys_bridge") {
        return NextResponse.json({
          ok: true,
          transferred: true,
          reply: { phone: lead.phone, text: transferText, typingDelayMs },
        });
      }

      if (waitBeforeSendMs > 0) {
        await evolutionService.sendTypingPresence(lead.phone, waitBeforeSendMs);
        await sleep(waitBeforeSendMs);
      }

      const sent = await evolutionService.sendTextStrict(lead.phone, transferText).catch((e) => ({
        error: e instanceof Error ? e.message : "falha no envio",
      }));

      return NextResponse.json({ ok: true, transferred: true, sent });
    }

    // ── IA desativada para este lead ─────────────────────────
    if (!lead.aiEnabled || lead.humanTakeover) {
      return NextResponse.json({ ok: true, aiSkipped: true });
    }

    if (INCOMING_MESSAGE_DEBOUNCE_MS > 0) {
      await sleep(INCOMING_MESSAGE_DEBOUNCE_MS);

      const newerInboundMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          leadId: lead.id,
          direction: "INBOUND",
          createdAt: { gt: inboundMessage.createdAt },
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      if (newerInboundMessage) {
        await prisma.log.create({
          data: {
            type: "WHATSAPP_MESSAGE_DEBOUNCED",
            message: "Resposta adiada porque chegaram mensagens mais novas do mesmo lead",
            payload: {
              leadId: lead.id,
              conversationId: conversation.id,
              messageId: inboundMessage.id,
              newerMessageId: newerInboundMessage.id,
              debounceMs: INCOMING_MESSAGE_DEBOUNCE_MS,
            },
          },
        });

        return NextResponse.json({
          ok: true,
          debounced: true,
          reason: "newer_message_received",
        });
      }
    }

    // ── Resposta da IA ───────────────────────────────────────
    const [prompt, recentHistory] = await Promise.all([
      promptService.getActivePrompt(),
      conversationService.getRecentHistory(conversation.id, 6),
    ]);

    const systemPrompt = promptService.composeSystemPrompt({ prompt, lead, recentHistory });
    const promptValidation = validatePromptMaster(prompt);

    if (!promptValidation.valid) {
      await prisma.log.create({
        data: {
          type: "AI_PROMPT_WARNING",
          message: "Prompt Master incompleto antes da chamada da IA",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            missing: promptValidation.missing,
          },
        },
      });
    }

    let renewPresenceTimer: ReturnType<typeof setInterval> | null = null;

    if (incoming.replyTransport !== "baileys_bridge") {
      renewPresenceTimer = setInterval(() => {
        evolutionService.sendTypingPresence(lead.phone, 3000).catch(() => {});
      }, 4000);
    }

    const aiResponse = await withTimeout(openRouterService.generateResponse({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: incoming.text },
      ],
      maxTokens: 220,
      safetyContext: {
        incomingText: incoming.text,
        recentHistory,
        hasPhoto: incoming.type === "IMAGE",
      },
    }), AI_RESPONSE_TIMEOUT_MS);

    if (renewPresenceTimer) clearInterval(renewPresenceTimer);

    if (aiResponse.model === "safe-fallback/timeout") {
      await prisma.log.create({
        data: {
          type: "AI_FALLBACK_USED",
          message: "Timeout da IA; fallback humano seguro aplicado",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            timeoutMs: AI_RESPONSE_TIMEOUT_MS,
            finalResponse: aiResponse.output,
          },
        },
      });
    }

    const safeResponse = sanitizeAIResponse(aiResponse.output, {
      incomingText: incoming.text,
      recentHistory,
      hasPhoto: incoming.type === "IMAGE",
    });
    const typingDelayMs = calculateTypingDelay(safeResponse.output);
    const elapsedSinceTypingStartedMs = Date.now() - typingStartedAt;
    const waitBeforeSendMs = remainingTypingDelay({
      calculatedDelayMs: typingDelayMs,
      elapsedMs: elapsedSinceTypingStartedMs,
    });

    if (safeResponse.blocked) {
      await prisma.log.create({
        data: {
          type: "AI_RESPONSE_BLOCKED",
          message: "Resposta bloqueada antes do envio ao WhatsApp",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            model: aiResponse.model,
            rawResponse: aiResponse.output,
            finalResponse: safeResponse.output,
            reason: safeResponse.reason,
            fallbackStage: safeResponse.fallbackStage,
          },
        },
      });
    }

    await conversationService.saveMessage({
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: "TEXT",
      content: safeResponse.output,
      metadata: {
        model: aiResponse.model,
        usage: aiResponse.usage,
        fallback: Boolean(aiResponse.fallback || safeResponse.blocked),
        sanitized: safeResponse.blocked,
        sanitizeReason: safeResponse.reason ?? null,
        promptValidationMissing: promptValidation.missing,
        replyTransport: incoming.replyTransport,
        typingDelayMs,
        waitBeforeSendMs,
        elapsedSinceTypingStartedMs,
      } as Prisma.InputJsonValue,
    });

    if (incoming.replyTransport === "baileys_bridge") {
      return NextResponse.json({
        ok: true,
        response: safeResponse.output,
        reply: { phone: lead.phone, text: safeResponse.output, typingDelayMs },
      });
    }

    if (waitBeforeSendMs > 0) {
      await evolutionService.sendTypingPresence(lead.phone, waitBeforeSendMs);
      await sleep(waitBeforeSendMs);
    }

    const sent = await evolutionService.sendTextStrict(lead.phone, safeResponse.output);

    return NextResponse.json({ ok: true, response: safeResponse.output, sent });

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
