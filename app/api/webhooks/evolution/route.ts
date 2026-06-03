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
  PAYMENT_STAGE_RECEIPT_SENT,
  PAYMENT_STAGE_WAITING_RECEIPT,
  detectPaymentIntent,
  detectPaymentReceipt,
  ensureSalesCTA,
  safeFallbackForStage,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
  updateConversationStage,
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
    messageNode?.documentMessage?.caption ||
    messageNode?.audioMessage?.caption ||
    "";

  let type: IncomingPayload["type"] = "TEXT";
  if (messageNode?.imageMessage) type = "IMAGE";
  if (messageNode?.documentMessage) type = "IMAGE";
  if (messageNode?.audioMessage) type = "AUDIO";

  if ((!text || typeof text !== "string" || text.trim().length === 0) && type === "IMAGE") {
    text = messageNode?.documentMessage
      ? "Cliente enviou um documento ou comprovante."
      : "Cliente enviou uma foto para restaurar.";
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

async function saveAndSendMessages(args: {
  conversationId: string;
  leadId: string;
  phone: string;
  messages: string[];
  replyTransport?: "baileys_bridge" | "evolution";
  metadata?: Prisma.InputJsonValue;
  typingStartedAt: number;
}) {
  const fullText = args.messages.join("\n\n");
  const typingDelayMs = calculateTypingDelay(fullText);
  const waitBeforeSendMs = remainingTypingDelay({
    calculatedDelayMs: typingDelayMs,
    elapsedMs: Date.now() - args.typingStartedAt,
  });
  const aiElapsedMs = Date.now() - args.typingStartedAt;

  prisma.log.create({
    data: {
      type: "TYPING_DURATION_CALCULATED",
      message: `Typing calculado para ${args.phone}`,
      payload: {
        number: args.phone,
        typingDelayMs,
        aiElapsedMs,
        waitBeforeSendMs,
        messagesCount: args.messages.length,
      },
    },
  }).catch(() => {});

  for (let index = 0; index < args.messages.length; index += 1) {
    await conversationService.saveMessage({
      conversationId: args.conversationId,
      leadId: args.leadId,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: "TEXT",
      content: args.messages[index],
      metadata: {
        ...(typeof args.metadata === "object" && args.metadata ? args.metadata : {}),
        typingDelayMs,
        waitBeforeSendMs,
        messagePart: index + 1,
        totalParts: args.messages.length,
      } as Prisma.InputJsonValue,
    });
  }

  if (args.replyTransport === "baileys_bridge") {
    return {
      ok: true,
      response: fullText,
      replies: args.messages.map((text) => ({ phone: args.phone, text, typingDelayMs })),
      reply: { phone: args.phone, text: fullText, typingDelayMs },
    };
  }

  if (waitBeforeSendMs > 0) {
    await evolutionService.startTypingPresence(args.phone, waitBeforeSendMs);
    await sleep(waitBeforeSendMs);
  }

  const sent = [];
  for (let index = 0; index < args.messages.length; index += 1) {
    if (index > 0) {
      const betweenMessagesTypingMs = index === 1 ? 1400 : 1200;
      await evolutionService.startTypingPresence(args.phone, betweenMessagesTypingMs);
      await sleep(betweenMessagesTypingMs);
    }
    sent.push(await evolutionService.sendTextStrict(args.phone, args.messages[index]));
    await evolutionService.clearTypingSession(args.phone);
    prisma.log.create({
      data: {
        type: "MESSAGE_SENT_AFTER_TYPING",
        message: `Mensagem enviada após typing para ${args.phone}`,
        payload: {
          number: args.phone,
          messagePart: index + 1,
          totalParts: args.messages.length,
          waitBeforeSendMs: index === 0 ? waitBeforeSendMs : undefined,
        },
      },
    }).catch(() => {});
  }

  return { ok: true, response: fullText, sent };
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
        await evolutionService.startTypingPresence(lead.phone, waitBeforeSendMs);
        await sleep(waitBeforeSendMs);
      }

      const sent = await evolutionService.sendTextStrict(lead.phone, transferText).catch((e) => ({
        error: e instanceof Error ? e.message : "falha no envio",
      }));
      await evolutionService.clearTypingSession(lead.phone);

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

    const isWaitingReceipt =
      lead.summary?.includes(PAYMENT_STAGE_WAITING_RECEIPT) ?? false;

    if (isWaitingReceipt && detectPaymentReceipt({
      incomingText: incoming.text,
      hasPhoto: incoming.type === "IMAGE",
    })) {
      const receiptText =
        "Recebi sim 😊 vou conferir aqui e já começo a restauração da sua foto com todo carinho.";

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          funnelStage: "CHECKOUT",
          status: "NEGOTIATION",
          summary: updateConversationStage(lead.summary, PAYMENT_STAGE_RECEIPT_SENT),
        },
      });

      await prisma.log.create({
        data: {
          type: "PAYMENT_RECEIPT_ALERT",
          message: "Comprovante recebido; operador deve conferir o pagamento",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            phone: lead.phone,
            incomingType: incoming.type,
            text: incoming.text,
          },
        },
      });

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: [receiptText],
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        metadata: {
          source: "payment_receipt",
          paymentStage: PAYMENT_STAGE_RECEIPT_SENT,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    if (detectPaymentIntent({ incomingText: incoming.text })) {
      const paymentMessages = sendPixAsSeparateMessage();

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          funnelStage: "CHECKOUT",
          status: "NEGOTIATION",
          summary: updateConversationStage(lead.summary, PAYMENT_STAGE_WAITING_RECEIPT),
        },
      });

      await prisma.log.create({
        data: {
          type: "PAYMENT_PIX_SENT",
          message: "Dados PIX enviados em sequência separada",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            phone: lead.phone,
            paymentStage: PAYMENT_STAGE_WAITING_RECEIPT,
          },
        },
      });

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: paymentMessages,
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        metadata: {
          source: "payment_intent",
          paymentStage: PAYMENT_STAGE_WAITING_RECEIPT,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
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
    const commercialResponse = ensureSalesCTA(safeResponse.output, {
      incomingText: incoming.text,
      recentHistory,
      hasPhoto: incoming.type === "IMAGE",
    });
    const responseMessages = splitResponseIntoWhatsAppMessages(commercialResponse);
    const typingDelayMs = calculateTypingDelay(commercialResponse);
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

    if (commercialResponse !== safeResponse.output) {
      await prisma.log.create({
        data: {
          type: "AI_SALES_CTA_ENFORCED",
          message: "CTA comercial adicionado antes do envio",
          payload: {
            leadId: lead.id,
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
        leadId: lead.id,
        direction: "OUTBOUND",
        role: "ASSISTANT",
        type: "TEXT",
        content: responseMessages[index],
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
          commercialCtaEnforced: commercialResponse !== safeResponse.output,
          messagePart: index + 1,
          totalParts: responseMessages.length,
        } as Prisma.InputJsonValue,
      });
    }

    if (incoming.replyTransport === "baileys_bridge") {
      return NextResponse.json({
        ok: true,
        response: commercialResponse,
        replies: responseMessages.map((text) => ({ phone: lead.phone, text, typingDelayMs })),
        reply: { phone: lead.phone, text: commercialResponse, typingDelayMs },
      });
    }

    if (waitBeforeSendMs > 0) {
      await evolutionService.startTypingPresence(lead.phone, waitBeforeSendMs);
      await sleep(waitBeforeSendMs);
    }

    const sent = [];
    for (let index = 0; index < responseMessages.length; index += 1) {
      if (index > 0) {
        const betweenMessagesTypingMs = index === 1 ? 1400 : 1200;
        await evolutionService.startTypingPresence(lead.phone, betweenMessagesTypingMs);
        await sleep(betweenMessagesTypingMs);
      }
      sent.push(await evolutionService.sendTextStrict(lead.phone, responseMessages[index]));
      await evolutionService.clearTypingSession(lead.phone);
      prisma.log.create({
        data: {
          type: "MESSAGE_SENT_AFTER_TYPING",
          message: `Mensagem enviada após typing para ${lead.phone}`,
          payload: {
            number: lead.phone,
            messagePart: index + 1,
            totalParts: responseMessages.length,
            waitBeforeSendMs: index === 0 ? waitBeforeSendMs : undefined,
          },
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, response: commercialResponse, sent });

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
