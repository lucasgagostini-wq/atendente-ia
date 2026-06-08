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
import { getSettings } from "@/lib/settings-cache";
import { leadService } from "@/services/lead.service";
import { openRouterService } from "@/services/openrouter.service";
import { paymentReceiptService, PixReceiptAnalysis } from "@/services/payment-receipt.service";
import { promptService } from "@/services/prompt.service";
import {
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_SENT,
  PAYMENT_STAGE_WAITING_RECEIPT,
  buildExpectedPaymentData,
  detectPaymentIntent,
  detectPaymentReceipt,
  detectIfWaitingPaymentReceipt,
  ensureSalesCTA,
  hasRecentPixContext,
  normalizeCommercialResponse,
  safeFallbackForStage,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
  updateConversationStage,
  validatePromptMaster,
} from "@/services/ai-safety.service";
import {
  AI_RESPONSE_TIMEOUT_MS,
  calculateTypingDelay,
  remainingTypingDelay,
  sleep,
} from "@/lib/typing-delay";

export const dynamic = "force-dynamic";

// ── Constantes de autenticação ──────────────────────────────────

/**
 * Segredo compartilhado para autenticar o bridge Baileys.
 * Quando definido, apenas requests com o header X-Webhook-Secret correto
 * são aceitos. Se não definido, funciona em modo legado (sem validação).
 *
 * Para ativar em produção:
 * 1. Gere um segredo forte: openssl rand -hex 32
 * 2. Defina WEBHOOK_SECRET no bridge (.env local)
 * 3. Defina WEBHOOK_SECRET na Vercel (env vars)
 * 4. Faça redeploy — ambos precisam estar ativos ao mesmo tempo.
 *
 * ⚠️  NÃO ative em produção sem sincronizar os dois lados.
 */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ── Tipos ──────────────────────────────────────────────────────

export type IncomingPayload = {
  phone: string;
  text: string;
  messageId: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO";
  imageUrlOrBase64?: string | null;
  replyTransport?: "baileys_bridge" | "evolution";
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

export type PendingInboundMessage = {
  id: string;
  content: string;
  type: "TEXT" | "IMAGE" | "AUDIO";
  createdAt: Date;
};

type PendingInboundBatchState = {
  messages: PendingInboundMessage[];
  firstMessage: PendingInboundMessage | null;
  latestMessage: PendingInboundMessage | null;
  hasMedia: boolean;
  silenceWindowMs: number;
  elapsedSinceFirstMs: number;
  quietForMs: number;
};

const TEXT_SILENCE_WINDOW_MS = 4000;
const BATCH_SILENCE_WINDOW_MS = 6000;
const MAX_BATCH_WAIT_MS = 12000;
const SILENCE_POLL_INTERVAL_MS = 400;

// ── Helpers ────────────────────────────────────────────────────

/** Remove todos os não-dígitos de telefones/JIDs do WhatsApp */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Extrai os campos relevantes do payload da Evolution API / Baileys */
export function extractIncomingPayload(payload: any): IncomingPayload | null {
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
  const mediaNode = payload?.data?.media || payload?.media || null;
  const imageUrlOrBase64 =
    mediaNode?.mediaBase64 ||
    mediaNode?.base64 ||
    mediaNode?.url ||
    payload?.data?.mediaBase64 ||
    payload?.data?.base64 ||
    payload?.data?.mediaUrl ||
    payload?.mediaBase64 ||
    payload?.base64 ||
    payload?.mediaUrl ||
    null;

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
    imageUrlOrBase64: typeof imageUrlOrBase64 === "string" ? imageUrlOrBase64 : null,
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
      media: mediaNode
        ? {
            mimetype: mediaNode.mimetype ?? null,
            fileName: mediaNode.fileName ?? null,
            hasMediaBase64: Boolean(mediaNode.mediaBase64 || mediaNode.base64),
            hasMediaUrl: Boolean(mediaNode.url),
            mediaDownloadError: mediaNode.mediaDownloadError ?? null,
          }
        : null,
    } as Prisma.InputJsonValue,
  };
}

