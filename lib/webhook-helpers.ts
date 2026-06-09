/**
 * lib/webhook-helpers.ts
 *
 * Funções puras extraídas de app/api/webhooks/evolution/route.ts.
 * Nenhuma dessas funções chama Prisma ou serviços externos — são testáveis
 * sem mocking.
 *
 * Exportar funções/tipos diretamente de route.ts proibiria o build do
 * Next.js (route files só podem exportar handlers HTTP + config). Por isso
 * ficam aqui e route.ts importa delas.
 */

import { Prisma } from "@prisma/client";
import {
  PAYMENT_STAGE_WAITING_RECEIPT,
  PAYMENT_STAGE_RECEIPT_SENT,
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
  PAYMENT_STAGE_RECEIPT_INVALID,
} from "@/services/ai-safety.service";
import type { PixReceiptAnalysis } from "@/services/payment-receipt.service";

// ── Tipos públicos ──────────────────────────────────────────────

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

export type ReceiptPaymentStage =
  | typeof PAYMENT_STAGE_WAITING_RECEIPT
  | typeof PAYMENT_STAGE_RECEIPT_SENT
  | typeof PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW
  | typeof PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW
  | typeof PAYMENT_STAGE_RECEIPT_INVALID;

// ── Funções ─────────────────────────────────────────────────────

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

/** Decide o estágio do comprovante com base na análise de visão da IA */
export function receiptDecisionFromAnalysis(analysis: PixReceiptAnalysis): {
  stage: ReceiptPaymentStage;
  message: string;
  alert: string;
  kind: string;
} {
  if (analysis.isRandomImage || !analysis.looksLikePixReceipt) {
    return {
      stage: PAYMENT_STAGE_RECEIPT_INVALID,
      message:
        "Recebi a imagem, mas pra confirmar preciso do comprovante com valor, data e recebedor visíveis. Pode me reenviar assim?",
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
      stage: PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
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

/** Constrói o texto de entrada da IA para uma mensagem única */
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

/** Remove partes duplicadas ou vazias de um array de strings */
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

/** Constrói o texto consolidado de um batch de mensagens recebidas */
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
