export type WhatsAppMediaKind =
  | "TEXT"
  | "IMAGE"
  | "AUDIO"
  | "DOCUMENT"
  | "VIDEO"
  | "STICKER";

export const MEDIA_PLACEHOLDERS: Record<WhatsAppMediaKind, string> = {
  TEXT: "",
  IMAGE: "📷 Imagem anexada",
  AUDIO: "🎙️ Áudio anexado",
  DOCUMENT: "📎 Documento anexado",
  VIDEO: "🎥 Vídeo anexado",
  STICKER: "🏷️ Sticker anexado",
};

export function normalizeMediaKind(value: unknown): WhatsAppMediaKind {
  switch (String(value || "").toUpperCase()) {
    case "IMAGE":
      return "IMAGE";
    case "AUDIO":
      return "AUDIO";
    case "DOCUMENT":
      return "DOCUMENT";
    case "VIDEO":
      return "VIDEO";
    case "STICKER":
      return "STICKER";
    default:
      return "TEXT";
  }
}

export function getMediaPlaceholder(kind: WhatsAppMediaKind) {
  return MEDIA_PLACEHOLDERS[kind] || MEDIA_PLACEHOLDERS.TEXT;
}

export function isMediaKind(kind: WhatsAppMediaKind) {
  return kind !== "TEXT";
}

export function isServicePhotoMediaKind(kind: WhatsAppMediaKind) {
  return kind === "IMAGE";
}

export function isReceiptAttachmentMediaKind(kind: WhatsAppMediaKind) {
  return kind === "IMAGE" || kind === "DOCUMENT";
}

export function isVisualMediaKind(kind: WhatsAppMediaKind) {
  return kind === "IMAGE" || kind === "DOCUMENT" || kind === "VIDEO" || kind === "STICKER";
}

export function isGenericMediaPlaceholder(
  content: string | null | undefined,
  mediaKind: WhatsAppMediaKind,
) {
  const text = String(content || "").trim();
  if (!text) return false;
  return text === getMediaPlaceholder(mediaKind);
}

export function resolveMessagePreviewText(args: {
  content: string | null | undefined;
  mediaKind: WhatsAppMediaKind;
}) {
  const content = String(args.content || "").trim();
  if (!content) return getMediaPlaceholder(args.mediaKind);

  if (!isMediaKind(args.mediaKind)) return content;

  if (isGenericMediaPlaceholder(content, args.mediaKind)) {
    return getMediaPlaceholder(args.mediaKind);
  }

  return `${getMediaPlaceholder(args.mediaKind)} ${content}`;
}
