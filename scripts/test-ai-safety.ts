import assert from "node:assert/strict";
import {
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
  PAYMENT_STAGE_RECEIPT_INVALID,
  PAYMENT_STAGE_RECEIPT_SENT,
  PAYMENT_STAGE_WAITING_RECEIPT,
  PIX_BANK,
  PIX_KEY,
  PIX_NAME,
  SERVICE_IMAGE_SUMMARY_MARKER,
  buildConfusionExplanationResponse,
  buildExpectedPaymentData,
  buildInvalidReceiptResponse,
  buildOfferClarificationResponse,
  buildPostReceiptResponse,
  buildPriceAnswer,
  conversationHasServiceImage,
  detectEmotionalContext,
  detectIfWaitingPaymentReceipt,
  detectIfPaymentReceiptInvalid,
  detectIfPaymentReceiptReceived,
  detectObjectionType,
  detectPaymentIntent,
  detectPaymentReceipt,
  detectPriceQuestion,
  detectServiceType,
  enforceFinalSafety,
  ensureSalesCTA,
  hasRecentPixContext,
  isAffirmativeConfirmation,
  isConfusionSignal,
  lastAssistantMadeOfferOrPrice,
  lastAssistantOfferedPix,
  markServiceImageReceived,
  normalizeCommercialResponse,
  photoAlreadyAskedRecently,
  safeFallbackForStage,
  sanitizeAIResponse,
  sendPixAsSeparateMessage,
  splitResponseIntoWhatsAppMessages,
  summaryHasServiceImage,
  updateConversationStage,
  validatePromptMaster,
} from "../services/ai-safety.service";
import { buildAiDebugSnapshot, maskPhone, redactText } from "../lib/ai-debug";
import { formatRelativeConversationTime } from "../lib/relative-time";

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
  profileId: null,
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
assert.match(previewClose, /Essa fica só R\$10 pra testar\. Quer que eu te mande o Pix\?/);

