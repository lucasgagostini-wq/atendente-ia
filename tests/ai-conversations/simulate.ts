/**
 * tests/ai-conversations/simulate.ts
 *
 * Replica, com funções PURAS, a árvore de decisão de
 * app/api/webhooks/evolution/route.ts — sem Prisma, sem OpenRouter, sem WhatsApp.
 *
 * Permite testar: consolidação de batch, gates de pagamento/comprovante,
 * persistência de estado de foto e o pipeline de guardrails — exatamente na
 * mesma ordem do webhook real.
 *
 * O que NÃO é simulado: vision AI (a análise do comprovante é injetada pelo
 * fixture via mockReceiptAnalysis) e o texto criativo do modelo (injetado via
 * mockModelResponse). O foco é a ORQUESTRAÇÃO e os GUARDRAILS determinísticos.
 */

import {
  buildAiIncomingTextFromBatch,
  isAudioOnlyBatchWithoutTranscription,
  receiptDecisionFromAnalysis,
  type PendingInboundMessage,
} from "../../lib/webhook-helpers";
import type { PixReceiptAnalysis } from "../../services/payment-receipt.service";
import {
  buildAudioClarificationResponse,
  conversationHasServiceImage,
  detectIfWaitingPaymentReceipt,
  detectIfPaymentReceiptInvalid,
  detectIfPaymentReceiptReceived,
  detectPaymentIntent,
  detectPaymentReceipt,
  detectServiceType,
  buildInvalidReceiptResponse,
  buildPostReceiptResponse,
  ensureSalesCTA,
  hasRecentPixContext,
  normalizeCommercialResponse,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
} from "../../services/ai-safety.service";

export type SimMessage = { content: string; type?: "TEXT" | "IMAGE" | "AUDIO" };

export type ConversationState = {
  recentHistory: string[];
  summary?: string | null;
  batch: SimMessage[];
  mockModelResponse?: string;
  mockReceiptAnalysis?: Partial<PixReceiptAnalysis>;
};

export type SimRoute =
  | "payment_receipt"
  | "payment_intent"
  | "ai_response"
  | "post_receipt_state"
  | "invalid_receipt_state"
  | "audio_clarification";

export type SimResult = {
  route: SimRoute;
  messages: string[];
  finalText: string;
  flags: {
    hasServiceImage: boolean;
    askedForPix: boolean;
    pixAlreadySent: boolean;
    awaitingReceipt: boolean;
    isReceiptCandidate: boolean;
    receiptReceived: boolean;
    receiptInvalid: boolean;
    serviceType: "simple_edit" | "restoration" | "unknown";
    batchHasPhoto: boolean;
  };
};

const COHERENT_ANALYSIS: PixReceiptAnalysis = {
  looksLikePixReceipt: true,
  isRandomImage: false,
  recipientNameFound: "Lucas Agostini",
  pixKeyFound: "estudiofotos000@gmail.com",
  bankFound: "Nubank",
  amountFound: "10.00",
  dateFound: "2026-06-08",
  timeFound: "14:30",
  matchesRecipient: true,
  matchesPixKey: true,
  matchesBank: true,
  matchesAmount: true,
  timeLooksValid: true,
  suspiciousOrUnclear: false,
  reason: "Comprovante coerente",
  confidence: "high",
};

function buildAnalysis(overrides?: Partial<PixReceiptAnalysis>): PixReceiptAnalysis {
  return { ...COHERENT_ANALYSIS, ...overrides };
}

