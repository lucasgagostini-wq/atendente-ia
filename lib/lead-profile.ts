import { FunnelStage, LeadStatus, OperationStage } from "@prisma/client";
import { MUSIC_PROFILE_SLUG } from "@/lib/profile-defaults";

export const MUSIC_OFFER_TAG = {
  name: "Música Personalizada",
  color: "#F59E0B",
} as const;

export const MUSIC_OPERATION_STAGE_ORDER: OperationStage[] = [
  "PAID_ORDER",
  "PRODUCTION",
  "READY_TO_SEND",
  "SENT",
  "PIX_RECOVERY",
  "SUPPORT",
];

export const MUSIC_OPERATION_STAGE_LABELS: Record<OperationStage, string> = {
  PAID_ORDER: "Pedido pago",
  PRODUCTION: "Produção",
  READY_TO_SEND: "Pronto para enviar",
  SENT: "Enviado",
  PIX_RECOVERY: "Recuperação de Pix",
  SUPPORT: "Suporte",
};

export function isMusicProfileSlug(profileSlug?: string | null) {
  return profileSlug === MUSIC_PROFILE_SLUG;
}

function normalizeCandidate(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function formatLeadPhoneFallback(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return digits || "Contato sem nome";
}

export function resolveLeadName(
  candidates: Array<unknown>,
  phone: string,
) {
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) return normalized;
  }

  return formatLeadPhoneFallback(phone);
}

export function getOperationalDefaultsForProfile(profileSlug?: string | null): {
  status?: LeadStatus;
  funnelStage?: FunnelStage;
  operationStage?: OperationStage;
  aiEnabled?: boolean;
  humanTakeover?: boolean;
} {
  if (isMusicProfileSlug(profileSlug)) {
    return {
      status: "CONVERTED",
      funnelStage: "CUSTOMER",
      operationStage: "PAID_ORDER",
      aiEnabled: false,
      humanTakeover: true,
    };
  }

  return {};
}