/** Verifica se a mensagem deve ser transferida para humano */
export function shouldTransferToHuman(message: string): boolean {
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
  roundInboundMessageId?: string;
}) {
  if (args.roundInboundMessageId) {
    const isCurrent = await isInboundRoundCurrent({
      conversationId: args.conversationId,
      leadId: args.leadId,
      expectedInboundMessageId: args.roundInboundMessageId,
    });

    if (!isCurrent) {
      await prisma.log.create({
        data: {
          type: "AI_RESPONSE_SKIPPED_STALE",
          message: `Resposta descartada por rodada antiga para ${args.phone}`,
          payload: {
            leadId: args.leadId,
            conversationId: args.conversationId,
            phone: args.phone,
            expectedInboundMessageId: args.roundInboundMessageId,
          },
        },
      }).catch(() => {});

      return { ok: true, stale: true, skipped: true };
    }
  }

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

type ReceiptPaymentStage =
  | typeof PAYMENT_STAGE_WAITING_RECEIPT
  | typeof PAYMENT_STAGE_RECEIPT_SENT
  | typeof PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW;

export function receiptDecisionFromAnalysis(analysis: PixReceiptAnalysis): {
  stage: ReceiptPaymentStage;
  message: string;
  alert: string;
  kind: string;
} {
  if (analysis.isRandomImage || !analysis.looksLikePixReceipt) {
    return {
      stage: PAYMENT_STAGE_WAITING_RECEIPT,
      message:
        "Recebi a imagem, mas não consegui identificar como comprovante do PIX. Pode me mandar o comprovante com valor, data e recebedor visíveis, por favor?",
      alert: "Lead enviou imagem que não parece comprovante.",
      kind: "random_or_unrelated",
    };
  }

  const coreMatches =
    analysis.matchesRecipient &&
    analysis.matchesPixKey &&
    analysis.matchesAmount &&
    (analysis.matchesBank || !analysis.bankFound);

  if (coreMatches && !analysis.suspiciousOrUnclear) {
    return {
      stage: PAYMENT_STAGE_RECEIPT_SENT,
      message:
        "Recebi sim 😊 vou conferir aqui e, estando certinho, sigo por aqui com você.",
      alert: "Comprovante recebido e parece coerente. Conferir pagamento manualmente.",
      kind: "coherent",
    };
  }

  return {
    stage: PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
    message: "Recebi aqui 😊 vou conferir certinho os dados do pagamento antes de começar, tá?",
    alert: "Comprovante enviado, mas há divergência ou informação ilegível. Conferir manualmente.",
    kind: "needs_review",
  };
}

async function createInternalPaymentAlert(args: {
  leadId: string;
  conversationId: string;
  phone: string;
  message: string;
  analysis?: PixReceiptAnalysis | null;
  stage: string;
  incomingType: string;
}) {
  return prisma.log.create({
    data: {
      type: "PAYMENT_RECEIPT_ALERT",
      message: args.message,
      payload: {
        leadId: args.leadId,
        conversationId: args.conversationId,
        phone: args.phone,
        paymentStage: args.stage,
        incomingType: args.incomingType,
        analysis: args.analysis ?? null,
      },
    },
  });
}

async function handleReceiptImageMessage(args: {
  incoming: IncomingPayload;
  lead: { id: string; phone: string; summary: string | null };
  conversationId: string;
  recentHistory: string[];
  typingStartedAt: number;
}) {
  const expectedPaymentData = buildExpectedPaymentData({
    incomingText: args.incoming.text,
    recentHistory: args.recentHistory,
    hasPhoto: args.incoming.type === "IMAGE",
  });
  const pixSentAt = args.recentHistory
    .slice()
    .reverse()
    .find((item) => /Chave PIX|estudiofotos000@gmail\.com/i.test(item));
  const analysis = await paymentReceiptService.analyzePossiblePixReceipt(
    args.incoming.imageUrlOrBase64,
    expectedPaymentData,
    {
      pixSentAt: pixSentAt || null,
      receiptReceivedAt: new Date(),
      recentHistory: args.recentHistory,
    },
  );
  const decision = receiptDecisionFromAnalysis(analysis);

  await prisma.lead.update({
    where: { id: args.lead.id },
    data: {
      funnelStage: "CHECKOUT",
      status: "NEGOTIATION",
      summary: updateConversationStage(args.lead.summary, decision.stage),
    },
  });

  await createInternalPaymentAlert({
    leadId: args.lead.id,
    conversationId: args.conversationId,
    phone: args.lead.phone,
    message: decision.alert,
    analysis,
    stage: decision.stage,
    incomingType: args.incoming.type,
  });

  return {
    text: decision.message,
    stage: decision.stage,
    analysis,
    decision: decision.kind,
  };
}

export function buildAiIncomingText(incoming: IncomingPayload, hasRecentPixInHistory: boolean) {
  if (incoming.type !== "IMAGE" || hasRecentPixInHistory) {
    return incoming.text;
  }

  const normalizedText = incoming.text.trim();
  const imageContextNote = "[Cliente enviou uma foto para restaurar]";

  if (normalizedText.includes(imageContextNote)) {
    return normalizedText;
  }

  return `${imageContextNote}\n${normalizedText}`;
}

export function dedupeBatchParts(parts: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const part of parts) {
    const normalized = part.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(part.trim());
  }

  return output;
}