const trustClose = ensureSalesCTA("Faz sentido ter cuidado mesmo.", {
  incomingText: "não confio",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(trustClose, /Pode começar com 1 foto por R\$10\. Quer que eu te mande o Pix\?/);

const noPhotoClose = ensureSalesCTA("Consigo te ajudar sim 😊", {
  incomingText: "oi, restaura foto?",
  recentHistory: [],
});
assert.match(noPhotoClose, /Me manda a foto aqui que eu vejo pra você\./);

const delayClose = ensureSalesCTA("Claro, sem problema.", {
  incomingText: "vou pensar",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(delayClose, /Confirmando o Pix, eu já separo essa foto pra fazer hoje\. Quer que eu te mande o Pix\?/);

const emotionalClose = ensureSalesCTA("Foto de vó tem um valor enorme mesmo 🥺", {
  incomingText: "foto antiga da minha avó",
  recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
});
assert.match(emotionalClose, /Pra fazer essa foto fica R\$10\. Quer que eu te mande o Pix\?/);

const splitMessages = splitResponseIntoWhatsAppMessages(
  "Entendo seu receio 🥺 eu começo depois da confirmação.\n\nA de 1 foto fica R$ 9,99.\n\nQuer que eu te mande o PIX?",
);
assert.equal(splitMessages.length, 3);

const pixMessages = sendPixAsSeparateMessage();
assert.equal(pixMessages.length, 4);
assert.equal(
  pixMessages[0],
  "Perfeito. O Pix é:",
);
assert.equal(pixMessages[1], "estudiofotos000@gmail.com");
assert.equal(pixMessages[2], `Nome: ${PIX_NAME} — ${PIX_BANK}`);
assert.equal(
  pixMessages[3],
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
assert.match(
  updateConversationStage(
    `[PAGAMENTO: ${PAYMENT_STAGE_WAITING_RECEIPT}]`,
    PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
  ),
  /\[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA\]/,
);
assert.match(
  updateConversationStage(
    `[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW}]`,
    PAYMENT_STAGE_RECEIPT_INVALID,
  ),
  /\[PAGAMENTO: COMPROVANTE_INVALIDO_AGUARDANDO_REENVIO\]/,
);
assert.equal(
  detectIfPaymentReceiptReceived(`[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW}]`),
  true,
);
assert.equal(
  detectIfPaymentReceiptReceived(`[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_SENT}]`),
  true,
);
assert.equal(
  detectIfPaymentReceiptInvalid(`[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_INVALID}]`),
  true,
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
    incomingText: "quero pagar certinho depois",
    recentHistory: ["Lead: tenho interesse na restauração"],
    hasPhoto: false,
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
  "Recebi a foto. Que lembrança especial da sua avó ❤️\n\nDá pra trabalhar nela com cuidado, mantendo o rosto natural e sem deixar artificial.\n\nPra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
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

const specificPhotoPriceMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse(
    "Pode me mandar a foto para eu ver? Quantas fotos você quer restaurar?",
    {
      incomingText:
        "[Cliente já enviou uma foto para restaurar]\n[Cliente está falando de uma foto específica]\nEssa foto é da minha avó que faleceu. Quero que fique bonita, mas sem mudar muito o rosto.\nQuanto fica pra fazer essa?",
      recentHistory: ["Lead: Oi, queria restaurar uma foto antiga. Como funciona?"],
      hasPhoto: true,
    },
  ),
);
assert.deepEqual(specificPhotoPriceMessages, [
  "Recebi a foto. Que lembrança especial da sua avó ❤️",
  "Dá pra trabalhar nela com cuidado, mantendo o rosto natural e sem deixar artificial.",
  "Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
]);

const persistedPhotoNoWhichPhoto = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Qual foto você gostaria de começar?", {
    incomingText: "Quanto fica?",
    recentHistory: [],
    summary: SERVICE_IMAGE_SUMMARY_MARKER,
    hasPhoto: true,
  }),
);
assert.doesNotMatch(persistedPhotoNoWhichPhoto.join("\n"), /qual foto|manda a foto|envia a foto/i);
assert.match(persistedPhotoNoWhichPhoto.join("\n"), /R\$10/);

const deadlineMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Fica pronto entre 2 e 5 dias úteis.", {
    incomingText: "Quanto tempo demora?",
    recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
    summary: SERVICE_IMAGE_SUMMARY_MARKER,
    hasPhoto: true,
  }),
);
assert.match(deadlineMessages.join("\n"), /até 24h|até 24 horas/i);
assert.doesNotMatch(deadlineMessages.join("\n"), /2\s*a\s*5|dias úteis/i);

const postReceiptMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Me manda o comprovante de novo e eu vejo o Pix.", {
    incomingText: "Já paguei",
    recentHistory: [],
    summary: `[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW}]`,
    hasPhoto: true,
  }),
);
assert.match(postReceiptMessages.join("\n"), /recebi o comprovante/i);
assert.match(postReceiptMessages.join("\n"), /conferindo/i);
// "Já paguei" NÃO pergunta sobre tempo → o prazo (24h) NÃO pode aparecer.
// Esse era o bug do caso real: a IA repetia a frase de prazo para tudo.
assert.doesNotMatch(postReceiptMessages.join("\n"), /até 24h|até 24 horas|prazo/i);
assert.doesNotMatch(postReceiptMessages.join("\n"), /me manda o comprovante|quer que eu te mande o pix|manda a foto/i);
assert.doesNotMatch(postReceiptMessages.join("\n"), /pagamento confirmado|já caiu|já comecei/i);

const invalidReceiptMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Quer que eu te mande o Pix de novo?", {
    incomingText: "Já paguei",
    recentHistory: [],
    summary: `[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_INVALID}]`,
    hasPhoto: true,
  }),
);
assert.match(invalidReceiptMessages.join("\n"), /valor/i);
assert.match(invalidReceiptMessages.join("\n"), /data/i);
assert.match(invalidReceiptMessages.join("\n"), /recebedor/i);
assert.doesNotMatch(invalidReceiptMessages.join("\n"), /pix de novo|manda a foto/i);