export function simulateConversation(state: ConversationState): SimResult {
  const recentHistory = state.recentHistory ?? [];
  const summary = state.summary ?? null;

  const batch: PendingInboundMessage[] = state.batch.map((message, index) => ({
    id: `m${index}`,
    content: message.content,
    type: message.type ?? "TEXT",
    createdAt: new Date(Date.now() + index),
  }));

  const batchHasPhoto = batch.some((message) => message.type === "IMAGE");
  const pixInHistory = hasRecentPixContext({ recentHistory });

  const batchedIncomingText = buildAiIncomingTextFromBatch(batch, pixInHistory);
  const isWaitingReceipt = detectIfWaitingPaymentReceipt(summary);
  const isReceiptReceived = detectIfPaymentReceiptReceived(summary);
  const isReceiptInvalid = detectIfPaymentReceiptInvalid(summary);

  const conversationHasPhoto = conversationHasServiceImage({
    recentHistory,
    summary,
    hasPhoto: batchHasPhoto,
  });

  const flags = {
    hasServiceImage: conversationHasPhoto,
    askedForPix: detectPaymentIntent({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto }),
    pixAlreadySent: pixInHistory,
    awaitingReceipt: isWaitingReceipt,
    receiptReceived: isReceiptReceived,
    receiptInvalid: isReceiptInvalid,
    isReceiptCandidate: detectPaymentReceipt({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto }),
    serviceType: detectServiceType({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto }),
    batchHasPhoto,
  };

  // ── Gate 0: estado persistente pós-comprovante ───────────────
  if (isReceiptReceived) {
    const text = buildPostReceiptResponse({
      incomingText: batchedIncomingText,
      recentHistory,
      hasPhoto: conversationHasPhoto,
      summary,
    });
    const messages = splitResponseIntoWhatsAppMessages(text);
    return { route: "post_receipt_state", messages, finalText: messages.join("\n"), flags };
  }

  if (isReceiptInvalid && !batchHasPhoto) {
    const text = buildInvalidReceiptResponse({
      incomingText: batchedIncomingText,
      recentHistory,
      hasPhoto: conversationHasPhoto,
      summary,
    });
    const messages = splitResponseIntoWhatsAppMessages(text);
    return { route: "invalid_receipt_state", messages, finalText: messages.join("\n"), flags };
  }

  // ── Gate 1: comprovante ──────────────────────────────────────
  if (
    (isWaitingReceipt || isReceiptInvalid) &&
    (pixInHistory || isReceiptInvalid) &&
    (
      detectPaymentReceipt({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto }) ||
      (isReceiptInvalid && batchHasPhoto)
    )
  ) {
    let message: string;
    if (batchHasPhoto) {
      const decision = receiptDecisionFromAnalysis(buildAnalysis(state.mockReceiptAnalysis));
      message = decision.message;
    } else {
      message = "Recebi sim 😊 vou conferir aqui e, estando certinho, sigo por aqui com você.";
    }
    return { route: "payment_receipt", messages: [message], finalText: message, flags };
  }

  // ── Gate 2: intenção de pagamento (Pix determinístico) ──────
  if (detectPaymentIntent({ incomingText: batchedIncomingText, recentHistory, hasPhoto: batchHasPhoto })) {
    const messages = sendPixAsSeparateMessage();
    return { route: "payment_intent", messages, finalText: messages.join("\n"), flags };
  }

  // ── Gate 2.5: áudio sem transcrição ─────────────────────────
  if (isAudioOnlyBatchWithoutTranscription(batch)) {
    const message = buildAudioClarificationResponse();
    return { route: "audio_clarification", messages: [message], finalText: message, flags };
  }

  // ── Gate 3: resposta da IA + guardrails ─────────────────────
  const aiRecentHistory = recentHistory.slice(-6);
  const aiSafetyContext = {
    incomingText: batchedIncomingText,
    recentHistory: aiRecentHistory,
    hasPhoto: conversationHasPhoto,
    summary,
  };

  const safe = sanitizeAIResponse(state.mockModelResponse ?? "", aiSafetyContext);
  const withCta = ensureSalesCTA(safe.output, aiSafetyContext);
  const commercial = normalizeCommercialResponse(withCta, aiSafetyContext);
  const messages = splitResponseIntoWhatsAppMessages(commercial);

  return {
    route: "ai_response",
    messages,
    finalText: messages.join("\n"),
    flags,
  };
}
