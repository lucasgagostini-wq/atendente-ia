import { Prompt } from "@prisma/client";

type SafetyContext = {
  incomingText?: string | null;
  recentHistory?: string[];
  hasPhoto?: boolean;
};

export const PIX_KEY = "estudiofotos000@gmail.com";
export const PIX_NAME = "Lucas Agostini";
export const PIX_BANK = "Nubank";
export const PAYMENT_STAGE_WAITING_RECEIPT = "WAITING_PAYMENT_RECEIPT";
export const PAYMENT_STAGE_RECEIPT_SENT = "PAYMENT_RECEIPT_SENT";
export const PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW = "RECEIPT_NEEDS_REVIEW";

const RECENT_PIX_CONTEXT_PATTERNS = [
  /chave pix/i,
  /estudiofotos000@gmail\.com/i,
  /nome:\s*lucas agostini/i,
  /banco:\s*nubank/i,
  /me manda o comprovante/i,
  /quer que eu te mande o pix/i,
];

const MAX_WHATSAPP_MESSAGE_LENGTH = 180;

type SanitizedResponse = {
  output: string;
  blocked: boolean;
  reason?: string;
  fallbackStage: string;
};

const FORBIDDEN_PATTERNS = [
  /\binstabilidade\b/i,
  /\berro\b/i,
  /\bfalha\b/i,
  /\bapi\b/i,
  /\bmodelo\b/i,
  /intelig[eê]ncia artificial/i,
  /\bia\b/i,
  /\bchatbot\b/i,
  /automa[cç][aã]o/i,
  /contexto insuficiente/i,
  /n[aã]o tenho informa[cç][oõ]es/i,
  /informa[cç][oõ]es suficientes/i,
  /resumo (objetivo )?da oferta/i,
  /\bconfigure\b/i,
  /\bsistema\b/i,
  /\bprompt\b/i,
  /\btokens?\b/i,
  /\bopenrouter\b/i,
  /\bevolution\b/i,
  /banco de dados/i,
  /problema t[eé]cnico/i,
  /n[aã]o consegui processar/i,
  /dados ausentes/i,
  /modelo indispon[ií]vel/i,
  /cr[eé]ditos?/i,
  /\bsaldo\b/i,
  /placeholder/i,
];

const REQUIRED_PROMPT_FIELDS: Array<keyof Prompt> = [
  "personality",
  "tone",
  "goal",
  "rules",
  "faq",
  "objections",
  "offer",
  "transferTriggers",
  "cta",
];

function normalize(value?: string | null) {
  return value?.trim() ?? "";
}