assert.match(
  buildPostReceiptResponse({
    incomingText: "já paguei\nquanto tempo demora?\nvai ficar bom?\nvocê já começou?",
    summary: `[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW}]`,
  }),
  /recebi o comprovante[\s\S]*24h[\s\S]*(cuidado|pedido já está separado)/i,
);
// ── Pós-comprovante: respostas sociais naturais (caso real cicero) ──
const RECEIPT_RECEIVED_SUMMARY = `[PAGAMENTO: ${PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW}]`;
function postReceipt(incomingText: string, recentHistory: string[] = []) {
  return buildPostReceiptResponse({ incomingText, summary: RECEIPT_RECEIVED_SUMMARY, recentHistory });
}

// nome do titular informado → agradece o aviso, sem prazo
const payerName = postReceipt("Ok esse nome que enviou é da minha esposa.");
assert.match(payerName, /conferir|conferindo/i);
assert.doesNotMatch(payerName, /até 24h|prazo/i);

// agradecimento → agradece de volta, sem prazo
const thanks = postReceipt("Ok obg");
assert.match(thanks, /agrade[cç]|imagina|tamo junto/i);
assert.doesNotMatch(thanks, /até 24h|prazo/i);

// "tá na conta" → confirma conferência, sem prazo
const inAccount = postReceipt("Ok tá na conta kkk");
assert.match(inAccount, /conferir|pedido/i);
assert.doesNotMatch(inAccount, /até 24h|prazo/i);

// vai mandar mais fotos → diz que pode mandar, sem prazo
const morePhotos = postReceipt("E vou procurar mais fotos");
assert.match(morePhotos, /manda|separar|me envia/i);
assert.doesNotMatch(morePhotos, /até 24h|prazo/i);

// elogio/indicação → agradece, sem prazo
const referral = postReceipt("Capricha vou te indicar pra muita gente");
assert.match(referral, /caprichar|pode deixar/i);
assert.doesNotMatch(referral, /até 24h|prazo/i);

// pergunta de tempo → AÍ SIM o prazo de 24h aparece
const deadlineAsked = postReceipt("Quanto tempo demora?");
assert.match(deadlineAsked, /até 24h/i);

// anti-repetição: se a última fala já foi a frase de prazo, não repetir
const deadlineNoRepeat = postReceipt("Quanto tempo demora?", [
  "Atendente: Fica pronto em até 24h após a confirmação do pagamento.",
]);
assert.match(deadlineNoRepeat, /até 24h/i);
assert.notEqual(
  deadlineNoRepeat.trim(),
  "Fica pronto em até 24h após a confirmação do pagamento.",
);

assert.match(buildInvalidReceiptResponse(), /valor, data e recebedor/i);

for (const message of specificPhotoPriceMessages) {
  assert.ok(message.length <= 180, `mensagem longa demais: ${message.length}`);
}

const noRepeatedPhotoRequest = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse(
    "Me manda a foto aqui que eu vejo pra você. Quantas fotos você quer restaurar?",
    {
      incomingText:
        "[Cliente já enviou uma foto para restaurar. Não peça a foto novamente.]\nEssa foto é da minha avó.",
      recentHistory: [],
      hasPhoto: true,
    },
  ),
);
assert.doesNotMatch(noRepeatedPhotoRequest.join("\n"), /manda a foto|envia a foto|quantas fotos/i);
assert.match(noRepeatedPhotoRequest.join("\n"), /R\$10/);

const previewMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Claro, faço uma prévia pra você.", {
    incomingText: "Vocês fazem alguma prévia antes?",
    recentHistory: ["Lead: [Cliente já enviou uma foto para restaurar.]"],
    hasPhoto: true,
  }),
);
assert.deepEqual(previewMessages, [
  "Entendo sua preocupação. A gente não faz prévia grátis porque o trabalho já começa na restauração da foto.",
  "Mas essa fica só R$10 pra testar, com cuidado pra manter o rosto natural. Quer que eu te mande o Pix?",
]);

const aiLookFearMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Posso ajustar até ficar satisfeito, fica à vontade.", {
    incomingText: "Tenho medo de pagar e a foto ficar estranha ou com cara de IA.",
    recentHistory: ["Lead: [Cliente já enviou uma foto para restaurar.]"],
    hasPhoto: true,
  }),
);
assert.deepEqual(aiLookFearMessages, [
  "Entendo total. O foco aqui é justamente não deixar com cara artificial nem mudar o rosto.",
  "Eu trabalho pra melhorar a nitidez e recuperar a foto com naturalidade. Pra essa fica R$10. Quer que eu te mande o Pix?",
]);

const satisfactionMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Ajusto quantas vezes precisar até ficar satisfeito.", {
    incomingText: "Já aconteceu de alguém não gostar do resultado?",
    recentHistory: ["Lead: [Cliente já enviou uma foto para restaurar.]"],
    hasPhoto: true,
  }),
);
assert.deepEqual(satisfactionMessages, [
  "É bem raro, porque o foco é restaurar sem mudar o rosto nem exagerar no efeito.",
  "E se precisar de algum ajuste simples depois, eu corrijo dentro do pedido. Confirmando agora, consigo entregar ainda hoje.",
]);
assert.doesNotMatch(satisfactionMessages.join("\n"), /até ficar satisfeito|quantas vezes precisar/i);

const priceResistanceMessages = splitResponseIntoWhatsAppMessages(
  normalizeCommercialResponse("Posso dar desconto se quiser.", {
    incomingText: "Tá meio caro, tem concorrente fazendo por 5 reais.",
    recentHistory: ["Lead: Essa foto é da minha avó."],
    hasPhoto: true,
  }),
);
assert.deepEqual(priceResistanceMessages, [
  "Entendo. Tem gente que faz mais barato mesmo, mas aqui eu prefiro fazer com cuidado pra não deformar o rosto nem deixar artificial.",
  "Pra essa foto da sua avó fica R$10 e consigo entregar ainda hoje. Quer que eu te mande o Pix?",
]);

const longMessageParts = splitResponseIntoWhatsAppMessages(
  "Recebi sua foto e vou explicar tudo com bastante calma porque a restauração precisa preservar o valor emocional, manter o rosto natural, recuperar detalhes e evitar exageros no efeito para não ficar artificial.\n\nPra essa foto fica R$10. Quer que eu te mande o Pix?",
);
assert.ok(longMessageParts.length <= 3);
for (const message of longMessageParts) {
  assert.ok(message.length <= 180, `mensagem longa demais: ${message.length}`);
}

// ─────────────────────────────────────────────────────────────────
// Novas funções de estado/confirmação (correções do caso real)
// ─────────────────────────────────────────────────────────────────

// Confirmação afirmativa
assert.equal(isAffirmativeConfirmation("Sim"), true);
assert.equal(isAffirmativeConfirmation("pode mandar"), true);
assert.equal(isAffirmativeConfirmation("isso mesmo"), true);
assert.equal(isAffirmativeConfirmation("simples assim, mas tenho dúvida"), false, "não casar 'simples'");
assert.equal(isAffirmativeConfirmation("não quero"), false);

// Detecção da última oferta de Pix do atendente
assert.equal(
  lastAssistantOfferedPix(["Atendente: Pra fazer essa, fica R$10. Quer que eu te mande o Pix?"]),
  true,
);
assert.equal(lastAssistantOfferedPix(["Atendente: Me manda a foto que eu vejo."]), false);
assert.equal(lastAssistantOfferedPix([]), false);

// "Sim" após CTA de Pix conta como intenção de pagamento; sem oferta, não.
assert.equal(
  detectPaymentIntent({
    incomingText: "Sim",
    recentHistory: ["Atendente: Quer que eu te mande o Pix?"],
  }),
  true,
  "'Sim' após oferta de Pix → intenção",
);
assert.equal(detectPaymentIntent({ incomingText: "Sim", recentHistory: [] }), false);
assert.equal(detectPaymentIntent({ incomingText: "bora", recentHistory: [] }), false);
assert.equal(detectPaymentIntent({ incomingText: "pode ser", recentHistory: [] }), false);

