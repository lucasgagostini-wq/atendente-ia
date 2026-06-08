import assert from "node:assert/strict";
import {
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_SENT,
  PAYMENT_STAGE_WAITING_RECEIPT,
  PIX_BANK,
  PIX_KEY,
  PIX_NAME,
  buildExpectedPaymentData,
  detectEmotionalContext,
  detectIfWaitingPaymentReceipt,
  detectObjectionType,
  detectPaymentIntent,
  detectPaymentReceipt,
  ensureSalesCTA,
  hasRecentPixContext,
  normalizeCommercialResponse,
  safeFallbackForStage,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
  updateConversationStage,
  validatePromptMaster,
} from "../services/ai-safety.service";

const baseContext = {
  incomingText: "oi, tenho uma foto antiga para restaurar",
  recentHistory: [],
};

const blockedScenarios = [
  "Tive uma instabilidade rápida aqui. Quer que eu te mande um resumo objetivo da oferta e valores?",
  "Erro na API, tente novamente depois.",
  "Não tenho informações suficientes sobre a oferta.",
  "Sou uma IA e preciso que configure o prompt.",
  "Use seus créditos e saldo para pagar.",
  "",
];

for (const scenario of blockedScenarios) {
  const sanitized = sanitizeAIResponse(scenario, baseContext);
  assert.equal(sanitized.blocked, true, `deveria bloquear: ${scenario}`);
  assert.doesNotMatch(sanitized.output, /instabilidade|erro|api|ia|prompt|resumo da oferta/i);
}

assert.equal(
  sanitizeAIResponse("Qualquer coisa me manda a foto aqui 😊", baseContext).blocked,
  false,
);

assert.equal(
  sanitizeAIResponse("Tive uma falha", {
    incomingText: "quanto custa?",
    recentHistory: [],
  }).output,
  safeFallbackForStage("price_requested"),
);

assert.equal(
  sanitizeAIResponse("modelo indisponível", {
    incomingText: "me manda uma prévia antes de pagar?",
    recentHistory: [],
  }).output,
  safeFallbackForStage("preview_requested"),
);

assert.equal(
  sanitizeAIResponse("OpenRouter 429", {
    incomingText: "isso é confiável mesmo?",
    recentHistory: [],
  }).output,
  safeFallbackForStage("trust_requested"),
);

assert.equal(
  sanitizeAIResponse("resposta vazia", {
    incomingText: "Cliente enviou uma foto para restaurar.",
    recentHistory: [],
  }).fallbackStage,
  "photo_received",
);

