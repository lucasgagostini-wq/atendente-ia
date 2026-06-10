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
  getMediaPlaceholder,
  isMediaKind,
  isReceiptAttachmentMediaKind,
  isServicePhotoMediaKind,
  normalizeMediaKind,
  type WhatsAppMediaKind,
} from "@/lib/message-media";
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
  profileSlug?: string | null;
  text: string;
  messageId: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO";
  mediaKind: WhatsAppMediaKind;
  imageUrlOrBase64?: string | null;
  replyTransport?: "baileys_bridge" | "evolution";
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

export type OutgoingPayload = {
  phone: string;
  profileSlug?: string | null;
  text: string;
  messageId: string | null;
  type: "TEXT" | "IMAGE" | "AUDIO";
  mediaKind: WhatsAppMediaKind;
  imageUrlOrBase64?: string | null;
  senderName?: string;
  metadata?: Prisma.InputJsonValue;
};

export type PendingInboundMessage = {
  id: string;
  content: string;
  type: "TEXT" | "IMAGE" | "AUDIO";
  mediaKind?: WhatsAppMediaKind;
  metadata?: Prisma.JsonValue | null;
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
function extractMessageNode(payload: any) {
  return (
    payload?.data?.message ||
    payload?.data?.messages?.[0]?.message ||
    payload?.message ||
    payload?.messages?.[0]?.message
  );
}

function extractKeyNode(payload: any) {
  return (
    payload?.data?.key ||
    payload?.data?.messages?.[0]?.key ||
    payload?.key ||
    payload?.messages?.[0]?.key
  );
}

function extractRemoteJid(payload: any, keyNode: any) {
  return (
    keyNode?.remoteJid ||
    payload?.data?.sender ||
    payload?.sender ||
    payload?.from ||
    ""
  );
}

function extractMediaNode(payload: any) {
  return payload?.data?.media || payload?.media || null;
}

function extractMediaUrlOrBase64(payload: any, mediaNode: any) {
  return (
    mediaNode?.mediaBase64 ||
    mediaNode?.base64 ||
    mediaNode?.url ||
    payload?.data?.mediaBase64 ||
    payload?.data?.base64 ||
    payload?.data?.mediaUrl ||
    payload?.mediaBase64 ||
    payload?.base64 ||
    payload?.mediaUrl ||
    null
  );
}

function resolveMessageClassification(messageNode: any): {
  dbType: "TEXT" | "IMAGE" | "AUDIO";
  mediaKind: WhatsAppMediaKind;
  text: string;
} {
  const mediaKind = messageNode?.imageMessage
    ? "IMAGE"
    : messageNode?.audioMessage
      ? "AUDIO"
      : messageNode?.documentMessage
        ? "DOCUMENT"
        : messageNode?.videoMessage
          ? "VIDEO"
          : messageNode?.stickerMessage
            ? "STICKER"
            : "TEXT";

  const dbType =
    mediaKind === "AUDIO"
      ? "AUDIO"
      : mediaKind === "TEXT"
        ? "TEXT"
        : "IMAGE";

  const rawText =
    messageNode?.conversation ||
    messageNode?.extendedTextMessage?.text ||
    messageNode?.imageMessage?.caption ||
    messageNode?.documentMessage?.caption ||
    messageNode?.videoMessage?.caption ||
    messageNode?.audioMessage?.caption ||
    "";

  const text =
    typeof rawText === "string" && rawText.trim().length > 0
      ? rawText.trim()
      : mediaKind === "TEXT"
        ? ""
        : getMediaPlaceholder(mediaKind);

  return {
    dbType,
    mediaKind,
    text,
  };
}

function buildMetadata(args: {
  payload: any;
  keyNode: any;
  remoteJid: string;
  phone: string;
  mediaNode: any;
  mediaKind: WhatsAppMediaKind;
}) {
  return {
    event: args.payload?.event || args.payload?.data?.event || null,
    key: args.keyNode ?? null,
    remoteJid: args.remoteJid,
    resolvedPhone: args.phone,
    media: isMediaKind(args.mediaKind)
      ? {
          kind: args.mediaKind,
          mimetype: args.mediaNode?.mimetype ?? null,
          fileName: args.mediaNode?.fileName ?? args.mediaNode?.filename ?? null,
          sizeBytes: args.mediaNode?.sizeBytes ?? args.mediaNode?.fileLength ?? null,
          hasMediaBase64: Boolean(args.mediaNode?.mediaBase64 || args.mediaNode?.base64),
          hasMediaUrl: Boolean(args.mediaNode?.url),
          url: args.mediaNode?.url ?? null,
          storagePath: args.mediaNode?.storagePath ?? null,
          uploadFailed: Boolean(args.mediaNode?.uploadFailed),
          mediaDownloadError: args.mediaNode?.mediaDownloadError ?? null,
        }
      : null,
  } as Prisma.InputJsonValue;
}

function extractPayload(
  payload: any,
  options: { requireFromMe: boolean },
): (IncomingPayload | OutgoingPayload) | null {
  const messageNode =
    extractMessageNode(payload);
  const keyNode = extractKeyNode(payload);
  const remoteJid = extractRemoteJid(payload, keyNode);
  const payloadPhone =
    payload?.data?.phone ||
    payload?.phone ||
    payload?.data?.number ||
    payload?.number ||
    "";
  const mediaNode = extractMediaNode(payload);
  const imageUrlOrBase64 = extractMediaUrlOrBase64(payload, mediaNode);

  // Ignorar se não tem remetente
  if (!remoteJid) return null;

  const isFromMe = Boolean(keyNode?.fromMe);
  if (options.requireFromMe ? !isFromMe : isFromMe) return null;

  // Ignorar mensagens de grupos
  if (remoteJid.endsWith("@g.us")) return null;

  const classification = resolveMessageClassification(messageNode);
  const text = classification.text;
  if (!text) return null;

  const phone = normalizePhone(payloadPhone || remoteJid);
  if (!phone) return null;

  return {
    phone,
    profileSlug:
      typeof payload?.data?.profileSlug === "string"
        ? payload.data.profileSlug
        : typeof payload?.profileSlug === "string"
          ? payload.profileSlug
          : null,
    text,
    messageId: keyNode?.id ?? null,
    type: classification.dbType,
    mediaKind: classification.mediaKind,
    imageUrlOrBase64: typeof imageUrlOrBase64 === "string" ? imageUrlOrBase64 : null,
    replyTransport:
      payload?.data?.replyTransport === "baileys_bridge"
        ? "baileys_bridge"
        : "evolution",
    senderName: payload?.data?.pushName || payload?.pushName || undefined,
    metadata: buildMetadata({
      payload,
      keyNode,
      remoteJid,
      phone,
      mediaNode,
      mediaKind: classification.mediaKind,
    }),
  };
}

export function extractIncomingPayload(payload: any): IncomingPayload | null {
  return extractPayload(payload, { requireFromMe: false }) as IncomingPayload | null;
}

export function extractOutgoingPayload(payload: any): OutgoingPayload | null {
  return extractPayload(payload, { requireFromMe: true }) as OutgoingPayload | null;
}

// ── Batching de mídia (Caso B) ──────────────────────────────────
// O bridge emite MEDIA_PENDING antes de baixar a imagem. Enquanto o sinal
// estiver "ativo", o webhook do texto do mesmo burst segura a janela de silêncio
// para a imagem entrar no MESMO batch.
export const MEDIA_PENDING_TTL_MS = 15000;

/** Verdadeiro se há um sinal MEDIA_PENDING recente (dentro do TTL). */
export function isMediaPendingActive(
  pendingMediaAt?: Date | null,
  now: number = Date.now(),
) {
  if (!pendingMediaAt) return false;
  return now - pendingMediaAt.getTime() < MEDIA_PENDING_TTL_MS;
}

/**
 * Decide se o webhook deve continuar esperando por uma imagem a caminho antes de
 * fechar o batch: há sinal MEDIA_PENDING ativo, a mídia ainda não chegou ao
 * batch, e ainda não estouramos o teto de espera.
 */
export function shouldWaitForIncomingMedia(args: {
  pendingMediaAt?: Date | null;
  batchHasMedia: boolean;
  elapsedSinceFirstMs: number;
  maxBatchWaitMs: number;
  now?: number;
}) {
  return (
    isMediaPendingActive(args.pendingMediaAt, args.now ?? Date.now()) &&
    !args.batchHasMedia &&
    args.elapsedSinceFirstMs < args.maxBatchWaitMs
  );
}

// Marcador de áudio sem transcrição (injetado em extractIncomingPayload).
export const AUDIO_PLACEHOLDER_PATTERN = /^🎙️ áudio anexado|^cliente enviou um [aá]udio\.?$/i;

/**
 * Verdadeiro quando o batch é composto SÓ de áudios e nenhum deles tem
 * legenda/transcrição real (todos caem no texto-marcador). Nesse caso o webhook
 * pede confirmação por escrito em vez de deixar o modelo inventar o conteúdo.
 */
export function isAudioOnlyBatchWithoutTranscription(messages: PendingInboundMessage[]): boolean {
  if (messages.length === 0) return false;
  if (!messages.every((message) => message.mediaKind === "AUDIO" || message.type === "AUDIO")) return false;
  return messages.every((message) => AUDIO_PLACEHOLDER_PATTERN.test(message.content.trim()));
}

export function getPendingMessageMediaKind(message: PendingInboundMessage): WhatsAppMediaKind {
  const metadataMedia = (message.metadata as { media?: { kind?: unknown } } | null | undefined)?.media;
  if (metadataMedia?.kind) return normalizeMediaKind(metadataMedia.kind);
  if (message.type === "AUDIO") return "AUDIO";
  if (message.type === "IMAGE") return "IMAGE";
  return "TEXT";
}

export function isPendingMessageServicePhoto(message: PendingInboundMessage) {
  return isServicePhotoMediaKind(getPendingMessageMediaKind(message));
}

export function isPendingMessageReceiptAttachment(message: PendingInboundMessage) {
  return isReceiptAttachmentMediaKind(getPendingMessageMediaKind(message));
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
  if (analysis.fallbackUsed && analysis.fallbackMode === "invalid_reupload") {
    return {
      stage: PAYMENT_STAGE_RECEIPT_INVALID,
      message:
        "Recebi a imagem, mas pra confirmar preciso do comprovante com valor, data e recebedor visíveis. Pode me reenviar assim?",
      alert: "Analise visual indisponivel para validar o comprovante. Solicitar reenvio visivel.",
      kind: "vision_unavailable_reupload",
    };
  }

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
  const hasPhoto = inboundMessages.some((message) => isPendingMessageServicePhoto(message));
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
    if (isPendingMessageServicePhoto(message)) {
      return [buildAiIncomingText(
        {
          phone: "",
          text: message.content,
          messageId: message.id,
          type: "IMAGE",
          mediaKind: "IMAGE",
        },
        hasRecentPixInHistory,
      )];
    }

    return [message.content.trim()];
  });

  return dedupeBatchParts([...notes, ...parts]).join("\n");
}
