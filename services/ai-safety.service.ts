import { Prompt } from "@prisma/client";

type SafetyContext = {
  incomingText?: string | null;
  recentHistory?: string[];
  hasPhoto?: boolean;
};

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