// Estado persistente de foto
assert.equal(summaryHasServiceImage("lead quente"), false);
assert.equal(summaryHasServiceImage(`algo\n${SERVICE_IMAGE_SUMMARY_MARKER}`), true);
assert.match(markServiceImageReceived("resumo x"), /\[FOTO_RECEBIDA\]/);
assert.equal(
  markServiceImageReceived(`x\n${SERVICE_IMAGE_SUMMARY_MARKER}`).match(/FOTO_RECEBIDA/g)?.length,
  1,
  "não duplica marca",
);
assert.equal(
  conversationHasServiceImage({ recentHistory: [], summary: SERVICE_IMAGE_SUMMARY_MARKER }),
  true,
  "marca no summary conta como foto recebida",
);
assert.equal(
  conversationHasServiceImage({
    recentHistory: ["Lead: Cliente enviou uma foto para restaurar."],
    summary: null,
  }),
  true,
  "foto no histórico conta",
);
assert.equal(conversationHasServiceImage({ recentHistory: ["Lead: oi"], summary: null }), false);

// Tipo de serviço
assert.equal(detectServiceType({ incomingText: "tirar a pessoa do meio" }), "simple_edit");
assert.equal(detectServiceType({ incomingText: "trocar o fundo pra branco" }), "simple_edit");
assert.equal(detectServiceType({ incomingText: "restaurar essa foto antiga rasgada" }), "restoration");
assert.equal(detectServiceType({ incomingText: "oi tudo bem" }), "unknown");

// Guard pós-Pix: ensureSalesCTA não reabre venda, conduz pro comprovante
const postPixCtxt = {
  incomingText: "ok",
  recentHistory: [
    "Atendente: O Pix é estudiofotos000@gmail.com",
    "Atendente: Nome: Lucas Agostini — Nubank",
  ],
  hasPhoto: true,
};
const postPixCta = ensureSalesCTA("Combinado!", postPixCtxt);
assert.match(postPixCta, /comprovante/i);
assert.doesNotMatch(postPixCta, /quer que eu te mande o pix/i);

// Guard pós-Pix: normalizeCommercialResponse remove re-oferta de Pix e pedido de foto
const postPixNormalized = normalizeCommercialResponse(
  "Quer que eu te mande o Pix? Me manda a foto aqui que eu vejo pra você.",
  postPixCtxt,
);
assert.doesNotMatch(postPixNormalized, /quer que eu te mande o pix/i);
assert.doesNotMatch(postPixNormalized, /manda a foto/i);
assert.match(postPixNormalized, /comprovante/i);

// Remoção de eco: não repetir, palavra por palavra, o parágrafo anterior do atendente
const echoContext = {
  incomingText: "?",
  recentHistory: [
    "Atendente: Consigo deixar a imagem bem melhor preservando o visual original da pessoa com cuidado.",
  ],
  hasPhoto: true,
};
const echoNormalized = normalizeCommercialResponse(
  "Consigo deixar a imagem bem melhor preservando o visual original da pessoa com cuidado.\n\nÉ só confirmar que eu já sigo.",
  echoContext,
);
assert.doesNotMatch(echoNormalized, /preservando o visual original da pessoa com cuidado/i);
assert.match(echoNormalized, /confirmar/i);

// ─────────────────────────────────────────────────────────────────
// ai-debug: mascaramento e redação (nunca vazar dados sensíveis)
// ─────────────────────────────────────────────────────────────────
assert.equal(maskPhone("5519984451744"), "55*********44");
assert.equal(maskPhone(""), "***");
assert.doesNotMatch(redactText("chave sk-or-v1-abc123def456ghi789"), /sk-or-v1-abc123/);
assert.doesNotMatch(
  redactText("conexao postgresql://user:pass@host:5432/db aqui"),
  /postgresql:\/\/user/,
);
assert.match(redactText("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ=="), /\[base64-image\]/);

const snapshot = buildAiDebugSnapshot({
  leadId: "clxyz123456789",
  phone: "5519984451744",
  batchSize: 2,
  flags: {
    hasServiceImage: true,
    askedForPix: false,
    pixAlreadySent: false,
    awaitingReceipt: false,
    isReceiptCandidate: false,
    serviceType: "simple_edit",
  },
  consolidatedText: "tirar a pessoa do meio",
  rawResponse: "Consigo fazer sim",
  finalResponse: "Consigo fazer sim. Pra fazer essa, fica R$10.",
  route: "ai_response",
});
assert.equal(snapshot.phoneMasked, "55*********44");
assert.doesNotMatch(snapshot.leadIdMasked, /456789/);
assert.equal(snapshot.flags.serviceType, "simple_edit");