const promptValidation = validatePromptMaster({
  id: "test",
  name: "Prompt teste",
  personality: "",
  tone: "",
  goal: "",
  rules: "",
  faq: "",
  objections: "",
  offer: "",
  checkoutUrl: null,
  transferTriggers: "",
  cta: "",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

assert.equal(promptValidation.valid, false);
assert.ok(promptValidation.missing.length > 0);

assert.equal(
  detectObjectionType({ incomingText: "faz prévia?", recentHistory: [] }),
  "preview",
);
assert.equal(
  detectObjectionType({ incomingText: "e se eu não gostar?", recentHistory: [] }),
  "result_fear",
);
assert.equal(
  detectObjectionType({ incomingText: "não confio", recentHistory: [] }),
  "trust",
);
assert.equal(
  detectObjectionType({ incomingText: "quanto fica?", recentHistory: [] }),
  "price",
);
assert.equal(
  detectEmotionalContext({ incomingText: "tenho uma foto antiga da minha avó", recentHistory: [] }),
  "grandparent",
);

const previewClose = ensureSalesCTA("Entendo seu receio 🥺 eu começo depois da confirmação do pagamento.", {
  incomingText: "faz prévia?",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(previewClose, /Quer começar com 1 foto por R\$ 9,99\?/);

const trustClose = ensureSalesCTA("Faz sentido ter cuidado mesmo.", {
  incomingText: "não confio",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(trustClose, /Pode começar com 1 foto só\. Quer que eu te mande o PIX\?/);

const noPhotoClose = ensureSalesCTA("Consigo te ajudar sim 😊", {
  incomingText: "oi, restaura foto?",
  recentHistory: [],
});
assert.match(noPhotoClose, /Me manda a foto aqui que eu vejo pra você\./);

const delayClose = ensureSalesCTA("Claro, sem problema.", {
  incomingText: "vou pensar",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(delayClose, /Se quiser começar com 1 foto, fica R\$ 9,99\. Posso te mandar o PIX\?/);

const emotionalClose = ensureSalesCTA("Foto de vó tem um valor enorme mesmo 🥺", {
  incomingText: "foto antiga da minha avó",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(emotionalClose, /Posso seguir com essa foto por R\$10\. Quer que eu te mande o PIX\?/);

const splitMessages = splitResponseIntoWhatsAppMessages(
  "Entendo seu receio 🥺 eu começo depois da confirmação.\n\nA de 1 foto fica R$ 9,99. Quer que eu te mande o PIX?",
);
assert.equal(splitMessages.length, 2);

const pixMessages = sendPixAsSeparateMessage();
assert.equal(pixMessages.length, 3);
assert.equal(
  pixMessages[0],
  `Claro 😊 pode fazer o PIX por aqui:

Chave PIX: ${PIX_KEY}
Nome: ${PIX_NAME}
Banco: ${PIX_BANK}

Vou te mandar a chave separada aqui embaixo também, pra ficar mais fácil de copiar.`,
);
assert.equal(pixMessages[1], "estudiofotos000@gmail.com");
assert.equal(
  pixMessages[2],
  "Depois que fizer o Pix e mandar o comprovante, eu começo por aqui.",
);
assert.equal(detectPaymentIntent({ incomingText: "manda o pix" }), true);
assert.equal(detectPaymentIntent({ incomingText: "como faço pra pagar?" }), true);
assert.equal(detectPaymentIntent({ incomingText: "fecho, pode mandar a chave" }), true);
assert.equal(detectPaymentIntent({ incomingText: "quero restaurar" }), false);
assert.equal(detectPaymentIntent({ incomingText: "bora" }), false);
assert.equal(detectPaymentIntent({ incomingText: "pode ser" }), false);
assert.equal(detectPaymentReceipt({ incomingText: "fiz o pix" }), true);
assert.equal(detectPaymentReceipt({ incomingText: "segue comprovante" }), true);
assert.equal(
  hasRecentPixContext({
    recentHistory: [
      "Atendente: Claro 😊 pode fazer o PIX por aqui:",
      `Atendente: Chave PIX: ${PIX_KEY}`,
      "Atendente: Depois que fizer, me manda o comprovante aqui mesmo que eu já inicio a restauração pra você.",
    ],
  }),
  true,
);
assert.equal(detectPaymentReceipt({ incomingText: "", hasPhoto: true }), false);
assert.equal(
  detectPaymentReceipt({
    incomingText: "",
    hasPhoto: true,
    recentHistory: [
      "Atendente: Claro 😊 pode fazer o PIX por aqui:",
      `Atendente: Chave PIX: ${PIX_KEY}`,
    ],
  }),
  true,
);
assert.equal(
  detectPaymentReceipt({
    incomingText: "cliente enviou uma foto para restaurar",
    hasPhoto: true,
    recentHistory: [],
  }),
  false,
);
assert.match(
  updateConversationStage("lead quente", PAYMENT_STAGE_WAITING_RECEIPT),
  /\[PAGAMENTO: WAITING_PAYMENT_RECEIPT\]/,
);
assert.equal(
  detectIfWaitingPaymentReceipt(`[PAGAMENTO: ${PAYMENT_STAGE_WAITING_RECEIPT}]`),
  true,
);
assert.match(
  updateConversationStage(
    `[PAGAMENTO: ${PAYMENT_STAGE_WAITING_RECEIPT}]`,
    PAYMENT_STAGE_RECEIPT_SENT,
  ),
  /\[PAGAMENTO: PAYMENT_RECEIPT_SENT\]/,
);
assert.match(
  updateConversationStage(
    `[PAGAMENTO: ${PAYMENT_STAGE_WAITING_RECEIPT}]`,
    PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  ),
  /\[PAGAMENTO: RECEIPT_NEEDS_REVIEW\]/,
);
assert.deepEqual(
  buildExpectedPaymentData({
    incomingText: "vou pagar",
    recentHistory: ["Atendente: A de 1 foto fica R$ 9,99. Quer que eu te mande o PIX?"],
  }),
  {
    pixKey: PIX_KEY,
    recipientName: PIX_NAME,
    bank: PIX_BANK,
    amount: "9.99",
  },
);

const restorationPhotoContext = {
  incomingText: "[Cliente enviou uma foto para restaurar]\nsegue a foto da minha avó",
  recentHistory: ["Lead: oi, tenho uma foto antiga para restaurar"],
  hasPhoto: true,
};
const restorationPhotoReply = ensureSalesCTA(
  "Recebi a foto. Dá pra trabalhar nela sim.",
  restorationPhotoContext,
);
assert.doesNotMatch(restorationPhotoReply, /comprovante/i);
assert.match(restorationPhotoReply, /\?$/);

const normalizedPrePayment = normalizeCommercialResponse(
  "Perfeito, já começo essa foto pra você agora.",
  {
    incomingText: "quanto fica essa foto?",
    recentHistory: ["Lead: [Cliente enviou uma foto para restaurar]"],
    hasPhoto: true,
  },
);
assert.match(normalizedPrePayment, /Depois que fizer o Pix e mandar o comprovante, eu começo por aqui/i);

const normalizedSinglePhoto = normalizeCommercialResponse(
  "Recebi a foto, obrigada! Quantas fotos você gostaria de restaurar hoje?\n\nQuer que eu já comece essa foto pra você?",
  {
    incomingText:
      "[Cliente enviou uma foto para restaurar]\nEssa foto é da minha avó que faleceu. Quero que fique bonita, mas sem mudar muito o rosto.\nQuanto fica pra fazer essa?",
    recentHistory: ["Lead: oi, queria restaurar uma foto antiga. Como funciona?"],
    hasPhoto: true,
  },
);
assert.equal(
  normalizedSinglePhoto,
  "Recebi a foto. Dá pra trabalhar nela sim. A ideia é melhorar com cuidado e manter o rosto natural. Essa fica R$10. Quer que eu te mande o Pix?",
);

const dedupedMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse(
    "Entendo, essa foto deve ter um valor enorme pra você.\n\nQuer que eu te mande o PIX?\n\nQuer que eu te mande o PIX?",
    {
      incomingText: "essa foto é da minha avó",
      recentHistory: ["Lead: [Cliente enviou uma foto para restaurar]"],
      hasPhoto: true,
    },
  ),
);
assert.equal(dedupedMessages.length, 2);
assert.equal(dedupedMessages[1], "Quer que eu te mande o PIX?");

console.log("AI safety scenarios OK");
