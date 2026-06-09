/**
 * test-webhook-logic.ts
 *
 * Harness de integração para as funções puras do webhook /webhooks/evolution.
 * Cobre: payload parsing, transfer detection, batch text building, receipt
 * decision, e deduplication — sem chamadas a Prisma, OpenRouter ou Evolution.
 *
 * Executar: npm run test:webhook-logic
 *
 * NOTA SOBRE COBERTURA:
 * waitForInboundSilence() é timing/DB-dependente e não é testada aqui.
 * O que cobrimos é o OUTCOME após o silêncio: como o texto consolidado é
 * construído (buildAiIncomingTextFromBatch) e como as decisões de gate
 * (detectPaymentIntent, detectPaymentReceipt) atuam sobre ele.
 */

import assert from "node:assert/strict";
import {
  extractIncomingPayload,
  extractOutgoingPayload,
  shouldTransferToHuman,
  buildAiIncomingText,
  buildAiIncomingTextFromBatch,
  receiptDecisionFromAnalysis,
  dedupeBatchParts,
  type PendingInboundMessage,
} from "../lib/webhook-helpers";
import {
  PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW,
  PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW,
  PAYMENT_STAGE_RECEIPT_INVALID,
  detectPaymentIntent,
  detectPaymentReceipt,
  hasRecentPixContext,
  PIX_KEY,
} from "../services/ai-safety.service";

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${label}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${label}`);
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// 1. extractIncomingPayload
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ extractIncomingPayload");

test("retorna null para payload sem remetente", () => {
  const result = extractIncomingPayload({ data: { message: { conversation: "oi" } } });
  assert.equal(result, null);
});

test("retorna null para mensagem própria (fromMe=true)", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: true, id: "abc" },
      message: { conversation: "oi" },
      phone: "5519999111111",
    },
  });
  assert.equal(result, null);
});

test("retorna null para mensagens de grupo (@g.us)", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "551234567890-1234567890@g.us", fromMe: false, id: "abc" },
      message: { conversation: "oi grupo" },
      phone: "551234567890",
    },
  });
  assert.equal(result, null);
});

test("retorna null para payload sem texto e sem imagem", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "abc" },
      message: {},
      phone: "5519999111111",
    },
  });
  assert.equal(result, null);
});

test("parseia mensagem de texto simples (formato Baileys bridge)", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "msg001" },
      message: { conversation: "  quanto custa?  " },
      phone: "5519999111111",
      replyTransport: "baileys_bridge",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.text, "quanto custa?");
  assert.equal(result!.type, "TEXT");
  assert.equal(result!.phone, "5519999111111");
  assert.equal(result!.messageId, "msg001");
  assert.equal(result!.replyTransport, "baileys_bridge");
});

test("parseia imageMessage sem caption como 'foto para restaurar'", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "img001" },
      message: { imageMessage: {} },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "IMAGE");
  assert.equal(result!.mediaKind, "IMAGE");
  assert.match(result!.text, /imagem anexada|foto para restaurar/i);
});

test("parseia documentMessage sem caption como 'documento ou comprovante'", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "doc001" },
      message: { documentMessage: {} },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "IMAGE");
  assert.match(result!.text, /documento anexado|documento ou comprovante/i);
  assert.equal(result!.mediaKind, "DOCUMENT");
});

test("parseia audioMessage sem texto como placeholder de áudio", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "aud001" },
      message: { audioMessage: {} },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "AUDIO");
  assert.equal(result!.mediaKind, "AUDIO");
  assert.match(result!.text, /áudio anexado|cliente enviou um áudio/i);
});

test("parseia videoMessage com placeholder de vídeo", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "vid001" },
      message: { videoMessage: {} },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "IMAGE");
  assert.equal(result!.mediaKind, "VIDEO");
  assert.match(result!.text, /vídeo anexado/i);
});

test("parseia stickerMessage com placeholder de sticker", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "stk001" },
      message: { stickerMessage: {} },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "IMAGE");
  assert.equal(result!.mediaKind, "STICKER");
  assert.match(result!.text, /sticker anexado/i);
});

test("parseia mensagem outbound/manual (fromMe=true) para sincronizar no painel", () => {
  const result = extractOutgoingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: true, id: "out001" },
      message: { conversation: "te respondi por aqui" },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.type, "TEXT");
  assert.equal(result!.mediaKind, "TEXT");
  assert.equal(result!.text, "te respondi por aqui");
});

test("normaliza telefone removendo caracteres não-numéricos do JID", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "55 (19) 9 9999-1111@s.whatsapp.net", fromMe: false, id: "x" },
      message: { conversation: "oi" },
      phone: "",
    },
  });
  // Se phone vazio, usa o JID normalizado
  assert.notEqual(result, null);
  assert.doesNotMatch(result!.phone, /[@\s().+-]/);
});

test("extrai mediaBase64 do campo media.mediaBase64", () => {
  const result = extractIncomingPayload({
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "m1" },
      message: { imageMessage: { caption: "comprovante" } },
      media: { mediaBase64: "base64data==", mimetype: "image/jpeg" },
      phone: "5519999111111",
    },
  });
  assert.notEqual(result, null);
  assert.equal(result!.imageUrlOrBase64, "base64data==");
});

// ─────────────────────────────────────────────────────────────────
// 2. shouldTransferToHuman
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ shouldTransferToHuman");

test("'quero falar com humano' → true", () => {
  assert.equal(shouldTransferToHuman("quero falar com humano"), true);
});

test("'falar com atendente' → true", () => {
  assert.equal(shouldTransferToHuman("preciso falar com atendente"), true);
});

test("'pessoa real' → true", () => {
  assert.equal(shouldTransferToHuman("quero falar com uma pessoa real"), true);
});

test("'suporte humano' → true", () => {
  assert.equal(shouldTransferToHuman("preciso de suporte humano"), true);
});

test("mensagem normal → false", () => {
  assert.equal(shouldTransferToHuman("oi, quanto custa a restauração?"), false);
});

test("'quero restaurar' → false", () => {
  assert.equal(shouldTransferToHuman("quero restaurar uma foto"), false);
});

test("'falar com alguém' → true", () => {
  assert.equal(shouldTransferToHuman("posso falar com alguém?"), true);
});

// ─────────────────────────────────────────────────────────────────
// 3. buildAiIncomingText (mensagem única)
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ buildAiIncomingText");

const makeIncoming = (
  type: "TEXT" | "IMAGE" | "AUDIO",
  text: string,
): Parameters<typeof buildAiIncomingText>[0] => ({
  phone: "5519999111111",
  text,
  messageId: "x",
  type,
  mediaKind: type,
});

test("TEXT sem contexto PIX → texto como está", () => {
  const result = buildAiIncomingText(makeIncoming("TEXT", "oi"), false);
  assert.equal(result, "oi");
});

test("IMAGE sem contexto PIX → injeta nota de foto", () => {
  const result = buildAiIncomingText(makeIncoming("IMAGE", "segue a foto"), false);
  assert.match(result, /\[Cliente enviou uma foto para restaurar\]/);
  assert.match(result, /segue a foto/);
});

test("IMAGE COM contexto PIX → NÃO injeta nota de foto (pode ser comprovante)", () => {
  const result = buildAiIncomingText(makeIncoming("IMAGE", "segue o comprovante"), true);
  assert.doesNotMatch(result, /\[Cliente enviou uma foto para restaurar\]/);
  assert.equal(result, "segue o comprovante");
});

test("IMAGE sem contexto PIX mas já tem nota → não duplica", () => {
  const text = "[Cliente enviou uma foto para restaurar]\naquí está";
  const result = buildAiIncomingText(makeIncoming("IMAGE", text), false);
  const count = (result.match(/\[Cliente enviou uma foto para restaurar\]/g) || []).length;
  assert.equal(count, 1);
});

// ─────────────────────────────────────────────────────────────────
// 4. buildAiIncomingTextFromBatch (burst consolidation)
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ buildAiIncomingTextFromBatch — burst consolidation");

function makeMsg(content: string, type: "TEXT" | "IMAGE" | "AUDIO" = "TEXT"): PendingInboundMessage {
  return { id: Math.random().toString(36).slice(2), content, type, createdAt: new Date() };
}

test("mensagem única de texto → retorna o texto", () => {
  const result = buildAiIncomingTextFromBatch([makeMsg("oi, quanto custa?")], false);
  assert.match(result, /oi, quanto custa\?/);
});

test("batch com múltiplas mensagens → une com quebra de linha", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("oi"),
    makeMsg("quero restaurar uma foto"),
  ], false);
  assert.match(result, /oi/);
  assert.match(result, /quero restaurar uma foto/);
});

test("batch com IMAGE sem PIX → inclui nota de foto", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("segue a foto", "IMAGE"),
  ], false);
  assert.match(result, /\[Cliente já enviou uma foto para restaurar\]/);
});

test("batch com IMAGE COM PIX no histórico → NÃO inclui nota de foto", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("segue o comprovante", "IMAGE"),
  ], true); // hasRecentPixInHistory = true
  assert.doesNotMatch(result, /\[Cliente já enviou uma foto para restaurar\]/);
});

test("batch com pergunta de preço → inclui nota de preço", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("quanto custa para restaurar?"),
  ], false);
  assert.match(result, /\[Cliente perguntou o preço\]/);
});

test("batch com referência a familiar → inclui nota emocional", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("foto antiga da minha avó que faleceu"),
  ], false);
  assert.match(result, /\[Cliente mencionou uma lembrança familiar especial\]/);
});

test("batch com mensagem sobre foto específica → inclui nota de foto específica", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("quero essa aqui, pode fazer?"),
  ], false);
  assert.match(result, /\[Cliente está falando de uma foto específica\]/);
});

test("deduplicação de mensagens idênticas no batch", () => {
  const result = buildAiIncomingTextFromBatch([
    makeMsg("oi"),
    makeMsg("oi"),
    makeMsg("oi"),
  ], false);
  const count = (result.match(/\boi\b/g) || []).length;
  assert.equal(count, 1, `esperado 1 ocorrência de "oi", encontrado ${count}`);
});

test("burst: último texto decide os gates (detectPaymentIntent sobre consolidated)", () => {
  // Simula: lead mandou "oi" + "quanto custa?" + "manda o pix"
  const consolidated = buildAiIncomingTextFromBatch([
    makeMsg("oi"),
    makeMsg("quanto custa?"),
    makeMsg("manda o pix"),
  ], false);

  const hasIntent = detectPaymentIntent({ incomingText: consolidated, recentHistory: [] });
  assert.equal(hasIntent, true, "consolidated batch com 'manda o pix' deve detectar intent de pagamento");
});

test("burst: foto fora de contexto PIX NÃO ativa receipt (sem PIX no histórico)", () => {
  // Lead mandou "oi" + photo (sem pix no histórico)
  const consolidated = buildAiIncomingTextFromBatch([
    makeMsg("oi"),
    makeMsg("segue a foto", "IMAGE"),
  ], false);

  const hasReceipt = detectPaymentReceipt({
    incomingText: consolidated,
    recentHistory: [],
    hasPhoto: true,
  });
  assert.equal(hasReceipt, false, "foto sem contexto PIX não deve ativar rota de comprovante");
});

test("burst: foto COM PIX no histórico ativa receipt", () => {
  const consolidated = buildAiIncomingTextFromBatch([
    makeMsg("segue o comprovante", "IMAGE"),
  ], true); // já tem PIX no histórico

  const hasReceipt = detectPaymentReceipt({
    incomingText: consolidated,
    recentHistory: [`Atendente: Chave PIX: ${PIX_KEY}`],
    hasPhoto: true,
  });
  assert.equal(hasReceipt, true, "foto com PIX no histórico deve ativar rota de comprovante");
});

// ─────────────────────────────────────────────────────────────────
// 5. receiptDecisionFromAnalysis
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ receiptDecisionFromAnalysis");

const baseAnalysis = {
  looksLikePixReceipt: true,
  isRandomImage: false,
  recipientNameFound: "Lucas Agostini",
  pixKeyFound: "estudiofotos000@gmail.com",
  bankFound: "Nubank",
  amountFound: "10.00",
  dateFound: "2026-06-08",
  timeFound: "14:30",
  matchesRecipient: true,
  matchesPixKey: true,
  matchesBank: true,
  matchesAmount: true,
  timeLooksValid: true,
  suspiciousOrUnclear: false,
  reason: "Comprovante válido",
  confidence: "high" as const,
};

test("imagem aleatória (isRandomImage=true) → INVALID + pede comprovante visível", () => {
  const decision = receiptDecisionFromAnalysis({ ...baseAnalysis, isRandomImage: true });
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_INVALID);
  assert.match(decision.message, /valor, data e recebedor/i);
  assert.equal(decision.kind, "random_or_unrelated");
});

test("looksLikePixReceipt=false → INVALID", () => {
  const decision = receiptDecisionFromAnalysis({ ...baseAnalysis, looksLikePixReceipt: false });
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_INVALID);
});

test("comprovante coerente (todos os matches) → RECEIPT_RECEIVED_PENDING_REVIEW + mensagem positiva", () => {
  const decision = receiptDecisionFromAnalysis(baseAnalysis);
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW);
  assert.match(decision.message, /Recebi sim/);
  assert.equal(decision.kind, "coherent");
});

test("comprovante com valor errado → RECEIPT_NEEDS_REVIEW", () => {
  const decision = receiptDecisionFromAnalysis({ ...baseAnalysis, matchesAmount: false });
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW);
  assert.equal(decision.kind, "needs_review");
});

test("comprovante suspeito → RECEIPT_NEEDS_REVIEW", () => {
  const decision = receiptDecisionFromAnalysis({ ...baseAnalysis, suspiciousOrUnclear: true });
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW);
});

test("sem banco encontrado mas resto OK → RECEIPT_SENT (bankFound ausente é ignorado)", () => {
  const decision = receiptDecisionFromAnalysis({
    ...baseAnalysis,
    bankFound: null,
    matchesBank: false,
  });
  // matchesBank false com bankFound null → coreMatches = matchesRecipient && matchesPixKey && matchesAmount && (!bankFound)
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW);
});

test("comprovante sem nome do destinatário → RECEIPT_NEEDS_REVIEW", () => {
  const decision = receiptDecisionFromAnalysis({
    ...baseAnalysis,
    matchesRecipient: false,
    recipientNameFound: null,
  });
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_NEEDS_REVIEW);
});

// ─────────────────────────────────────────────────────────────────
// 6. dedupeBatchParts
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ dedupeBatchParts");

test("remove partes vazias", () => {
  const result = dedupeBatchParts(["oi", "", "  ", "tudo bem?"]);
  assert.deepEqual(result, ["oi", "tudo bem?"]);
});

test("remove duplicatas case-insensitive", () => {
  const result = dedupeBatchParts(["OI", "oi", "Oi"]);
  assert.equal(result.length, 1);
});

test("preserva primeira ocorrência com capitalização original", () => {
  const result = dedupeBatchParts(["Quanto custa?", "quanto custa?"]);
  assert.equal(result[0], "Quanto custa?");
});

test("mantém mensagens distintas", () => {
  const result = dedupeBatchParts(["oi", "quanto custa?", "tenho uma foto"]);
  assert.equal(result.length, 3);
});

// ─────────────────────────────────────────────────────────────────
// 7. Fluxo integrado — cenário completo sem DB
// ─────────────────────────────────────────────────────────────────
console.log("\n▶ Cenário integrado (sem DB)");

test("CENÁRIO: lead manda burst de 3 msgs → última inclui 'manda o pix' → PIX intent detectado", () => {
  // 1. Burst simulado — 3 payloads chegam
  const payloads = [
    { data: { key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "m1" }, message: { conversation: "oi" }, phone: "5519999111111" } },
    { data: { key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "m2" }, message: { conversation: "quanto custa?" }, phone: "5519999111111" } },
    { data: { key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "m3" }, message: { conversation: "fechado, manda o pix" }, phone: "5519999111111" } },
  ];

  const parsedMessages = payloads.map(extractIncomingPayload).filter(Boolean);
  assert.equal(parsedMessages.length, 3);

  // 2. Simula que os 3 chegaram antes do silêncio (batchState.messages)
  const batch = parsedMessages.map((m) => makeMsg(m!.text, m!.type));
  const consolidated = buildAiIncomingTextFromBatch(batch, false);

  // 3. Gates: nenhuma transferência
  assert.equal(shouldTransferToHuman(consolidated), false);

  // 4. Gate de pagamento
  assert.equal(detectPaymentIntent({ incomingText: consolidated, recentHistory: [] }), true);
});

test("CENÁRIO: lead manda foto para restaurar → não entra em rota de comprovante", () => {
  const payload = {
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "img1" },
      message: { imageMessage: { caption: "" } },
      phone: "5519999111111",
    },
  };

  const parsed = extractIncomingPayload(payload);
  assert.notEqual(parsed, null);
  assert.equal(parsed!.type, "IMAGE");

  const batch = [makeMsg(parsed!.text, parsed!.type)];
  const consolidated = buildAiIncomingTextFromBatch(batch, false);

  // Simula: NÃO está aguardando comprovante → sem verificação de receipt
  // Mas testamos que mesmo que isWaitingReceipt fosse true,
  // hasRecentPixContext seria false sem PIX no histórico
  const hasPixContext = hasRecentPixContext({
    incomingText: consolidated,
    recentHistory: [],
    hasPhoto: true,
  });
  assert.equal(hasPixContext, false, "foto sem histórico PIX não deve ter contexto de PIX");

  // Portanto o gate  isWaitingReceipt && hasRecentPixInHistory && detectPaymentReceipt
  // seria FALSE (hasRecentPixInHistory = false) → IA normal
});

test("CENÁRIO: lead envia comprovante com dados válidos → stage RECEIPT_RECEIVED_PENDING_REVIEW", () => {
  // Simula a análise de visão já feita → decisão
  const analysis = {
    ...baseAnalysis,
    // Todos os dados batem → comprovante válido
  };
  const decision = receiptDecisionFromAnalysis(analysis);
  assert.equal(decision.stage, PAYMENT_STAGE_RECEIPT_RECEIVED_PENDING_REVIEW);
  assert.match(decision.message, /vou conferir aqui/i);
});

test("CENÁRIO: lead pede transferência para humano → gate ativa", () => {
  const payload = {
    data: {
      key: { remoteJid: "5519999111111@s.whatsapp.net", fromMe: false, id: "t1" },
      message: { conversation: "quero falar com uma pessoa real, por favor" },
      phone: "5519999111111",
    },
  };
  const parsed = extractIncomingPayload(payload);
  assert.notEqual(parsed, null);
  assert.equal(shouldTransferToHuman(parsed!.text), true);
});

// ─────────────────────────────────────────────────────────────────
// Resumo
// ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(`✅ ${passed}/${passed} testes passaram`);
} else {
  console.log(`❌ ${failed} falharam, ${passed} passaram`);
  process.exit(1);
}