// ─────────────────────────────────────────────────────────────────
// Confusão: isConfusionSignal + photoAlreadyAskedRecently
// ─────────────────────────────────────────────────────────────────

// sinais de confusão clássicos
assert.equal(isConfusionSignal("não entendi"), true, "não entendi → confusão");
assert.equal(isConfusionSignal("como assim?"), true, "como assim → confusão");
assert.equal(isConfusionSignal("?"), true, "? → confusão");
assert.equal(isConfusionSignal("??"), true, "?? → confusão");
assert.equal(isConfusionSignal("explica"), true, "explica → confusão");
assert.equal(isConfusionSignal("como funciona"), true, "como funciona → confusão");
assert.equal(isConfusionSignal("não sei"), true, "não sei → confusão");
// mensagens normais não são confusão
assert.equal(isConfusionSignal("oi"), false, "oi → não é confusão");
assert.equal(isConfusionSignal("quero restaurar"), false, "quero restaurar → não é confusão");
assert.equal(isConfusionSignal("Sim"), false, "Sim → não é confusão");
assert.equal(isConfusionSignal("Quanto custa?"), false, "Quanto custa? → não é confusão");

// photoAlreadyAskedRecently: true se a IA pediu foto nas últimas falas
assert.equal(
  photoAlreadyAskedRecently([
    "Atendente: Me manda a foto aqui que eu vejo pra você.",
  ]),
  true,
  "última fala do atendente pediu foto → true",
);
assert.equal(
  photoAlreadyAskedRecently([
    "Atendente: Pra fazer essa, fica R$10. Quer que eu te mande o Pix?",
  ]),
  false,
  "última fala do atendente não pediu foto → false",
);
assert.equal(photoAlreadyAskedRecently([]), false, "sem histórico → false");

// buildConfusionExplanationResponse não menciona "me manda a foto" como primeiro CTA
const confusionResp = buildConfusionExplanationResponse();
assert.match(confusionResp, /funciona|processo|foto/i, "explica o processo");
assert.match(confusionResp, /r\$\s*10/i, "menciona R$10");
assert.match(confusionResp, /24h/i, "menciona prazo 24h");
assert.doesNotMatch(confusionResp.split("\n\n")[0], /^me (manda|envia|envie) a foto/i, "primeira linha não começa com pedido de foto");

// Gate de confusão: "não entendi" após pedido de foto → explicação, não repetir pedido
const confusionGateResult = normalizeCommercialResponse(
  "Me envie a foto que você quer restaurar, assim eu consigo avaliar melhor.",
  {
    incomingText: "não entendi",
    recentHistory: [
      "Lead: Oi",
      "Atendente: Consigo te ajudar sim 😊 me manda a foto que você quer restaurar aqui.",
    ],
    hasPhoto: false,
    summary: null,
  },
);
assert.doesNotMatch(confusionGateResult, /^me (manda|envia|envie) a foto/i, "confusão: não começa com pedido de foto");
assert.match(confusionGateResult, /funciona|r\$|pix|24h/i, "confusão: explica o processo ou valor");

// ensureSalesCTA com confusão + foto já pedida: não deve acrescentar CTA de foto
const confusionCtaResult = ensureSalesCTA(
  "Consigo te ajudar sim 😊 me manda a foto que você quer restaurar aqui.",
  {
    incomingText: "não entendi",
    recentHistory: [
      "Atendente: Consigo te ajudar sim 😊 me manda a foto que você quer restaurar aqui.",
    ],
    hasPhoto: false,
    summary: null,
  },
);
// O gate de confusão retorna output sem sobrepor CTA adicional
// (não deve acrescentar um segundo "me manda a foto aqui que eu vejo pra você")
const ctaOccurrences = (confusionCtaResult.match(/me manda a foto/gi) || []).length;
assert.ok(ctaOccurrences <= 1, `CTA de foto não pode aparecer mais de 1× no mesmo turno (apareceu ${ctaOccurrences}×)`);