export function buildAiIncomingTextFromBatch(
  inboundMessages: PendingInboundMessage[],
  hasRecentPixInHistory: boolean,
) {
  const joinedText = dedupeBatchParts(inboundMessages.map((message) => message.content.trim())).join("\n");
  const hasPhoto = inboundMessages.some((message) => message.type === "IMAGE");
  const notes: string[] = [];

  if (hasPhoto && !hasRecentPixInHistory) {
    notes.push("[Cliente já enviou uma foto para restaurar]");
  }
  if (/essa foto|essa aqui|s[oó] essa|\bessa\b|quero que fique|sem mudar muito o rosto|sem mudar o rosto/i.test(joinedText)) {
    notes.push("[Cliente está falando de uma foto específica]");
  }
  if (/av[oó]|avó|avô|m[aã]e|pai|fam[ií]lia|falecid|saudade|lembran[cç]a/i.test(joinedText)) {
    notes.push("[Cliente mencionou uma lembrança familiar especial]");
  }
  if (/pre[cç]o|valor|quanto|custa|fica/i.test(joinedText)) {
    notes.push("[Cliente perguntou o preço]");
  }

  const parts = inboundMessages.flatMap((message) => {
    if (message.type === "IMAGE") {
      return [buildAiIncomingText(
        {
          phone: "",
          text: message.content,
          messageId: message.id,
          type: "IMAGE",
        },
        hasRecentPixInHistory,
      )];
    }

    return [message.content.trim()];
  });

  return dedupeBatchParts([...notes, ...parts]).join("\n");
}

