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

export function detectPaymentIntent(context: SafetyContext = {}) {
  const text = normalize(context.incomingText).toLowerCase();
  return /(manda|passa|envia|mande|pode mandar).{0,20}pix|qual.{0,10}pix|pix\??$|como pago|como faço pra pagar|como faco pra pagar|vou fechar|quero fazer|quero restaurar|pode mandar|fechado|bora|vou pagar|aceito|pode ser|quero sim|manda sim|passa sim/.test(
    text,
  );
}

export function detectPaymentReceipt(context: SafetyContext = {}) {
  const text = normalize(context.incomingText).toLowerCase();
  return (
    Boolean(context.hasPhoto) ||
    /paguei|fiz o pix|fiz pix|pronto|enviei|segue comprovante|comprovante|t[aá] pago|ta pago|acabei de pagar|pagamento feito/.test(
      text,
    )
  );
}

export function buildPaymentMessageSequence() {
  return [
    `Claro 😊 pode fazer o PIX por aqui:

Chave PIX: ${PIX_KEY}
Nome: ${PIX_NAME}
Banco: ${PIX_BANK}

Vou te mandar a chave separada aqui embaixo também, pra ficar mais fácil de copiar.`,
    PIX_KEY,
    "Depois que fizer, me manda o comprovante aqui mesmo que eu já inicio a restauração pra você.",
  ];
}

export function ensureReceiptRequest(messages: string[]) {
  const hasReceiptRequest = messages.some((message) =>
    /comprovante/i.test(message),
  );

  if (hasReceiptRequest) return messages;

  return [
    ...messages,
    "Depois que fizer, me manda o comprovante aqui mesmo que eu já inicio a restauração pra você.",
  ];
}

export function sendPixAsSeparateMessage() {
  return ensureReceiptRequest(buildPaymentMessageSequence());
}

export function updateConversationStage(
  currentSummary: string | null | undefined,
  stage: typeof PAYMENT_STAGE_WAITING_RECEIPT | typeof PAYMENT_STAGE_RECEIPT_SENT,
) {
  const summary = normalize(currentSummary)
    .replace(/\n?\[PAGAMENTO: WAITING_PAYMENT_RECEIPT\]/g, "")
    .replace(/\n?\[PAGAMENTO: PAYMENT_RECEIPT_SENT\]/g, "");

  return [summary, `[PAGAMENTO: ${stage}]`].filter(Boolean).join("\n");
}

function hasCommercialCTA(response: string) {
  return [
    /\?$/,
    /quer que eu/i,
    /quer começar|quer comecar|quer fazer/i,
    /posso te passar|posso deixar separado/i,
    /me manda a foto|manda a foto|me envia/i,
    /te mando o pix|mandar o pix|te passar o pix|passar o pagamento/i,
    /começar com 1 foto|comecar com 1 foto/i,
    /confirmar essa restaura/i,
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
  const askedTrust = /confi[aá]vel|confian[cç]a|golpe|garantia|seguro|medo|receio/.test(text);

  if (askedPreview) return "preview_requested";
  if (askedPrice) return "price_requested";
  if (askedTrust) return "trust_requested";
  if (hasPhoto) return "photo_received";
  return "needs_photo";
}

export function detectObjectionType(context: SafetyContext = {}) {
  const text = compactText(context);

  if (/pr[eé]via|amostra|teste gr[aá]tis|ver antes|antes de pagar|depois eu pago|faz antes/.test(text)) {
    return "preview";
  }
  if (/e se .*ruim|se ficar ruim|n[aã]o gostar|ficar ruim|resultado ruim/.test(text)) {
    return "result_fear";
  }
  if (/n[aã]o confio|confi[aá]vel|confian[cç]a|golpe|garantia|seguro|medo|receio/.test(text)) {
    return "trust";
  }
  if (/t[aá] caro|caro|desconto|barato|menor valor/.test(text)) {
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
    return "Quer começar com 1 foto por R$ 9,99?";
  }
  if (instruction.objectionType === "price") {
    return "Quer que eu te mande o PIX?";
  }
  if (
    instruction.objectionType === "trust" ||
    instruction.objectionType === "result_fear" ||
    instruction.objectionType === "price_resistance"
  ) {
    return "Pode começar com 1 foto só. Quer que eu te mande o PIX?";
  }
  if (instruction.objectionType === "delay") {
    return "Se quiser começar com 1 foto, fica R$ 9,99. Posso te mandar o PIX?";
  }
  if (instruction.emotionalContext !== "none") {
    return "Quer que eu já comece essa foto pra você?";
  }
  if (instruction.hasPhoto && !instruction.hasPrice) {
    return "A de 1 foto fica R$ 9,99. Quer que eu te mande o PIX?";
  }

  return "Quer que eu te mande o PIX?";
}

export function ensureSalesCTA(response: string, context: SafetyContext = {}) {
  const output = normalize(response);

  if (!output || isGoodbyeOrHardNo(context) || hasCommercialCTA(output)) {
    return output;
  }

  return `${output}\n\n${ctaForContext(context)}`;
}

export function splitResponseIntoWhatsAppMessages(response: string) {
  const parts = response
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [response.trim()].filter(Boolean);

  const first = parts[0];
  const second = parts.slice(1).join("\n\n");

  return [first, second].filter(Boolean).slice(0, 2);
}

export function safeFallbackForStage(stage: string) {
  switch (stage) {
    case "photo_received":
      return "Recebi sim. Vou verificar com cuidado e já te falo o melhor caminho.";
    case "price_requested":
      return "Faço a restauração por pacote. A opção de 1 foto fica R$ 9,99, e também tenho pacotes para mais fotos. Quer que eu te mande as opções?";
    case "preview_requested":
      return "Entendo seu receio 🥺 mas como cada restauração leva tempo e é feita com cuidado, eu começo somente após a confirmação do pagamento.";
    case "trust_requested":
      return "Entendo totalmente. Pode começar com 1 foto só, que fica R$ 9,99, e eu vou te acompanhando por aqui.";
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
  if (!/9,99|r\$\s*9/.test(combined)) missing.push("preço");
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