// ─────────────────────────────────────────────────────────────────
// Caso A — gate de preço (detectPriceQuestion / buildPriceAnswer)
// ─────────────────────────────────────────────────────────────────

assert.equal(detectPriceQuestion("Boa tarde. Gostaria de saber antes o valor"), true);
assert.equal(detectPriceQuestion("quanto custa?"), true);
assert.equal(detectPriceQuestion("quanto fica pra fazer?"), true);
assert.equal(detectPriceQuestion("qual o valor?"), true);
assert.equal(detectPriceQuestion("tem preço?"), true);
// NÃO é pergunta de preço:
assert.equal(detectPriceQuestion("quanto tempo demora?"), false, "prazo não é preço");
assert.equal(detectPriceQuestion("essa foto tem um valor enorme pra mim"), false, "valor emocional não é preço");
assert.equal(detectPriceQuestion("oi, quero restaurar"), false);

// Sem foto → responde o preço primeiro, convida a foto depois.
const priceNoPhoto = buildPriceAnswer({ incomingText: "qual o valor?", recentHistory: [], hasPhoto: false });
assert.match(priceNoPhoto, /r\$\s*10/i, "preço presente");
assert.doesNotMatch(priceNoPhoto.split("\n\n")[0], /^me (manda|envia) a foto|^pode me mandar a foto/i, "primeira linha é o preço, não pedido de foto");

// Com foto → preço + Pix, sem pedir foto.
const priceWithPhoto = buildPriceAnswer({ incomingText: "quanto fica?", recentHistory: [], hasPhoto: true });
assert.match(priceWithPhoto, /r\$\s*10/i);
assert.match(priceWithPhoto, /pix/i);
assert.doesNotMatch(priceWithPhoto, /manda a foto|envia a foto/i);

// ─────────────────────────────────────────────────────────────────
// Caso C — esclarecimento de oferta (lastAssistantMadeOfferOrPrice / buildOfferClarificationResponse)
// ─────────────────────────────────────────────────────────────────

assert.equal(
  lastAssistantMadeOfferOrPrice(["Atendente: Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?"]),
  true,
);
assert.equal(
  lastAssistantMadeOfferOrPrice(["Atendente: Consigo tirar a pessoa do meio dessa foto."]),
  true,
);
assert.equal(lastAssistantMadeOfferOrPrice(["Atendente: Oi, tudo bem?"]), false);
assert.equal(lastAssistantMadeOfferOrPrice([]), false);

// Esclarecimento com foto e edição → reconhece a edição, dá preço, puxa Pix,
// sem repetir o bloco anterior literalmente.
const clarif = buildOfferClarificationResponse({
  incomingText: "?",
  recentHistory: [
    "Atendente: Recebi a foto. Dá pra trabalhar nela.",
    "Atendente: Tirar a pessoa do meio fica natural.",
    "Atendente: Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
  ],
  hasPhoto: true,
});
assert.match(clarif, /r\$\s*10/i);
assert.match(clarif, /pix/i);
assert.doesNotMatch(clarif, /pra fazer essa foto fica r\$10\. quer que eu te mande o pix\?/i, "não repete o bloco literal");

// Esclarecimento pós-Pix → pede comprovante, não reabre venda.
const clarifPostPix = buildOfferClarificationResponse({
  incomingText: "como assim?",
  recentHistory: [
    "Atendente: O Pix é estudiofotos000@gmail.com",
    "Atendente: Nome: Lucas Agostini — Nubank",
  ],
  hasPhoto: true,
  summary: "[PAGAMENTO: WAITING_PAYMENT_RECEIPT]",
});
assert.match(clarifPostPix, /comprovante/i);
assert.doesNotMatch(clarifPostPix, /quer que eu te mande o pix/i);

// ─────────────────────────────────────────────────────────────────
// Caso F — rede de segurança final (enforceFinalSafety)
// ─────────────────────────────────────────────────────────────────

// Tem foto → remove pedido genérico de foto.
const guardedPhoto = enforceFinalSafety("Beleza! Me manda a foto aqui que eu vejo pra você.", {
  incomingText: "e agora?",
  recentHistory: [],
  hasPhoto: true,
});
assert.doesNotMatch(guardedPhoto, /manda a foto|envia a foto/i, "não pode pedir foto quando já tem foto");

