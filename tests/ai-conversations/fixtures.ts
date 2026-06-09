/**
 * tests/ai-conversations/fixtures.ts
 *
 * Cenários reais de conversa convertidos em regressão automatizada.
 * Cada fixture descreve o ESTADO da conversa (histórico, summary, batch atual)
 * e o que a resposta final precisa/não pode conter.
 *
 * `classification` documenta a causa-raiz que o cenário protege contra:
 *   prompt | contexto | estado | guardrail | modelo | bug
 */

import {
  ALWAYS_FORBIDDEN,
  EMOTIONAL_LANGUAGE,
  POST_PHOTO_FORBIDDEN,
  POST_PIX_FORBIDDEN,
  REQUIRED_ACKNOWLEDGES_SERVICE,
  REQUIRED_IN_PIX,
  REQUIRED_PRICE_10,
} from "./asserts";
import type { ConversationState, SimRoute } from "./simulate";

export type Fixture = ConversationState & {
  id: string;
  title: string;
  classification: string;
  description: string;
  expect: {
    route: SimRoute;
    forbidden?: RegExp[];
    required?: RegExp[];
    maxMessages?: number;
  };
};

export const fixtures: Fixture[] = [
  // ── CASO REAL (motivador) ──────────────────────────────────────
  {
    id: "real_case_sim_after_pix",
    title: "CASO REAL: 'Sim' após CTA de Pix não pode pedir foto de novo",
    classification: "estado + guardrail (bug de código)",
    description:
      "Oi → foto → 'tirar a pessoa do meio' → '?' → 'Sim'. Antes: a IA mandava o Pix E pedia a foto de novo. Agora 'Sim' após a oferta de Pix vira Pix determinístico, que nunca pede foto.",
    recentHistory: [
      "Lead: Oi",
      "Lead: Cliente enviou uma foto para restaurar.",
      "Lead: Tirar a pessoa do meio",
      "Atendente: Consigo tirar a pessoa do meio dessa foto sim, fica bem natural.",
      "Atendente: Pra fazer essa, fica R$10. Quer que eu te mande o Pix?",
      "Lead: ?",
      "Atendente: Isso, consigo fazer essa edição. Quer que eu te mande o Pix?",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Sim" }],
    expect: {
      route: "payment_intent",
      required: REQUIRED_IN_PIX,
      forbidden: [...POST_PHOTO_FORBIDDEN, ...POST_PIX_FORBIDDEN],
    },
  },

  // ── A) Edição simples com remoção de pessoa ────────────────────
  {
    id: "a_simple_edit_remove_person",
    title: "A) Edição simples (tirar pessoa) é serviço válido, sem pedir foto",
    classification: "prompt + guardrail",
    description:
      "Lead manda Oi + foto + 'tirar a pessoa do meio'. Deve reconhecer a edição, cobrar R$10, puxar Pix, NÃO pedir foto e NÃO usar linguagem emocional de restauração.",
    recentHistory: [],
    batch: [
      { content: "Oi" },
      { content: "Cliente enviou uma foto para restaurar.", type: "IMAGE" },
      { content: "Tirar a pessoa do meio" },
    ],
    mockModelResponse:
      "Oi! Consigo fazer essa edição sim, dá pra tirar a pessoa do meio mantendo o restante natural.",
    expect: {
      route: "ai_response",
      required: [...REQUIRED_ACKNOWLEDGES_SERVICE, ...REQUIRED_PRICE_10, /pix/i],
      forbidden: [...POST_PHOTO_FORBIDDEN, ...EMOTIONAL_LANGUAGE, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── B) Lead manda "?" após já ter recebido preço ───────────────
  {
    id: "b_question_mark_no_repeat",
    title: "B) Lead manda '?' — não repetir o bloco inteiro",
    classification: "contexto + guardrail (modelo)",
    description:
      "Depois de já ter recebido o preço, o lead manda '?'. A resposta não pode repetir, palavra por palavra, o parágrafo anterior do atendente.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Consigo deixar a imagem bem melhor preservando o visual original da pessoa com cuidado.",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "?" }],
    mockModelResponse:
      "Consigo deixar a imagem bem melhor preservando o visual original da pessoa com cuidado.\n\nÉ só confirmar que eu já sigo.",
    expect: {
      route: "ai_response",
      forbidden: [/preservando o visual original da pessoa com cuidado/i, ...POST_PHOTO_FORBIDDEN],
      maxMessages: 2,
    },
  },

  // ── C) Lead responde "Sim" após CTA Pix ────────────────────────
  {
    id: "c_yes_after_pix_cta",
    title: "C) 'Sim' após CTA de Pix → envia Pix, pede comprovante, sem pedir foto",
    classification: "estado + guardrail",
    description:
      "Após 'Quer que eu te mande o Pix?', o 'Sim' deve enviar o Pix correto, pedir comprovante e NÃO pedir a foto de novo.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Pra fazer essa, fica R$10. Quer que eu te mande o Pix?",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Sim" }],
    expect: {
      route: "payment_intent",
      required: REQUIRED_IN_PIX,
      forbidden: [...POST_PHOTO_FORBIDDEN, ...POST_PIX_FORBIDDEN],
    },
  },

  // ── D) Lead manda imagem DEPOIS do Pix ─────────────────────────
  {
    id: "d_image_after_pix_is_receipt",
    title: "D) Imagem após o Pix é comprovante, nunca nova venda",
    classification: "estado + bug de código",
    description:
      "Depois do Pix enviado, uma imagem é tratada como comprovante. Se não validar, pede comprovante válido — sem pedir Pix nem foto de novo.",
    recentHistory: [
      "Atendente: O Pix é estudiofotos000@gmail.com",
      "Atendente: Nome: Lucas Agostini — Nubank",
      "Atendente: Depois que fizer o Pix e mandar o comprovante, eu começo por aqui.",
    ],
    summary: "[FOTO_RECEBIDA]\n[PAGAMENTO: WAITING_PAYMENT_RECEIPT]",
    batch: [{ content: "Cliente enviou um documento ou comprovante.", type: "IMAGE" }],
    mockReceiptAnalysis: { isRandomImage: true, looksLikePixReceipt: false },
    expect: {
      route: "payment_receipt",
      required: [/comprovante/i],
      forbidden: [...POST_PIX_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
    },
  },

  // ── E) Restauração emocional ───────────────────────────────────
  {
    id: "e_emotional_restoration",
    title: "E) Foto da avó falecida → acolhe, R$10, Pix, sem pedir foto/quantidade",
    classification: "guardrail",
    description:
      "Lead traz foto da avó falecida e pergunta o preço. Deve reconhecer o valor emocional, responder R$10, puxar Pix, NÃO pedir foto e NÃO perguntar quantidade.",
    recentHistory: ["Lead: Oi, queria restaurar uma foto antiga. Como funciona?"],
    batch: [
      { content: "Cliente enviou uma foto para restaurar.", type: "IMAGE" },
      {
        content:
          "Essa foto é da minha avó que faleceu. Quero que fique bonita, sem mudar o rosto. Quanto fica?",
      },
    ],
    mockModelResponse:
      "Recebi a foto, obrigada! Quantas fotos você gostaria de restaurar hoje?",
    expect: {
      route: "ai_response",
      required: [...REQUIRED_PRICE_10, /pix/i, /lembran[cç]a|av[oó]/i],
      forbidden: [...POST_PHOTO_FORBIDDEN, /quantas fotos/i, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── F) Prévia grátis / desconfiança ────────────────────────────
  {
    id: "f_free_preview_denied",
    title: "F) Pede prévia grátis → nega com educação, valida medo, mantém R$10",
    classification: "guardrail",
    description:
      "Lead pede prévia antes de pagar. Deve negar a prévia grátis, validar o receio, reforçar naturalidade, manter R$10 e puxar Pix. Nunca OFERECER prévia.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Pra fazer essa, fica R$10.",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Vocês fazem uma prévia antes de eu pagar?" }],
    mockModelResponse: "Claro, posso fazer uma prévia rápida pra você ver antes.",
    expect: {
      route: "ai_response",
      required: [/n[aã]o faz pr[eé]via/i, ...REQUIRED_PRICE_10, /pix/i, /natural/i],
      forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── G) Preço / concorrente barato ──────────────────────────────
  {
    id: "g_price_competitor_cheaper",
    title: "G) 'Tá caro, tem por 5 reais' → sem desconto, mantém R$10, reforça cuidado",
    classification: "guardrail",
    description:
      "Lead diz que está caro e cita concorrente barato. Não dar desconto, não atacar concorrente, reforçar cuidado, manter R$10 e puxar Pix.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Pra fazer essa, fica R$10.",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Tá meio caro, tem gente fazendo por 5 reais." }],
    mockModelResponse: "Posso fazer por R$5 também pra você, sem problema.",
    expect: {
      route: "ai_response",
      required: [...REQUIRED_PRICE_10, /pix/i, /cuidado/i],
      forbidden: [/desconto/i, /r\$\s*5\b/i, ...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },
];