async function getPendingInboundBatchState(args: {
  conversationId: string;
  leadId: string;
  currentInboundCreatedAt: Date;
}): Promise<PendingInboundBatchState> {

  const lastOutboundBeforeCurrent = await prisma.message.findFirst({
    where: {
      conversationId: args.conversationId,
      leadId: args.leadId,
      direction: "OUTBOUND",
      createdAt: { lte: args.currentInboundCreatedAt },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const pendingMessages = await prisma.message.findMany({
    where: {
      conversationId: args.conversationId,
      leadId: args.leadId,
      direction: "INBOUND",
      createdAt: {
        gt: lastOutboundBeforeCurrent?.createdAt ?? new Date(0),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
    },
  });

  const firstMessage = pendingMessages[0] ?? null;
  const latestMessage = pendingMessages.at(-1) ?? null;
  const hasMedia = pendingMessages.some((message) => message.type !== "TEXT");
  const silenceWindowMs =
    hasMedia || pendingMessages.length >= 2 ? BATCH_SILENCE_WINDOW_MS : TEXT_SILENCE_WINDOW_MS;
  const elapsedSinceFirstMs = firstMessage ? Date.now() - firstMessage.createdAt.getTime() : 0;
  const quietForMs = latestMessage ? Date.now() - latestMessage.createdAt.getTime() : 0;

  return {
    messages: pendingMessages as PendingInboundMessage[],
    firstMessage,
    latestMessage,
    hasMedia,
    silenceWindowMs,
    elapsedSinceFirstMs,
    quietForMs,
  };
}

async function isInboundRoundCurrent(args: {
  conversationId: string;
  leadId: string;
  expectedInboundMessageId: string;
}) {
  const latestInboundMessage = await prisma.message.findFirst({
    where: {
      conversationId: args.conversationId,
      leadId: args.leadId,
      direction: "INBOUND",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return latestInboundMessage?.id === args.expectedInboundMessageId;
}

async function waitForInboundSilence(args: {
  conversationId: string;
  leadId: string;
  currentInboundId: string;
  currentInboundCreatedAt: Date;
}) {
  while (true) {
    const batchState = await getPendingInboundBatchState({
      conversationId: args.conversationId,
      leadId: args.leadId,
      currentInboundCreatedAt: args.currentInboundCreatedAt,
    });

    if (!batchState.latestMessage) {
      return {
        skip: true,
        reason: "empty_batch",
        batchState,
      };
    }

    if (batchState.latestMessage.id !== args.currentInboundId) {
      return {
        skip: true,
        reason: "newer_message_in_same_batch",
        batchState,
      };
    }

    if (
      batchState.quietForMs >= batchState.silenceWindowMs ||
      batchState.elapsedSinceFirstMs >= MAX_BATCH_WAIT_MS
    ) {
      return {
        skip: false,
        reason: null,
        batchState,
      };
    }

    const remainingSilenceMs = batchState.silenceWindowMs - batchState.quietForMs;
    const remainingBatchMs = MAX_BATCH_WAIT_MS - batchState.elapsedSinceFirstMs;
    await sleep(Math.max(50, Math.min(remainingSilenceMs, remainingBatchMs, SILENCE_POLL_INTERVAL_MS)));
  };
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Autenticação do bridge ──────────────────────────────────
  // Se WEBHOOK_SECRET estiver definida, valida o header X-Webhook-Secret.
  // Sem a env var → modo legado (aceita qualquer request, compatível com
  // bridges antigos que ainda não enviam o header).
  if (WEBHOOK_SECRET) {
    const incomingSecret = request.headers.get("x-webhook-secret");
    if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
      // Retorna 401 para sinalizar falha de auth, mas não causar retry
      // infinito da Evolution (que ignora status != 200 silenciosamente).
      prisma.log.create({
        data: {
          type: "WEBHOOK_AUTH_FAILED",
          message: "Requisição rejeitada: X-Webhook-Secret inválido ou ausente",
          payload: {
            hasHeader: Boolean(incomingSecret),
            ip: request.headers.get("x-forwarded-for") ?? null,
          },
        },
      }).catch(() => {});
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

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
    // Evita processar a mesma mensagem duas vezes (retries do webhook).
    // Busca primeiro pela coluna indexada `whatsappMessageId` (O(1)); como
    // fallback, checa o path JSON em metadata para mensagens antigas gravadas
    // antes da coluna existir.
    if (incoming.messageId) {
      const alreadyProcessed = await prisma.message.findFirst({
        where: {
          direction: "INBOUND",
          OR: [
            { whatsappMessageId: incoming.messageId },
            { metadata: { path: ["key", "id"], equals: incoming.messageId } },
          ],
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
      whatsappMessageId: incoming.messageId,
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

    // ── Pausa global da IA ───────────────────────────────────
    // Operador pausou todas as respostas automáticas pelo dashboard.
    // Mensagens são salvas normalmente; só a resposta é suprimida.
    const globalSettings = await getSettings();
    if (globalSettings.aiPaused) {
      return NextResponse.json({ ok: true, aiSkipped: true, reason: "ai_globally_paused" });
    }

    // ── IA desativada para este lead ─────────────────────────
    if (!lead.aiEnabled || lead.humanTakeover) {
      return NextResponse.json({ ok: true, aiSkipped: true, reason: "ai_disabled_for_lead" });
    }

    const silenceResult = await waitForInboundSilence({
      conversationId: conversation.id,
      leadId: lead.id,
      currentInboundId: inboundMessage.id,
      currentInboundCreatedAt: inboundMessage.createdAt,
    });

    if (silenceResult.skip) {
      await prisma.log.create({
        data: {
          type: "WHATSAPP_MESSAGE_DEBOUNCED",
          message: "Resposta adiada para consolidar mensagens do mesmo lead",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            messageId: inboundMessage.id,
            batchSize: silenceResult.batchState.messages.length,
            latestBatchMessageId: silenceResult.batchState.latestMessage?.id ?? null,
            silenceWindowMs: silenceResult.batchState.silenceWindowMs,
            quietForMs: silenceResult.batchState.quietForMs,
            elapsedSinceFirstMs: silenceResult.batchState.elapsedSinceFirstMs,
            reason: silenceResult.reason,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        debounced: true,
        reason: silenceResult.reason,
      });
    }

    const recentHistory = await conversationService.getRecentHistory(conversation.id, 10);
    const batchedInboundMessages =
      silenceResult.batchState.messages.length > 0
        ? silenceResult.batchState.messages
        : [{
            id: inboundMessage.id,
            content: incoming.text,
            type: incoming.type,
            createdAt: inboundMessage.createdAt,
          } satisfies PendingInboundMessage];
    const batchHasPhoto = batchedInboundMessages.some((message) => message.type === "IMAGE");
    const batchedIncomingText = buildAiIncomingTextFromBatch(
      batchedInboundMessages,
      hasRecentPixContext({
        incomingText: incoming.text,
        recentHistory,
        hasPhoto: batchHasPhoto,
      }),
    );
    const isWaitingReceipt = detectIfWaitingPaymentReceipt(lead.summary);
    const hasRecentPixInHistory = hasRecentPixContext({
      incomingText: batchedIncomingText,
      recentHistory,
      hasPhoto: batchHasPhoto,
    });

    if (isWaitingReceipt && batchHasPhoto && !hasRecentPixInHistory) {
      await prisma.log.create({
        data: {
          type: "PAYMENT_RECEIPT_SKIPPED",
          message: "Imagem recebida com flag de comprovante, mas sem PIX recente no histórico",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            phone: lead.phone,
            summary: lead.summary,
          },
        },
      }).catch(() => {});
    }

    if (
      isWaitingReceipt &&
      hasRecentPixInHistory &&
      detectPaymentReceipt({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: batchHasPhoto,
      })
    ) {
      let receiptResult: {
        text: string;
        stage: string;
        analysis?: PixReceiptAnalysis | null;
        decision: string;
      };

      if (batchHasPhoto) {
        receiptResult = await handleReceiptImageMessage({
          incoming,
          lead: {
            id: lead.id,
            phone: lead.phone,
            summary: lead.summary,
          },
          conversationId: conversation.id,
          recentHistory,
          typingStartedAt,
        });
      } else {
        receiptResult = {
          text:
            "Recebi sim 😊 vou conferir aqui e, estando certinho, sigo por aqui com você.",
          stage: PAYMENT_STAGE_RECEIPT_SENT,
          analysis: null,
          decision: "text_receipt_fallback",
        };

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            funnelStage: "CHECKOUT",
            status: "NEGOTIATION",
            summary: updateConversationStage(lead.summary, PAYMENT_STAGE_RECEIPT_SENT),
          },
        });

        await createInternalPaymentAlert({
          leadId: lead.id,
          conversationId: conversation.id,
          phone: lead.phone,
          message: "Lead informou pagamento por texto. Conferir pagamento manualmente.",
          analysis: null,
          stage: PAYMENT_STAGE_RECEIPT_SENT,
          incomingType: batchHasPhoto ? "IMAGE" : incoming.type,
        });
      }

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: [receiptResult.text],
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        roundInboundMessageId: inboundMessage.id,
        metadata: {
          source: "payment_receipt",
          paymentStage: receiptResult.stage,
          receiptDecision: receiptResult.decision,
          receiptAnalysis: receiptResult.analysis,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    if (detectPaymentIntent({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto })) {
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
        roundInboundMessageId: inboundMessage.id,
        metadata: {
          source: "payment_intent",
          paymentStage: PAYMENT_STAGE_WAITING_RECEIPT,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    // ── Resposta da IA ───────────────────────────────────────
    const prompt = await promptService.getActivePrompt();
    const aiRecentHistory = recentHistory.slice(-6);
    const aiIncomingText = batchedIncomingText;

    const systemPrompt = promptService.composeSystemPrompt({
      prompt,
      lead,
      recentHistory: aiRecentHistory,
    });
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
        { role: "user", content: aiIncomingText },
      ],
      maxTokens: 220,
      safetyContext: {
        incomingText: aiIncomingText,
        recentHistory: aiRecentHistory,
        hasPhoto: batchHasPhoto,
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
      incomingText: aiIncomingText,
      recentHistory: aiRecentHistory,
      hasPhoto: batchHasPhoto,
    });
    const commercialDraft = ensureSalesCTA(safeResponse.output, {
      incomingText: aiIncomingText,
      recentHistory: aiRecentHistory,
      hasPhoto: batchHasPhoto,
    });
    const commercialResponse = normalizeCommercialResponse(commercialDraft, {
      incomingText: aiIncomingText,
      recentHistory: aiRecentHistory,
      hasPhoto: batchHasPhoto,
    });

    if (!(await isInboundRoundCurrent({
      conversationId: conversation.id,
      leadId: lead.id,
      expectedInboundMessageId: inboundMessage.id,
    }))) {
      await prisma.log.create({
        data: {
          type: "AI_RESPONSE_SKIPPED_STALE",
          message: "Resposta de IA descartada porque chegou mensagem mais nova durante o processamento",
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            messageId: inboundMessage.id,
          },
        },
      });

      return NextResponse.json({ ok: true, stale: true, reason: "newer_message_during_ai" });
    }

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

    // Serializa o payload de forma legível (String(payload) viraria "[object Object]"
    // e perderia todo o contexto do erro). JSON.stringify protege contra ciclos.
    let rawPayload: string;
    try {
      rawPayload = JSON.stringify(payload).slice(0, 1000);
    } catch {
      rawPayload = String(payload).slice(0, 1000);
    }

    // Log de erro sem bloquear o retorno
    prisma.log.create({
      data: {
        type: "WEBHOOK_ERROR",
        message,
        payload: {
          raw: rawPayload,
          stack: error instanceof Error ? error.stack?.slice(0, 1500) ?? null : null,
        },
      },
    }).catch(() => { /* silencioso */ });

    // Retornar 200 para não causar retry infinito da Evolution API
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