// Perguntou preço e a resposta não tem preço → injeta o preço.
const guardedPrice = enforceFinalSafety("Claro, consigo te ajudar com isso!", {
  incomingText: "quanto custa?",
  recentHistory: [],
  hasPhoto: false,
});
assert.match(guardedPrice, /r\$\s*10/i, "injeta o preço quando o cliente perguntou e a resposta não tinha");

// Cliente pergunta COMO enviar a foto → pode falar de foto (não é re-pedido indevido).
const guardedHowTo = enforceFinalSafety("Pode me mandar a foto aqui mesmo no WhatsApp.", {
  incomingText: "como faço pra mandar a foto?",
  recentHistory: [],
  hasPhoto: true,
});
assert.match(guardedHowTo, /foto/i, "quando o cliente pergunta COMO enviar, a resposta pode falar de foto");

// ─────────────────────────────────────────────────────────────────
// Tempo relativo: formatRelativeConversationTime
// ─────────────────────────────────────────────────────────────────

const T0 = new Date("2026-06-09T14:00:00.000Z").getTime();

// < 1 min → "agora"
assert.equal(formatRelativeConversationTime(new Date(T0 - 10_000).toISOString(), T0), "agora", "10s atrás → agora");
assert.equal(formatRelativeConversationTime(new Date(T0 - 30_000).toISOString(), T0), "agora", "30s atrás → agora");
assert.equal(formatRelativeConversationTime(new Date(T0 - 59_999).toISOString(), T0), "agora", "59s atrás → agora");

// 1–59 min → "X min"
assert.equal(formatRelativeConversationTime(new Date(T0 - 60_000).toISOString(), T0), "1 min", "60s → 1 min");
assert.equal(formatRelativeConversationTime(new Date(T0 - 2 * 60_000).toISOString(), T0), "2 min", "2 min → 2 min");
assert.equal(formatRelativeConversationTime(new Date(T0 - 5 * 60_000).toISOString(), T0), "5 min", "5 min → 5 min");
assert.equal(formatRelativeConversationTime(new Date(T0 - 10 * 60_000).toISOString(), T0), "10 min", "10 min → 10 min");
assert.equal(formatRelativeConversationTime(new Date(T0 - 30 * 60_000).toISOString(), T0), "30 min", "30 min → 30 min");
assert.equal(formatRelativeConversationTime(new Date(T0 - 59 * 60_000).toISOString(), T0), "59 min", "59 min → 59 min");

// 1–23 h → "X h"
assert.equal(formatRelativeConversationTime(new Date(T0 - 60 * 60_000).toISOString(), T0), "1 h", "1h → 1 h");
assert.equal(formatRelativeConversationTime(new Date(T0 - 2 * 3600_000).toISOString(), T0), "2 h", "2h → 2 h");
assert.equal(formatRelativeConversationTime(new Date(T0 - 23 * 3600_000).toISOString(), T0), "23 h", "23h → 23 h");

// 1–6 d → "X d"
assert.equal(formatRelativeConversationTime(new Date(T0 - 24 * 3600_000).toISOString(), T0), "1 d", "1d → 1 d");
assert.equal(formatRelativeConversationTime(new Date(T0 - 2 * 86400_000).toISOString(), T0), "2 d", "2d → 2 d");

// ≥ 7 d → "dd/MM"
assert.match(formatRelativeConversationTime(new Date(T0 - 7 * 86400_000).toISOString(), T0), /\d{2}\/\d{2}/, "7d → dd/MM");

// clock skew (futuro) → "agora"
assert.equal(formatRelativeConversationTime(new Date(T0 + 5_000).toISOString(), T0), "agora", "clock skew → agora");

// nunca mostra "2 min" para mensagem recém-chegada (diffMs = 5s)
const recentMsg = new Date(T0 - 5_000).toISOString();
assert.notEqual(formatRelativeConversationTime(recentMsg, T0), "2 min", "5s atrás nunca → 2 min");

console.log("AI safety scenarios OK");
