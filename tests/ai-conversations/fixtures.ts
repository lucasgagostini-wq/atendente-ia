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
  POST_RECEIPT_FORBIDDEN,
  REQUIRED_ACKNOWLEDGES_SERVICE,
  REQUIRED_DEADLINE_24H,
  REQUIRED_IN_PIX,
  REQUIRED_PRICE_10,
  WRONG_DEADLINE_FORBIDDEN,
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
      // Agora tratado por gate determinístico (esclarece a oferta, não repete o
      // bloco). O modelo nem chega a ser chamado.
      route: "offer_clarification",
      required: [/r\$\s*10|pix/i],
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

  // ── H) Lead quente vindo de anúncio ───────────────────────────
  {
    id: "h_ad_lead_without_photo_asks_photo_first",
    title: "H) Lead de anúncio sem foto → trata como restauração e pede a foto",
    classification: "prompt + contexto",
    description:
      "Mensagem pronta de anúncio deve ser tratada como intenção clara de restaurar foto antiga. Sem foto recebida, pede a foto curto e não manda Pix antes.",
    recentHistory: [],
    batch: [
      {
        content:
          "Olá, vi o anúncio sobre restauração de fotos e gostaria de restaurar uma imagem.",
      },
    ],
    mockModelResponse: "Claro, eu te ajudo com restauração de foto antiga.",
    expect: {
      route: "ai_response",
      required: [/restaura/i, /foto/i],
      forbidden: [/pix/i, ...ALWAYS_FORBIDDEN],
      maxMessages: 2,
    },
  },

  // ── I) Foto persistida no summary ─────────────────────────────
  {
    id: "h_photo_persisted_never_ask_which_photo",
    title: "H) Foto já recebida no estado → nunca perguntar qual foto começar",
    classification: "estado + guardrail",
    description:
      "Mesmo várias mensagens depois, [FOTO_RECEBIDA] deve impedir pedido de foto/qual foto. Se perguntar preço, responde R$10 e CTA de Pix.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Recebi a foto. Dá pra trabalhar nela sim.",
      "Lead: Quero fazer essa.",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Quanto fica pra fazer?" }],
    mockModelResponse: "Qual foto você gostaria de começar?",
    expect: {
      route: "ai_response",
      required: [...REQUIRED_PRICE_10, /pix/i],
      forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── J) Prazo oficial ──────────────────────────────────────────
  {
    id: "i_deadline_is_24h",
    title: "I) Pergunta prazo → sempre até 24h, nunca 2 a 5 dias úteis",
    classification: "guardrail + prompt",
    description:
      "Se o modelo tentar responder prazo antigo, o guardrail força o prazo oficial.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Quanto tempo demora?" }],
    mockModelResponse: "Geralmente fica pronto entre 2 e 5 dias úteis.",
    expect: {
      route: "ai_response",
      required: REQUIRED_DEADLINE_24H,
      forbidden: [...WRONG_DEADLINE_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── J) Comprovante recebido persistente ───────────────────────
  {
    id: "j_receipt_received_then_already_paid",
    title: "J) Comprovante já recebido + 'já paguei' → não pedir comprovante de novo",
    classification: "estado persistente",
    description:
      "Depois que o comprovante entrou no summary, 'já paguei' deve reconhecer recebimento e conferência, sem pedir comprovante, Pix ou foto.",
    recentHistory: [
      "Atendente: Perfeito. O Pix é:",
      "Atendente: estudiofotos000@gmail.com",
      "Atendente: Nome: Lucas Agostini — Nubank",
      "Lead: Cliente enviou um documento ou comprovante.",
      "Atendente: Recebi sim 😊 vou conferir aqui e, estando certinho, sigo por aqui com você.",
    ],
    summary:
      "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA]",
    batch: [{ content: "Já paguei" }],
    mockModelResponse: "Me manda o comprovante de novo por favor.",
    expect: {
      route: "post_receipt_state",
      required: [/recebi o comprovante/i, /conferindo/i],
      forbidden: [...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
      maxMessages: 3,
    },
  },

  {
    id: "k_receipt_received_multiple_questions",
    title: "K) Pós-comprovante com várias dúvidas → mantém contexto de conferência",
    classification: "estado persistente + contexto",
    description:
      "Várias dúvidas depois do comprovante não podem voltar para venda. Deve falar de conferência, prazo e cuidado.",
    recentHistory: [
      "Atendente: Perfeito. O Pix é:",
      "Atendente: estudiofotos000@gmail.com",
      "Lead: Cliente enviou um documento ou comprovante.",
    ],
    summary:
      "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA]",
    batch: [
      { content: "já paguei" },
      { content: "quanto tempo demora?" },
      { content: "vai ficar bom?" },
      { content: "você já começou?" },
    ],
    mockModelResponse: "Quer que eu te mande o Pix e qual foto você quer começar?",
    expect: {
      route: "post_receipt_state",
      required: [/recebi o comprovante|pedido j[aá] est[aá] separado/i, ...REQUIRED_DEADLINE_24H, /cuidado|natural/i],
      forbidden: [...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN, ...WRONG_DEADLINE_FORBIDDEN],
      maxMessages: 3,
    },
  },

  // ── M) Áudio sem transcrição ──────────────────────────────────
  {
    id: "m_audio_without_transcription_asks_text",
    title: "M) Áudio sem transcrição → pede confirmação por escrito, não inventa",
    classification: "estado + guardrail (mídia)",
    description:
      "Cliente manda só um áudio (sem transcrição). A IA não pode inventar o conteúdo: responde curto pedindo confirmação por escrito.",
    recentHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Recebi a foto. Dá pra trabalhar nela sim.",
    ],
    summary: "[FOTO_RECEBIDA]",
    batch: [{ content: "Cliente enviou um áudio.", type: "AUDIO" }],
    expect: {
      route: "audio_clarification",
      required: [/[aá]udio/i, /por escrito|confirma/i],
      forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
      maxMessages: 1,
    },
  },

  // ── N) "não entendi" após pedido de foto ─────────────────────
  {
    id: "n_confusion_after_photo_request_explains",
    title: "N) 'Não entendi' após pedido de foto → explica processo, não repete pedido",
    classification: "confusão + anti-repetição (bug real)",
    description:
      "Lead diz 'não entendi' depois da IA já ter pedido a foto. A IA NÃO pode responder 'me envie a foto' de novo. Deve explicar como funciona em 3 partes curtas.",
    recentHistory: [
      "Lead: Oi",
      "Atendente: Consigo te ajudar sim 😊 me manda a foto que você quer restaurar aqui.",
    ],
    summary: null,
    batch: [{ content: "não entendi" }],
    mockModelResponse: "Me envie a foto que você quer restaurar, assim eu consigo avaliar melhor. 😊",
    expect: {
      route: "ai_response",
      required: [/funciona|foto|r\$\s*10|pix|24h/i],
      forbidden: [
        /^me (manda|envia|envie) a foto/i,
        /^manda (aqui|a foto)/i,
        /manda ela aqui/i,
        ...POST_PHOTO_FORBIDDEN,
        ...ALWAYS_FORBIDDEN,
      ],
      maxMessages: 3,
    },
  },

  // ── O) Anti-repetição: foto pedida 2× seguidas ───────────────
  {
    id: "o_photo_cta_not_repeated_twice",
    title: "O) CTA de foto não pode aparecer idêntico em 2 mensagens seguidas",
    classification: "anti-repetição (guardrail)",
    description:
      "O atendente já pediu 'me manda a foto' e o lead ainda não mandou. A próxima resposta não pode usar exatamente a mesma frase. Deve variar o CTA.",
    recentHistory: [
      "Lead: Oi, quero restaurar uma foto.",
      "Atendente: Me manda a foto aqui que eu vejo pra você.",
    ],
    summary: null,
    batch: [{ content: "Pode ser qualquer foto?" }],
    mockModelResponse: "Me manda a foto aqui que eu vejo pra você.",
    expect: {
      route: "ai_response",
      // O guardrail de anti-repetição deve trocar a frase idêntica do atendente
      // por uma variação — "me manda a foto aqui que eu vejo pra você" (idêntico
      // ao último do atendente) NÃO pode aparecer na resposta.
      forbidden: [/me manda a foto aqui que eu vejo pra voc[eê]/i, ...ALWAYS_FORBIDDEN],
      maxMessages: 3,
    },
  },

  {
    id: "l_invalid_receipt_then_insists_paid",
    title: "L) Comprovante inválido + insiste 'já paguei' → pedir comprovante visível",
    classification: "estado persistente",
    description:
      "Estado inválido permite pedir reenvio, mas sem Pix, sem foto e sem reiniciar venda.",
    recentHistory: [
      "Atendente: Perfeito. O Pix é:",
      "Atendente: estudiofotos000@gmail.com",
      "Lead: Cliente enviou uma imagem aleatória.",
      "Atendente: Recebi a imagem, mas pra confirmar preciso do comprovante com valor, data e recebedor visíveis.",
    ],
    summary:
      "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_INVALIDO_AGUARDANDO_REENVIO]",
    batch: [{ content: "Já paguei" }],
    mockModelResponse: "Quer que eu te mande o Pix de novo?",
    expect: {
      route: "invalid_receipt_state",
      required: [/valor/i, /data/i, /recebedor/i],
      forbidden: [...POST_PIX_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
      maxMessages: 2,
    },
  },
];