function compactText(context: SafetyContext) {
  return [context.incomingText, ...(context.recentHistory ?? [])]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

// Confirmações afirmativas curtas ("sim", "pode", "isso", "bora"...). Ancoradas
// no início para não casar com "simples", "podemos ver depois", etc.
const AFFIRMATIVE_CONFIRMATION_PATTERN =
  /^(s[ií]m?|isso( mesmo)?|claro|pode( sim| ser| mandar)?|quero( sim| essa)?|manda( sim)?|bora|vamos|fechad[oa]|fechou|ok|por favor|aham|uhum|t[aá] bom|beleza|blz|com certeza|essa mesmo)\b/i;

// Sinais de que a ÚLTIMA mensagem do atendente ofereceu o Pix.
const ASSISTANT_PIX_OFFER_PATTERN =
  /quer que eu te (mande|passe) o pix|te mando o pix|posso te (mandar|passar) o pix|te passar o pix|mandar o pix|passo o pix|envio o pix|te envio o pix/i;

export function isAffirmativeConfirmation(text?: string | null) {
  return AFFIRMATIVE_CONFIRMATION_PATTERN.test(normalize(text));
}

export function lastAssistantOfferedPix(recentHistory: string[] = []) {
  const assistantLines = recentHistory.filter((line) => /^\s*atendente:/i.test(line));
  const lastAssistant = assistantLines.at(-1) ?? "";
  return ASSISTANT_PIX_OFFER_PATTERN.test(lastAssistant);
}

export function detectPaymentIntent(context: SafetyContext = {}) {
  const text = normalize(context.incomingText).toLowerCase();
  const directIntent =
    /(manda|passa|envia|mande).{0,20}(pix|chave)|(pode mandar|manda|passa).{0,10}(a )?(chave|pix)|qual.{0,10}pix|qual.{0,10}chave|como pago|como faço pra pagar|como faco pra pagar|quero pagar|vou pagar|vou fazer o pix|vou fazer pix|fazer o pix|fecho|quero fechar|fechar agora/.test(
      text,
    );

  if (directIntent) return true;

  // "Sim"/"pode"/"isso" logo após o atendente perguntar "Quer que eu te mande o
  // Pix?" é confirmação de pagamento → deve disparar o Pix determinístico em vez
  // de deixar o modelo improvisar (que costuma repetir pedido de foto).
  return (
    lastAssistantOfferedPix(context.recentHistory ?? []) &&
    isAffirmativeConfirmation(text)
  );
}

export function hasRecentPixContext(context: SafetyContext = {}) {
  return (context.recentHistory ?? []).some((item) =>
    RECENT_PIX_CONTEXT_PATTERNS.some((pattern) => pattern.test(item)),
  );
}

// Subconjunto SEM o padrão de oferta ("quer que eu te mande o pix"): só conta
// quando os DADOS do Pix realmente foram enviados (chave/nome/banco/comprovante).
// Usado para suprimir reinício de venda — não basta ter OFERECIDO o Pix.
const PIX_DATA_SENT_PATTERNS = [
  /chave pix/i,
  /estudiofotos000@gmail\.com/i,
  /nome:\s*lucas agostini/i,
  /banco:\s*nubank/i,
  /lucas agostini\s*[—-]\s*nubank/i,
  /me manda o comprovante/i,
  /mandar o comprovante/i,
];

export function pixDataAlreadySent(context: SafetyContext = {}) {
  return (context.recentHistory ?? []).some((item) =>
    PIX_DATA_SENT_PATTERNS.some((pattern) => pattern.test(item)),
  );
}

export function detectPaymentReceipt(context: SafetyContext = {}) {
  const text = normalize(context.incomingText).toLowerCase();
  const mentionsReceiptOrPayment =
    /comprovante|paguei|já paguei|ja paguei|fiz o pix|fiz pix|vou mandar o comprovante|segue o comprovante|segue comprovante|enviei o comprovante|pagamento feito|pix feito|pix pago|t[aá] pago|ta pago|acabei de pagar/.test(
      text,
    );

  if (mentionsReceiptOrPayment) return true;

  return Boolean(context.hasPhoto) && hasRecentPixContext(context);
}

export function detectIfWaitingPaymentReceipt(summary?: string | null) {
  return Boolean(summary?.includes(PAYMENT_STAGE_WAITING_RECEIPT));
}

// ── Estado persistente de "foto de serviço já recebida" ────────────
// O bug crítico relatado: a IA voltava a pedir a foto porque hasPhoto era
// derivado só do burst atual + janela curta de histórico. Marcamos no summary
// (mesmo mecanismo já usado para [PAGAMENTO: ...]) para o estado sobreviver à
// janela deslizante de histórico.
export const SERVICE_IMAGE_SUMMARY_MARKER = "[FOTO_RECEBIDA]";

const SERVICE_IMAGE_HISTORY_PATTERN =
  /cliente (j[aá] )?enviou uma foto|foto para restaurar|\[cliente.*foto/i;

export function summaryHasServiceImage(summary?: string | null) {
  return Boolean(summary?.includes(SERVICE_IMAGE_SUMMARY_MARKER));
}

export function markServiceImageReceived(summary?: string | null) {
  const current = normalize(summary);
  if (summaryHasServiceImage(current)) return current;
  return [current, SERVICE_IMAGE_SUMMARY_MARKER].filter(Boolean).join("\n");
}

/**
 * Verdadeiro se a conversa já recebeu uma foto de serviço em QUALQUER ponto:
 * via burst atual (hasPhoto), marca persistente no summary, ou histórico.
 * Usado para nunca mais pedir a foto depois que ela chegou.
 */
export function conversationHasServiceImage(context: SafetyContext & { summary?: string | null } = {}) {
  if (context.hasPhoto) return true;
  if (summaryHasServiceImage(context.summary)) return true;
  return (context.recentHistory ?? []).some((item) => SERVICE_IMAGE_HISTORY_PATTERN.test(item));
}

/** Alias semântico — Pix já foi enviado/aparece no histórico recente. */
export function pixAlreadySent(context: SafetyContext = {}) {
  return hasRecentPixContext(context);
}

// ── Tipo de serviço (restauração x edição simples) ─────────────────
const SIMPLE_EDIT_PATTERN =
  /tirar?\s+(a|o|essa|esse|aquela|aquele|um|uma)?\s*(pessoa|gente|mulher|homem|fundo|objeto|sombra)|remover|apagar (a|o|essa)|tira a |tira o |trocar (o |a )?fundo|mudar (o |a )?fundo|fundo branco|colocar (no |num )?fundo|recortar|recorta|juntar (as |duas )?fotos|montar|adicionar|colorir|deixar colorid|preto e branco|melhorar (a )?qualidade|aumentar (a )?qualidade|deixar (mais )?nitid/i;

const RESTORATION_PATTERN =
  /restaur|antiga|rasgad|manchad|desbotad|amarelad|danificad|estragad|vinco|riscad|recuperar (a |essa )?foto/i;

export function detectServiceType(
  context: SafetyContext = {},
): "simple_edit" | "restoration" | "unknown" {
  const text = compactText(context);
  if (SIMPLE_EDIT_PATTERN.test(text)) return "simple_edit";
  if (RESTORATION_PATTERN.test(text)) return "restoration";
  return "unknown";
}

export function buildExpectedPaymentData(conversationContext?: SafetyContext) {
  const contextText = compactText(conversationContext ?? {});
  const amountMatch = contextText.match(/(?:r\$)\s*(\d{1,4}(?:[,.]\d{2})?)/i);

  return {
    pixKey: PIX_KEY,
    recipientName: PIX_NAME,
    bank: PIX_BANK,
    amount: amountMatch?.[1]?.replace(",", ".") || "9.99",
  };
}

export function buildPaymentMessageSequence() {
  return [
    "Perfeito. O Pix é:",
    PIX_KEY,
    `Nome: ${PIX_NAME} — ${PIX_BANK}`,
    "Depois que fizer o Pix e mandar o comprovante, eu começo por aqui.",
  ];
}

export function ensureReceiptRequest(messages: string[]) {
  const hasReceiptRequest = messages.some((message) =>
    /comprovante/i.test(message),
  );

  if (hasReceiptRequest) return messages;

  return [
    ...messages,
    "Depois que fizer o Pix e mandar o comprovante, eu começo por aqui.",
  ];
}

export function sendPixAsSeparateMessage() {
  return ensureReceiptRequest(buildPaymentMessageSequence());
}

export function updateConversationStage(
  currentSummary: string | null | undefined,
  stage: string,
) {
  const summary = normalize(currentSummary)
    .replace(/\n?\[PAGAMENTO: WAITING_PAYMENT_RECEIPT\]/g, "")
    .replace(/\n?\[PAGAMENTO: PAYMENT_RECEIPT_SENT\]/g, "")
    .replace(/\n?\[PAGAMENTO: RECEIPT_NEEDS_REVIEW\]/g, "");

  return [summary, `[PAGAMENTO: ${stage}]`].filter(Boolean).join("\n");
}

function hasCommercialCTA(response: string) {
  return [
    /quer que eu/i,
    /quer começar|quer comecar/i,
    /posso te passar o pix|posso te passar o pagamento/i,
    /te mando o pix|mandar o pix|te passar o pix|passar o pagamento/i,
    /começar com 1 foto|comecar com 1 foto/i,
    /confirmando o pix|confirmar agora|confirmando agora/i,
    /consigo entregar ainda hoje/i,
  ].some((pattern) => pattern.test(response.trim()));
}

function isGoodbyeOrHardNo(context: SafetyContext) {
  const incoming = normalize(context.incomingText).toLowerCase();
  return /(tchau|obrigad[ao]|valeu|não quero|nao quero|não tenho interesse|nao tenho interesse|pare|cancela|cancelar)/i.test(
    incoming,
  );
}

export function detectConversationStage(context: SafetyContext = {}) {
  const text = compactText(context);
  const hasPhoto =
    Boolean(context.hasPhoto) ||
    /cliente enviou uma foto|foto para restaurar|imagem|photo|image/.test(text);
  const askedPreview = /pr[eé]via|amostra|teste gr[aá]tis|ver antes|antes de pagar/.test(text);
  const askedPrice = /pre[cç]o|valor|quanto|custa|pacote|r\$|pix/.test(text);
  const askedTrust = /confi[aá]vel|confian[cç]a|golpe|garantia|seguro|medo|receio|cara de ia|artificial/.test(text);

  if (askedPreview) return "preview_requested";
  if (askedPrice) return "price_requested";
  if (askedTrust) return "trust_requested";
  if (hasPhoto) return "photo_received";
  return "needs_photo";
}

export function detectObjectionType(context: SafetyContext = {}) {
  const incomingText = normalize(context.incomingText).toLowerCase();
  const text = incomingText || compactText(context);

  if (/pr[eé]via|amostra|teste gr[aá]tis|ver antes|antes de pagar|depois eu pago|faz antes/.test(text)) {
    return "preview";
  }
  if (/cara de ia|cara de i\.a|artificial|estranh[ao]|deformar|deformad/.test(text)) {
    return "ai_look_fear";
  }
  if (/j[aá] aconteceu.*n[aã]o gostar|algu[eé]m.*n[aã]o gostar|cliente.*n[aã]o gostou|pessoa.*n[aã]o gostou/.test(text)) {
    return "past_result_question";
  }
  if (/e se .*ruim|se ficar ruim|n[aã]o gostar|ficar ruim|resultado ruim/.test(text)) {
    return "result_fear";
  }
  if (/n[aã]o confio|confi[aá]vel|confian[cç]a|golpe|garantia|seguro|medo|receio/.test(text)) {
    return "trust";
  }
  if (/t[aá] caro|caro|desconto|barato|menor valor|concorrente|por 5|5 reais|r\$\s*5/.test(text)) {
    return "price_resistance";
  }
  if (/vou pensar|depois eu vejo|mais tarde|amanh[aã]|qualquer coisa|te chamo/.test(text)) {
    return "delay";
  }
  if (/pre[cç]o|valor|quanto|custa|pacote|r\$/.test(text)) {
    return "price";
  }

  return "none";
}

export function detectEmotionalContext(context: SafetyContext = {}) {
  const text = compactText(context);

  if (/av[oó]|avó|avô|v[oó]/.test(text)) return "grandparent";
  if (/\bm[aã]e\b|\bpai\b|fam[ií]lia|familiar/.test(text)) return "family";
  if (/falecid[ao]|morreu|partiu|saudade/.test(text)) return "loss";
  if (/mem[oó]ria|lembran[cç]a|foto antiga|antiga/.test(text)) return "memory";

  return "none";
}

function hasPhotoInContext(context: SafetyContext = {}) {
  return (
    Boolean(context.hasPhoto) ||
    /cliente enviou uma foto|foto para restaurar|imagem|photo|image/.test(compactText(context))
  );
}

function hasPriceInContext(context: SafetyContext = {}) {
  return /9,99|r\$\s*9|valor|pre[cç]o|fica/i.test(compactText(context));
}

function isSpecificSinglePhotoContext(context: SafetyContext = {}) {
  const text = compactText(context);
  return (
    hasPhotoInContext(context) &&
    !/fotos|mais de uma|v[áa]rias|pacote|quantas/.test(text) &&
    /essa foto|essa aqui|s[oó] essa|\bessa\b|quero que fique|sem mudar muito o rosto|sem mudar o rosto/.test(text)
  );
}

export function buildCommercialInstruction(context: SafetyContext = {}) {
  const objectionType = detectObjectionType(context);
  const emotionalContext = detectEmotionalContext(context);

  return {
    objectionType,
    emotionalContext,
    hasPhoto: hasPhotoInContext(context),
    hasPrice: hasPriceInContext(context),
    mustCloseSale: !isGoodbyeOrHardNo(context),
  };
}

function ctaForContext(context: SafetyContext = {}) {
  const instruction = buildCommercialInstruction(context);

  if (!instruction.hasPhoto) {
    return "Me manda a foto aqui que eu vejo pra você.";
  }
  if (instruction.objectionType === "preview") {
    return "Essa fica só R$10 pra testar. Quer que eu te mande o Pix?";
  }
  if (instruction.objectionType === "price") {
    return "Pra fazer essa, fica R$10. Quer que eu te mande o Pix?";
  }
  if (
    instruction.objectionType === "trust" ||
    instruction.objectionType === "result_fear" ||
    instruction.objectionType === "ai_look_fear" ||
    instruction.objectionType === "past_result_question" ||
    instruction.objectionType === "price_resistance"
  ) {
    return "Pode começar com 1 foto por R$10. Quer que eu te mande o Pix?";
  }
  if (instruction.objectionType === "delay") {
    return "Confirmando o Pix, eu já separo essa foto pra fazer hoje. Quer que eu te mande o Pix?";
  }
  if (instruction.emotionalContext !== "none") {
    return "Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?";
  }
  if (instruction.hasPhoto && !instruction.hasPrice) {
    return "Pra fazer essa, fica R$10. Quer que eu te mande o Pix?";
  }

  return "Quer que eu te mande o Pix?";
}

function normalizeForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasSinglePhotoSignal(context: SafetyContext = {}) {
  return isSpecificSinglePhotoContext(context) || (
    Boolean(context.hasPhoto) &&
    !/fotos|mais de uma|varias|várias|pacote|quantas/.test(compactText(context)) &&
    detectEmotionalContext(context) !== "none"
  );
}

function normalizePrePaymentPromises(response: string, context: SafetyContext = {}) {
  const output = normalize(response);
  if (!output) return output;

  if (hasRecentPixContext(context)) {
    return output;
  }

  if (/j[aá]\s+come[cç]|vou come[cç]ar|vou iniciar|j[aá]\s+inicio|inicio a restaura[cç][aã]o|comeco por aqui/i.test(output)) {
    return output.replace(
      /(?:j[aá]\s+come[cç][^.!?]*|vou come[cç]ar[^.!?]*|vou iniciar[^.!?]*|j[aá]\s+inicio[^.!?]*|inicio a restaura[cç][aã]o[^.!?]*|comeco por aqui[^.!?]*)/gi,
      "Depois que fizer o Pix e mandar o comprovante, eu começo por aqui",
    );
  }

  return output;
}

function removeOpenEndedAdjustmentPromises(response: string) {
  return response
    .replace(/(?:at[eé] ficar satisfeito|ajusto quantas vezes precisar|a gente corrige at[eé] ficar do seu jeito|qualquer coisa depois voc[eê] me avisa)[^.!?]*[.!?]?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function removePassiveClosers(response: string) {
  return response
    .replace(/(?:me avisa|quando quiser|se quiser|fica [aà] vontade|me chama|qualquer coisa me chama)[^.!?]*[.!?]?/gi, "")
    .replace(/posso seguir\?/gi, "Quer que eu te mande o Pix?")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function asksForPhotoAgain(response: string) {
  return /me manda a foto|manda a foto|envia a foto|me envia a foto|manda aqui que eu vejo|envia aqui que eu vejo|pode mandar a foto|mande a foto/i.test(response);
}

// Depois que o Pix já foi enviado, a IA NÃO pode reabrir venda (re-ofertar Pix,
// repetir preço de fechamento) nem pedir a foto de novo. Remove essas frases.
function removePostPixSaleRestart(response: string) {
  return response
    .replace(/(?:quer que eu te (mande|passe) o pix|posso te (mandar|passar) o pix|te mando o pix|te passar o pix|quer que eu te passe o pix)[^.!?]*[.!?]?/gi, "")
    .replace(/(?:pra fazer[^.!?]*fica\s*r\$\s*\d+[^.!?]*[.!?]?)/gi, "")
    .replace(/(?:me manda a foto|manda a foto|envia a foto|me envia a foto|mande a foto|manda aqui que eu vejo)[^.!?]*[.!?]?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remove parágrafos longos que apenas repetem, palavra por palavra, algo que o
// atendente JÁ disse (evita reenviar o bloco inteiro quando o lead manda "?").
// Mantém linhas curtas (CTAs) para não esvaziar a resposta.
const ECHO_MIN_LENGTH = 40;

function removeEchoedAssistantLines(lines: string[], recentHistory: string[] = []) {
  const assistantNorms = recentHistory
    .filter((line) => /^\s*atendente:/i.test(line))
    .map((line) => normalizeForComparison(line.replace(/^\s*atendente:\s*/i, "")))
    .filter((norm) => norm.length >= ECHO_MIN_LENGTH);

  if (!assistantNorms.length) return lines;

  // Só remove PARÁGRAFOS longos repetidos; CTAs curtos ("Quer que eu te mande o
  // Pix?") ficam preservados mesmo que tenham aparecido antes.
  const filtered = lines.filter((line) => {
    const norm = normalizeForComparison(line);
    if (norm.length < ECHO_MIN_LENGTH) return true;
    return !assistantNorms.some((prev) => prev === norm || prev.includes(norm) || norm.includes(prev));
  });

  return filtered.length ? filtered : lines;
}

function responseAsksQuantity(response: string) {
  return /quantas fotos|quantas voc[eê] gostaria|quantas quer|mais de uma foto|pacote maior/i.test(response);
}

function commercialReplyForSpecificPhoto(context: SafetyContext = {}) {
  const emotionalContext = detectEmotionalContext(context);

  if (emotionalContext === "grandparent") {
    return [
      "Recebi a foto. Que lembrança especial da sua avó ❤️",
      "Dá pra trabalhar nela com cuidado, mantendo o rosto natural e sem deixar artificial.",
      "Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
    ].join("\n\n");
  }

  if (emotionalContext === "loss" || emotionalContext === "family" || emotionalContext === "memory") {
    return [
      "Recebi a foto. É uma lembrança muito especial.",
      "Dá pra trabalhar nela com cuidado, mantendo o rosto natural e sem deixar artificial.",
      "Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
    ].join("\n\n");
  }

  return [
    "Recebi a foto. Dá pra trabalhar nela sim.",
    "O foco é melhorar com cuidado e manter o rosto natural.",
    "Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
  ].join("\n\n");
}

function guardrailReplyForObjection(context: SafetyContext = {}) {
  const objectionType = detectObjectionType(context);
  const emotionalContext = detectEmotionalContext(context);

  if (objectionType === "preview") {
    return [
      "Entendo sua preocupação. A gente não faz prévia grátis porque o trabalho já começa na restauração da foto.",
      "Mas essa fica só R$10 pra testar, com cuidado pra manter o rosto natural. Quer que eu te mande o Pix?",
    ].join("\n\n");
  }

  if (objectionType === "ai_look_fear") {
    return [
      "Entendo total. O foco aqui é justamente não deixar com cara artificial nem mudar o rosto.",
      "Eu trabalho pra melhorar a nitidez e recuperar a foto com naturalidade. Pra essa fica R$10. Quer que eu te mande o Pix?",
    ].join("\n\n");
  }

  if (objectionType === "past_result_question") {
    return [
      "É bem raro, porque o foco é restaurar sem mudar o rosto nem exagerar no efeito.",
      "E se precisar de algum ajuste simples depois, eu corrijo dentro do pedido. Confirmando agora, consigo entregar ainda hoje.",
    ].join("\n\n");
  }

  if (objectionType === "price_resistance") {
    const subject = emotionalContext === "grandparent" ? "foto da sua avó" : "foto";

    return [
      "Entendo. Tem gente que faz mais barato mesmo, mas aqui eu prefiro fazer com cuidado pra não deformar o rosto nem deixar artificial.",
      `Pra essa ${subject} fica R$10 e consigo entregar ainda hoje. Quer que eu te mande o Pix?`,
    ].join("\n\n");
  }

  return null;
}

function dedupeRepeatedLines(lines: string[]) {
  const unique: string[] = [];

  for (const line of lines) {
    const normalized = normalizeForComparison(line);
    if (!normalized) continue;

    const alreadyIncluded = unique.some((item) => {
      const normalizedItem = normalizeForComparison(item);
      return (
        normalizedItem === normalized ||
        normalizedItem.includes(normalized) ||
        normalized.includes(normalizedItem)
      );
    });

    if (!alreadyIncluded) {
      unique.push(line.trim());
    }
  }

  return unique;
}

export function normalizeCommercialResponse(response: string, context: SafetyContext = {}) {
  let output = normalize(response);
  if (!output) return output;

  // ── Pós-Pix: jamais reiniciar a venda nem pedir a foto de novo ──
  // Só ativa quando os DADOS do Pix já foram enviados (não na mera oferta).
  if (pixDataAlreadySent(context)) {
    let postPix = removeOpenEndedAdjustmentPromises(output);
    postPix = removePassiveClosers(postPix);
    postPix = removePostPixSaleRestart(postPix);

    const postPixLines = dedupeRepeatedLines(
      postPix.split(/\n+/).map((line) => line.trim()).filter(Boolean),
    );
    let joined = removeEchoedAssistantLines(postPixLines, context.recentHistory ?? []).join("\n\n").trim();

    if (!joined) {
      joined = "Recebi 😊 assim que você me mandar o comprovante, eu começo por aqui.";
    } else if (!/comprovante/i.test(joined)) {
      joined = `${joined}\n\nAssim que você me mandar o comprovante, eu começo por aqui.`;
    }

    return joined;
  }

  const singlePhotoContext = isSpecificSinglePhotoContext(context);
  const askedPrice = detectObjectionType(context) === "price" || hasPriceInContext(context);
  const forcedObjectionReply = guardrailReplyForObjection(context);

  if (forcedObjectionReply) {
    return forcedObjectionReply;
  }

  if (singlePhotoContext && askedPrice) {
    return commercialReplyForSpecificPhoto(context);
  }

  if (
    hasSinglePhotoSignal(context) &&
    (responseAsksQuantity(output) || asksForPhotoAgain(output) || /quer que eu j[aá] comece/i.test(output))
  ) {
    return commercialReplyForSpecificPhoto(context);
  }

  if (hasPhotoInContext(context) && asksForPhotoAgain(output)) {
    output = "Recebi a foto. Dá pra trabalhar nela com cuidado, mantendo o rosto natural. Pra fazer essa fica R$10. Quer que eu te mande o Pix?";
  }

  if (singlePhotoContext && responseAsksQuantity(output)) {
    output = commercialReplyForSpecificPhoto(context);
  }

  output = normalizePrePaymentPromises(output, context);
  output = removeOpenEndedAdjustmentPromises(output);
  output = removePassiveClosers(output);

  const lines = output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dedupedLines = removeEchoedAssistantLines(
    dedupeRepeatedLines(lines),
    context.recentHistory ?? [],
  );

  return dedupedLines.join("\n\n");
}

export function ensureSalesCTA(response: string, context: SafetyContext = {}) {
  const output = normalize(response);

  if (!output || isGoodbyeOrHardNo(context)) {
    return output;
  }

  // Pós-Pix: não anexar CTA de venda. A próxima ação esperada é o comprovante.
  if (pixDataAlreadySent(context)) {
    if (/comprovante/i.test(output)) return output;
    return `${output}\n\nAssim que você me mandar o comprovante, eu começo por aqui.`;
  }

  if (hasCommercialCTA(output)) {
    return output;
  }

  return `${output}\n\n${ctaForContext(context)}`;
}

export function splitResponseIntoWhatsAppMessages(response: string) {
  const parts = dedupeRepeatedLines(
    response
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean),
  );

  const shortParts = parts.flatMap((part) => splitLongMessagePart(part));

  if (shortParts.length <= 1) return shortParts.filter(Boolean);
  if (shortParts.length <= 3) return shortParts;

  return shortParts.slice(0, 3).filter(Boolean);
}

function splitLongMessagePart(part: string) {
  const output = normalize(part);
  if (!output) return [];
  if (output.length <= MAX_WHATSAPP_MESSAGE_LENGTH) return [output];

  const sentences = output
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.length > 0 ? sentences : [output]) {
    if (sentence.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      const words = sentence.split(/\s+/);
      let wordChunk = "";

      for (const word of words) {
        const next = wordChunk ? `${wordChunk} ${word}` : word;
        if (next.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
          if (wordChunk) chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = next;
        }
      }

      if (wordChunk) chunks.push(wordChunk);
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function safeFallbackForStage(stage: string) {
  switch (stage) {
    case "photo_received":
      return "Recebi sim. Vou verificar com cuidado e já te falo o melhor caminho.";
    case "price_requested":
      return "Pra fazer 1 foto fica R$10. Quer que eu te mande o Pix?";
    case "preview_requested":
      return "Entendo sua preocupação. A gente não faz prévia grátis porque o trabalho já começa na restauração da foto.";
    case "trust_requested":
      return "Entendo total. O foco é melhorar com cuidado, sem mudar o rosto. Pra essa fica R$10. Quer que eu te mande o Pix?";
    case "needs_photo":
    default:
      return "Consigo te ajudar sim 😊 me manda a foto que você quer restaurar aqui.";
  }
}

export function sanitizeAIResponse(
  response: string | null | undefined,
  context: SafetyContext = {},
): SanitizedResponse {
  const output = normalize(response);
  const stage = detectConversationStage(context);

  if (!output) {
    return {
      output: safeFallbackForStage(stage),
      blocked: true,
      reason: "empty_response",
      fallbackStage: stage,
    };
  }

  const forbidden = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(output));
  if (forbidden) {
    return {
      output: safeFallbackForStage(stage),
      blocked: true,
      reason: `forbidden_pattern:${forbidden.source}`,
      fallbackStage: stage,
    };
  }

  return {
    output,
    blocked: false,
    fallbackStage: stage,
  };
}

export function validatePromptMaster(prompt: Prompt) {
  const missing: string[] = [];

  for (const field of REQUIRED_PROMPT_FIELDS) {
    if (!normalize(String(prompt[field] ?? ""))) missing.push(field);
  }

  const combined = [
    prompt.personality,
    prompt.tone,
    prompt.goal,
    prompt.rules,
    prompt.faq,
    prompt.objections,
    prompt.offer,
    prompt.cta,
  ]
    .map(normalize)
    .join("\n")
    .toLowerCase();

  if (!/camila|atendente/.test(combined)) missing.push("nome da atendente");
  if (!/restaura/.test(combined)) missing.push("oferta");
  if (!/9,99|r\$\s*9|r\$\s*10|\b10\b/.test(combined)) missing.push("preço");
  if (!/pr[eé]via|amostra|teste/.test(combined) || !/pagamento|pix/.test(combined)) {
    missing.push("regra de não fazer prévia");
  }
  if (!/pix|pagamento/.test(combined)) missing.push("forma de pagamento");
  if (!/tom|humano|natural|acolhedor|curto/.test(combined)) missing.push("tom de voz");
  if (!/obje/.test(combined) && !/receio|medo|confi/.test(combined)) {
    missing.push("objeções");
  }
  if (!/pix|opções|opcoes|manda/.test(combined)) missing.push("CTA");

  return {
    valid: missing.length === 0,
    missing: Array.from(new Set(missing)),
  };
}
