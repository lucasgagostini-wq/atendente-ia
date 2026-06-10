/**
 * lib/ai-debug.ts
 *
 * Diagnóstico seguro do fluxo de IA. Quando AI_DEBUG=true, o webhook emite um
 * snapshot do estado da conversa ANTES e DEPOIS dos guardrails — para responder
 * "por que a IA respondeu isso?" sem precisar reproduzir no WhatsApp real.
 *
 * REGRA DE OURO: nunca logar segredos. Sem chave OpenRouter, sem token, sem
 * DATABASE_URL, sem base64 de imagem. Telefone sempre mascarado, leadId encurtado.
 *
 * Todas as funções são puras (exceto emitAiDebug, que escreve no console/Prisma)
 * para serem testáveis em tests/ai-conversations.
 */

export type AiDebugFlags = {
  hasServiceImage: boolean;
  askedForPix: boolean;
  pixAlreadySent: boolean;
  awaitingReceipt: boolean;
  isReceiptCandidate: boolean;
  serviceType: "simple_edit" | "restoration" | "unknown";
};

export type AiDebugSnapshot = {
  leadIdMasked: string;
  phoneMasked: string;
  profileSlug: string | null;
  funnelStageBefore: string | null;
  funnelStageAfter: string | null;
  batchSize: number;
  /** Tipos das partes do batch atual: ["TEXT","IMAGE",...] — sem conteúdo bruto. */
  batchParts: string[];
  /** Havia imagem no batch atual? (derivado de batchParts) */
  batchHasImage: boolean;
  /** O lead já tinha foto recebida ANTES deste batch (coluna persistente)? */
  hadImageBefore: boolean;
  flags: AiDebugFlags;
  consolidatedText: string;
  /** Histórico enviado ao modelo (redigido, sem base64/secrets). */
  recentHistory: string[];
  /** Prompt de sistema usado (redigido e truncado). */
  promptUsed: string | null;
  rawResponse: string | null;
  finalResponse: string | null;
  /** Motivo de bloqueio/sanitização, se houve. */
  blockReason: string | null;
  route: string;
};

export function isAiDebugEnabled() {
  return process.env.AI_DEBUG === "true";
}

/** Mascara telefone preservando só os 2 primeiros e 2 últimos dígitos. */
export function maskPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "***";
  if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
  return `${digits.slice(0, 2)}${"*".repeat(Math.max(2, digits.length - 4))}${digits.slice(-2)}`;
}

/** Encurta um id (uuid/cuid) para os 8 primeiros caracteres. */
export function maskId(id?: string | null) {
  const value = String(id ?? "");
  if (!value) return "***";
  return `${value.slice(0, 8)}…`;
}

/**
 * Remove conteúdo sensível de qualquer string antes de logar:
 * - data URIs / base64 longos (imagens)
 * - chaves OpenRouter (sk-or-...)
 * - tokens Bearer / strings tipo segredo longas
 * - URLs de conexão de banco
 */
export function redactText(text?: string | null, maxLength = 600) {
  if (!text) return "";
  let safe = String(text)
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, "[base64-image]")
    .replace(/\b[A-Za-z0-9+/]{120,}={0,2}\b/g, "[base64-omitido]")
    .replace(/sk-or-[A-Za-z0-9-]+/gi, "[openrouter-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]");

  if (safe.length > maxLength) {
    safe = `${safe.slice(0, maxLength)}… (+${safe.length - maxLength} chars)`;
  }
  return safe;
}

/** Monta o snapshot de diagnóstico (puro, sem IO). */
export function buildAiDebugSnapshot(input: {
  leadId: string;
  phone: string;
  profileSlug?: string | null;
  funnelStageBefore?: string | null;
  funnelStageAfter?: string | null;
  batchSize: number;
  batchParts?: string[];
  hadImageBefore?: boolean;
  flags: AiDebugFlags;
  consolidatedText: string;
  recentHistory?: string[];
  promptUsed?: string | null;
  rawResponse?: string | null;
  finalResponse?: string | null;
  blockReason?: string | null;
  route: string;
}): AiDebugSnapshot {
  const batchParts = input.batchParts ?? [];
  return {
    leadIdMasked: maskId(input.leadId),
    phoneMasked: maskPhone(input.phone),
    profileSlug: input.profileSlug ?? null,
    funnelStageBefore: input.funnelStageBefore ?? null,
    funnelStageAfter: input.funnelStageAfter ?? null,
    batchSize: input.batchSize,
    batchParts,
    batchHasImage: batchParts.includes("IMAGE"),
    hadImageBefore: Boolean(input.hadImageBefore),
    flags: input.flags,
    consolidatedText: redactText(input.consolidatedText),
    // Cada linha do histórico é redigida (remove base64/keys/db-url) e truncada.
    recentHistory: (input.recentHistory ?? []).map((line) => redactText(line, 200)),
    promptUsed: input.promptUsed != null ? redactText(input.promptUsed, 800) : null,
    rawResponse: input.rawResponse != null ? redactText(input.rawResponse) : null,
    finalResponse: input.finalResponse != null ? redactText(input.finalResponse) : null,
    blockReason: input.blockReason ?? null,
    route: input.route,
  };
}

// Tipagem mínima e permissiva do escritor de logs. Usa `args: any` de propósito
// para aceitar o PrismaClient real sem acoplar este util a @prisma/client.
type PrismaLogWriter = {
  log: { create: (args: any) => { catch: (handler: () => void) => unknown } };
};

/**
 * Emite o snapshot quando AI_DEBUG=true. Escreve no console (visível no terminal
 * do dev) e, se um cliente Prisma for passado, também persiste como log
 * AI_DEBUG_SNAPSHOT (fire-and-forget). Não faz nada se AI_DEBUG não estiver on.
 */
export function emitAiDebug(snapshot: AiDebugSnapshot, prismaClient?: PrismaLogWriter) {
  if (!isAiDebugEnabled()) return;

  // eslint-disable-next-line no-console
  console.log(`[AI_DEBUG] ${snapshot.route}`, JSON.stringify(snapshot, null, 2));

  prismaClient?.log
    .create({
      data: {
        type: "AI_DEBUG_SNAPSHOT",
        message: `AI debug snapshot (${snapshot.route}) para ${snapshot.phoneMasked}`,
        payload: snapshot,
      },
    })
    .catch(() => {});
}
