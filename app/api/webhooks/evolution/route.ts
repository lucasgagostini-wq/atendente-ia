/**
 * webhooks/evolution/route.ts
 *
 * Processa mensagens recebidas da Evolution API (ou Baileys bridge).
 * Fluxo: receber → deduplicar → upsert lead → salvar mensagem → responder com IA
 */

export const maxDuration = 30;

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { getSettings } from "@/lib/settings-cache";
import { leadService } from "@/services/lead.service";
import { openRouterService } from "@/services/openrouter.service";
import { paymentReceiptService } from "@/services/payment-receipt.service";
import type { PixReceiptAnalysis } from "@/services/payment-receipt.service";
import { promptService } from "@/services/prompt.service";
import {
  buildAiIncomingTextFromBatch,
  dedupeBatchParts,
  extractOutgoingPayload,
  extractIncomingPayload,
  isPendingMessageReceiptAttachment,
  isPendingMessageServicePhoto,
  isAudioOnlyBatchWithoutTranscription,
  normalizePhone,
  receiptDecisionFromAnalysis,
  shouldTransferToHuman,
  type IncomingPayload,
  type PendingInboundMessage,
  type ReceiptPaymentStage,
} from "@/lib/webhook-helpers";
import {
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
  PAYMENT_STAGE_WAITING_RECEIPT,
  buildAudioClarificationResponse,
  buildInvalidReceiptResponse,
  buildExpectedPaymentData,
  buildPostReceiptResponse,
  conversationHasServiceImage,
  detectPaymentIntent,
  detectPaymentReceipt,
  detectIfPaymentReceiptInvalid,
  detectIfPaymentReceiptReceived,
  detectIfWaitingPaymentReceipt,
  detectServiceType,
  ensureSalesCTA,
  hasRecentPixContext,
  markServiceImageReceived,
  normalizeCommercialResponse,
  safeFallbackForStage,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
  summaryHasServiceImage,
  updateConversationStage,
  validatePromptMaster,
} from "@/services/ai-safety.service";
import { buildAiDebugSnapshot, emitAiDebug } from "@/lib/ai-debug";
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

// ── Tipos internos ─────────────────────────────────────────────
// IncomingPayload, PendingInboundMessage e ReceiptPaymentStage estão em
// lib/webhook-helpers.ts (exportados para testes). Os tipos abaixo são
// exclusivos desta rota.

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

// ── Helpers internos (DB/IO-dependentes) ───────────────────────
// As funções puras foram movidas para lib/webhook-helpers.ts.

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
      metadata: true,
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
    const outgoing = extractOutgoingPayload(payload);

    if (outgoing) {
      if (outgoing.messageId) {
        const alreadySaved = await prisma.message.findFirst({
          where: {
            OR: [
              { whatsappMessageId: outgoing.messageId },
              { metadata: { path: ["key", "id"], equals: outgoing.messageId } },
            ],
          },
          select: { id: true },
        });

        if (alreadySaved) {
          return NextResponse.json({ ok: true, ignored: true, reason: "duplicate_outbound" });
        }
      }

      const lead = await leadService.upsertByPhone(outgoing.phone, {
        source: "whatsapp",
      });
      const conversation = await conversationService.getOrCreateOpenConversation(lead.id);

      await conversationService.saveMessage({
        conversationId: conversation.id,
        leadId: lead.id,
        direction: "OUTBOUND",
        role: "HUMAN",
        type: outgoing.type,
        content: outgoing.text,
        whatsappMessageId: outgoing.messageId,
        metadata: outgoing.metadata,
      });

      await leadService.setAiState(lead.id, false).catch(() => {});

      await prisma.log.create({
        data: {
          type: "WHATSAPP_MANUAL_MESSAGE_SYNCED",
          message: `Mensagem manual sincronizada de ${outgoing.phone}`,
          payload: {
            leadId: lead.id,
            conversationId: conversation.id,
            phone: outgoing.phone,
            mediaKind: outgoing.mediaKind,
            messageId: outgoing.messageId,
          },
        },
      }).catch(() => {});

      return NextResponse.json({ ok: true, manualMessageSynced: true });
    }

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
            mediaKind: incoming.mediaKind,
            metadata: incoming.metadata as Prisma.JsonValue,
            createdAt: inboundMessage.createdAt,
          } satisfies PendingInboundMessage];
    const batchHasReceiptAttachment = batchedInboundMessages.some((message) =>
      isPendingMessageReceiptAttachment(message),
    );
    const batchHasPhoto = batchedInboundMessages.some((message) =>
      isPendingMessageServicePhoto(message),
    );
    const batchedIncomingText = buildAiIncomingTextFromBatch(
      batchedInboundMessages,
      hasRecentPixContext({
        incomingText: incoming.text,
        recentHistory,
        hasPhoto: batchHasReceiptAttachment,
      }),
    );
    const isWaitingReceipt = detectIfWaitingPaymentReceipt(lead.summary);
    const isReceiptReceived = detectIfPaymentReceiptReceived(lead.summary);
    const isReceiptInvalid = detectIfPaymentReceiptInvalid(lead.summary);
    const hasRecentPixInHistory = hasRecentPixContext({
      incomingText: batchedIncomingText,
      recentHistory,
      hasPhoto: batchHasReceiptAttachment,
    });

    // Estado persistente: a foto pode ter chegado em rodadas anteriores e saído
    // da janela curta de histórico. Considera burst + marca no summary + histórico.
    const conversationHasPhoto = conversationHasServiceImage({
      recentHistory,
      summary: lead.summary,
      hasPhoto: batchHasPhoto,
    });

    // Persiste a marca de "foto recebida" cedo, antes de qualquer gate.
    // Assim, mesmo se o batch cair em Pix determinístico ou outra rota, o lead
    // nunca volta a ser tratado como se não tivesse enviado foto.
    if (batchHasPhoto && !hasRecentPixInHistory && !summaryHasServiceImage(lead.summary)) {
      const updatedSummary = markServiceImageReceived(lead.summary);
      lead.summary = updatedSummary;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { summary: updatedSummary },
      }).catch(() => {});
    }

    const aiDebugFlags = {
      hasServiceImage: conversationHasPhoto,
      askedForPix: detectPaymentIntent({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: batchHasReceiptAttachment,
      }),
      pixAlreadySent: hasRecentPixInHistory,
      awaitingReceipt: isWaitingReceipt,
      isReceiptCandidate: detectPaymentReceipt({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: batchHasReceiptAttachment,
      }),
      serviceType: detectServiceType({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: batchHasPhoto,
      }),
    };

    if (isWaitingReceipt && batchHasReceiptAttachment && !hasRecentPixInHistory) {
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

    if (isReceiptReceived) {
      const postReceiptResponse = buildPostReceiptResponse({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: conversationHasPhoto,
        summary: lead.summary,
      });
      const postReceiptMessages = splitResponseIntoWhatsAppMessages(postReceiptResponse);

      emitAiDebug(
        buildAiDebugSnapshot({
          leadId: lead.id,
          phone: lead.phone,
          funnelStageBefore: lead.funnelStage,
          funnelStageAfter: "CHECKOUT",
          batchSize: batchedInboundMessages.length,
          flags: aiDebugFlags,
          consolidatedText: batchedIncomingText,
          rawResponse: null,
          finalResponse: postReceiptResponse,
          route: "payment_receipt:post_receipt_state",
        }),
        prisma,
      );

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: postReceiptMessages,
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        roundInboundMessageId: inboundMessage.id,
        metadata: {
          source: "post_receipt_state",
          paymentStage: lead.summary,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    if (isReceiptInvalid && !batchHasPhoto) {
      const invalidReceiptResponse = buildInvalidReceiptResponse({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: conversationHasPhoto,
        summary: lead.summary,
      });
      const invalidReceiptMessages = splitResponseIntoWhatsAppMessages(invalidReceiptResponse);

      emitAiDebug(
        buildAiDebugSnapshot({
          leadId: lead.id,
          phone: lead.phone,
          funnelStageBefore: lead.funnelStage,
          funnelStageAfter: "CHECKOUT",
          batchSize: batchedInboundMessages.length,
          flags: aiDebugFlags,
          consolidatedText: batchedIncomingText,
          rawResponse: null,
          finalResponse: invalidReceiptResponse,
          route: "payment_receipt:invalid_receipt_state",
        }),
        prisma,
      );

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: invalidReceiptMessages,
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        roundInboundMessageId: inboundMessage.id,
        metadata: {
          source: "invalid_receipt_state",
          paymentStage: lead.summary,
        } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    if (
      (isWaitingReceipt || isReceiptInvalid) &&
      (hasRecentPixInHistory || isReceiptInvalid) &&
      (detectPaymentReceipt({
        incomingText: batchedIncomingText,
        recentHistory,
        hasPhoto: batchHasReceiptAttachment,
      }) || (isReceiptInvalid && batchHasReceiptAttachment))
    ) {
      let receiptResult: {
        text: string;
        stage: string;
        analysis?: PixReceiptAnalysis | null;
        decision: string;
      };

      if (batchHasReceiptAttachment) {
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
          stage: PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
          analysis: null,
          decision: "text_receipt_fallback",
        };

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            funnelStage: "CHECKOUT",
            status: "NEGOTIATION",
            summary: updateConversationStage(lead.summary, PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW),
          },
        });

        await createInternalPaymentAlert({
          leadId: lead.id,
          conversationId: conversation.id,
          phone: lead.phone,
          message: "Lead informou pagamento por texto. Conferir pagamento manualmente.",
          analysis: null,
          stage: receiptResult.stage,
          incomingType: batchHasReceiptAttachment ? "IMAGE" : incoming.type,
        });
      }

      emitAiDebug(
        buildAiDebugSnapshot({
          leadId: lead.id,
          phone: lead.phone,
          funnelStageBefore: lead.funnelStage,
          funnelStageAfter: "CHECKOUT",
          batchSize: batchedInboundMessages.length,
          flags: aiDebugFlags,
          consolidatedText: batchedIncomingText,
          rawResponse: null,
          finalResponse: receiptResult.text,
          route: `payment_receipt:${receiptResult.decision}`,
        }),
        prisma,
      );

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

    if (detectPaymentIntent({
      incomingText: batchedIncomingText,
      recentHistory,
      hasPhoto: batchHasPhoto,
    })) {
      const paymentMessages = sendPixAsSeparateMessage();

      emitAiDebug(
        buildAiDebugSnapshot({
          leadId: lead.id,
          phone: lead.phone,
          funnelStageBefore: lead.funnelStage,
          funnelStageAfter: "CHECKOUT",
          batchSize: batchedInboundMessages.length,
          flags: aiDebugFlags,
          consolidatedText: batchedIncomingText,
          rawResponse: null,
          finalResponse: paymentMessages.join("\n"),
          route: "payment_intent",
        }),
        prisma,
      );

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

    // ── Áudio sem transcrição ────────────────────────────────
    // Não há serviço de transcrição: se chegou só áudio, NÃO deixar o modelo
    // inventar o conteúdo. Pede confirmação por escrito e encerra a rodada.
    if (isAudioOnlyBatchWithoutTranscription(batchedInboundMessages)) {
      const audioMessage = buildAudioClarificationResponse();

      emitAiDebug(
        buildAiDebugSnapshot({
          leadId: lead.id,
          phone: lead.phone,
          funnelStageBefore: lead.funnelStage,
          funnelStageAfter: lead.funnelStage,
          batchSize: batchedInboundMessages.length,
          flags: aiDebugFlags,
          consolidatedText: batchedIncomingText,
          rawResponse: null,
          finalResponse: audioMessage,
          route: "audio_clarification",
        }),
        prisma,
      );

      const payload = await saveAndSendMessages({
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone,
        messages: [audioMessage],
        replyTransport: incoming.replyTransport,
        typingStartedAt,
        roundInboundMessageId: inboundMessage.id,
        metadata: { source: "audio_clarification" } as Prisma.InputJsonValue,
      });

      return NextResponse.json(payload);
    }

    // ── Resposta da IA ───────────────────────────────────────
    const prompt = await promptService.getActivePrompt();
    const aiRecentHistory = recentHistory.slice(-6);
    const aiIncomingText = batchedIncomingText;

    // Persiste a marca de "foto recebida" para que as próximas rodadas nunca
    // peçam a foto de novo, mesmo que ela saia da janela de histórico.
    if (batchHasPhoto && !hasRecentPixInHistory && !summaryHasServiceImage(lead.summary)) {
      const updatedSummary = markServiceImageReceived(lead.summary);
      lead.summary = updatedSummary;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { summary: updatedSummary },
      }).catch(() => {});
    }

    // Contexto único de segurança/guardrails — usa o estado consolidado de foto
    // (burst + summary + histórico), não só o burst atual.
    const aiSafetyContext = {
      incomingText: aiIncomingText,
      recentHistory: aiRecentHistory,
      hasPhoto: conversationHasPhoto,
      summary: lead.summary,
    };

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
      safetyContext: aiSafetyContext,
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

    const safeResponse = sanitizeAIResponse(aiResponse.output, aiSafetyContext);
    const commercialDraft = ensureSalesCTA(safeResponse.output, aiSafetyContext);
    const commercialResponse = normalizeCommercialResponse(commercialDraft, aiSafetyContext);

    emitAiDebug(
      buildAiDebugSnapshot({
        leadId: lead.id,
        phone: lead.phone,
        funnelStageBefore: lead.funnelStage,
        funnelStageAfter: lead.funnelStage,
        batchSize: batchedInboundMessages.length,
        flags: aiDebugFlags,
        consolidatedText: aiIncomingText,
        rawResponse: aiResponse.output,
        finalResponse: commercialResponse,
        route: "ai_response",
      }),
      prisma,
    );

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
