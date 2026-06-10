/**
 * tests/ai-conversations/sequences.ts
 *
 * Cenários MULTI-TURNO. Diferente dos fixtures (um turno = uma resposta), aqui
 * cada turno do cliente é processado em sequência e a resposta da IA é
 * acrescentada ao histórico antes do próximo turno.
 *
 * Isso captura bugs que só aparecem ENTRE turnos — especialmente a repetição:
 * a IA mandava "O prazo é de até 24h..." várias vezes seguidas no pós-comprovante.
 * Um teste de turno único não pega isso; um teste de sequência sim.
 */

import {
  ALWAYS_FORBIDDEN,
  DEADLINE_PHRASE_FORBIDDEN,
  POST_PHOTO_FORBIDDEN,
  POST_PIX_FORBIDDEN,
  POST_RECEIPT_FORBIDDEN,
  REQUIRED_ACKNOWLEDGES_SERVICE,
  REQUIRED_DEADLINE_24H,
  REQUIRED_PRICE_10,
} from "./asserts";
import type { SimMessage, SimRoute } from "./simulate";

export type SequenceTurn = {
  /** Mensagens que o cliente acabou de enviar neste turno. */
  batch: SimMessage[];
  mockModelResponse?: string;
  mockReceiptAnalysis?: Record<string, unknown>;
  label: string;
  expect: {
    route?: SimRoute;
    required?: RegExp[];
    forbidden?: RegExp[];
    maxMessages?: number;
  };
};

export type Sequence = {
  id: string;
  title: string;
  description: string;
  classification: string;
  initialHistory: string[];
  summary?: string | null;
  turns: SequenceTurn[];
  /**
   * Asserções sobre a sequência inteira:
   * - `phraseAtMostOnce`: nenhuma dessas frases (normalizadas) pode aparecer
   *   em mais de N turnos no total.
   * - `noConsecutiveDuplicates`: dois turnos seguidos não podem ter a mesma
   *   resposta final.
   */
  globals?: {
    phraseAtMostOnce?: { pattern: RegExp; max: number }[];
    noConsecutiveDuplicates?: boolean;
  };
};

const POST_RECEIPT_HISTORY = [
  "Lead: Vi o anúncio de vocês, queria restaurar uma foto antiga",
  "Lead: Cliente enviou uma foto para restaurar.",
  "Lead: Dá pra restaurar e tirar o padre pra deixar minha mãe me abraçando?",
  "Atendente: Consigo sim restaurar essa foto e fazer essa montagem com cuidado.",
  "Atendente: São 2 serviços nessa foto, fica R$18. Quer que eu te mande o Pix?",
  "Lead: Sim",
  "Atendente: Perfeito. O Pix é:",
  "Atendente: estudiofotos000@gmail.com",
  "Atendente: Nome: Lucas Agostini — Nubank",
  "Lead: Cliente enviou um documento ou comprovante.",
  "Atendente: Recebi aqui 😊 vou conferir certinho os dados do pagamento antes de começar, tá?",
];

export const sequences: Sequence[] = [
  {
    id: "cicero_real_sale",
    title: "CASO REAL cicero: pós-comprovante natural, sem repetir prazo",
    classification: "estado persistente + anti-repetição (bug real)",
    description:
      "Venda de madrugada. Após o comprovante, o cliente manda 5 mensagens sociais/operacionais. Antes: a IA respondia quase tudo com 'O prazo é de até 24h...'. Agora cada mensagem tem resposta natural e o prazo nunca aparece (ninguém perguntou de tempo).",
    initialHistory: POST_RECEIPT_HISTORY,
    summary: "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA]",
    turns: [
      {
        label: "informa que o nome do comprovante é da esposa",
        batch: [{ content: "Ok esse nome que enviou é da minha esposa." }],
        expect: {
          route: "post_receipt_state",
          required: [/conferir|conferindo/i, /comprovante|dados/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "agradece",
        batch: [{ content: "Ok obg" }],
        expect: {
          route: "post_receipt_state",
          required: [/agrade[cç]|imagina|tamo junto|acompanhando/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "pergunta se confirmou o pagamento",
        batch: [{ content: "Já fiz o pagamento confirmou?" }],
        expect: {
          route: "post_receipt_state",
          required: [/recebi o comprovante|comprovante já chegou/i, /conferindo|conferir/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "confirma que saiu da conta",
        batch: [{ content: "Ok tá na conta kkk" }],
        expect: {
          route: "post_receipt_state",
          required: [/conferir|pedido/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_RECEIPT_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "diz que vai procurar mais fotos",
        batch: [{ content: "E vou procurar mais fotos" }],
        expect: {
          route: "post_receipt_state",
          required: [/manda|separar|me envia/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
    ],
    globals: {
      // Ninguém perguntou de tempo → a frase de prazo NUNCA pode aparecer.
      phraseAtMostOnce: [{ pattern: /at[eé]\s*24h/i, max: 0 }],
      noConsecutiveDuplicates: true,
    },
  },

  {
    id: "deadline_then_acks_no_repeat",
    title: "Pergunta prazo 1x, depois só 'ok' → não repetir a frase de prazo",
    classification: "anti-repetição",
    description:
      "O cliente pergunta o prazo uma vez (resposta correta com 24h). Depois manda só confirmações curtas. A frase de prazo não pode se repetir.",
    initialHistory: POST_RECEIPT_HISTORY,
    summary: "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA]",
    turns: [
      {
        label: "pergunta quanto tempo demora",
        batch: [{ content: "Quanto tempo demora?" }],
        expect: {
          route: "post_receipt_state",
          required: REQUIRED_DEADLINE_24H,
          maxMessages: 2,
        },
      },
      {
        label: "responde ok",
        batch: [{ content: "Ok" }],
        expect: {
          route: "post_receipt_state",
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_RECEIPT_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "elogia e diz que vai indicar",
        batch: [{ content: "Capricha vou te indicar pra muita gente" }],
        expect: {
          route: "post_receipt_state",
          required: [/caprichar|pode deixar/i],
          forbidden: [...DEADLINE_PHRASE_FORBIDDEN, ...POST_PHOTO_FORBIDDEN],
          maxMessages: 2,
        },
      },
    ],
    globals: {
      phraseAtMostOnce: [{ pattern: /at[eé]\s*24h/i, max: 1 }],
      noConsecutiveDuplicates: true,
    },
  },

  {
    id: "confusion_after_photo_request",
    title: "Lead diz 'não entendi' → explica processo, sem repetir pedido de foto",
    classification: "confusão + anti-repetição (bug real)",
    description:
      "Lead manda 'oi', IA pede foto, lead diz 'não entendi', IA responde de novo com 'me envie a foto'. Antes: a IA repetia sempre 'me manda a foto'. Agora deve explicar o processo.",
    initialHistory: [],
    summary: null,
    turns: [
      {
        label: "oi — IA deve pedir a foto (normal)",
        batch: [{ content: "Oi" }],
        expect: {
          route: "ai_response",
          forbidden: [...ALWAYS_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "não entendi — IA deve explicar processo, sem repetir pedido de foto",
        batch: [{ content: "não entendi" }],
        expect: {
          route: "ai_response",
          required: [/funciona|foto|r\$|pix/i],
          forbidden: [
            /^me (manda|envia|envie) a foto/i,
            /^manda (aqui|a foto)/i,
            ...ALWAYS_FORBIDDEN,
          ],
          maxMessages: 3,
        },
      },
    ],
    globals: {
      noConsecutiveDuplicates: true,
    },
  },

  // ── CASO A — preço antes da foto ───────────────────────────────
  {
    id: "price_before_photo",
    title: "A) Pergunta o valor antes de mandar foto → responde o preço, não fica só pedindo foto",
    classification: "gate ausente (preço) — bug real",
    description:
      "Lead de anúncio pergunta o preço antes de enviar a foto. Antes: a IA respondia só 'pode mandar a foto, fico aguardando'. Agora responde o preço direto (R$10) e só depois convida a mandar a foto.",
    initialHistory: [],
    summary: null,
    turns: [
      {
        label: "anúncio inicial — IA pede a foto (normal)",
        batch: [
          {
            content:
              "Olá, vi o anúncio sobre restauração de fotos e gostaria de restaurar uma imagem.",
          },
        ],
        mockModelResponse:
          "Claro! Pode me enviar a foto que deseja restaurar? Assim consigo te informar o valor.",
        expect: {
          route: "ai_response",
          forbidden: [...ALWAYS_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "pergunta o valor antes da foto → preço direto",
        batch: [{ content: "Boa tarde. Gostaria de saber antes o valor" }],
        expect: {
          route: "price_answer",
          required: [/r\$\s*10/i],
          // não pode ficar só pedindo foto (uma resposta só-foto não teria R$10).
          forbidden: [...ALWAYS_FORBIDDEN],
          maxMessages: 2,
        },
      },
    ],
    globals: {
      noConsecutiveDuplicates: true,
    },
  },

  // ── CASO B — texto + imagem no mesmo burst ──────────────────────
  {
    id: "image_same_burst_no_reask",
    title: "B) Texto + imagem no mesmo batch → reconhece a foto, nunca pede foto de novo",
    classification: "batch/mídia — bug real",
    description:
      "Cliente manda 'Bom dia' e a imagem quase juntos. Quando texto+imagem chegam no MESMO batch, a IA não pode pedir a foto: reconhece e informa R$10. (O batching texto+imagem é garantido pelo sinal MEDIA_PENDING do bridge — testado em test:webhook-logic.)",
    initialHistory: [],
    summary: null,
    turns: [
      {
        label: "bom dia + imagem no mesmo burst",
        batch: [
          { content: "Bom dia" },
          { content: "Cliente enviou uma foto para restaurar.", type: "IMAGE" },
        ],
        mockModelResponse:
          "Bom dia! Me manda a foto que você quer restaurar aqui que eu vejo pra você.",
        expect: {
          route: "ai_response",
          required: [...REQUIRED_ACKNOWLEDGES_SERVICE, ...REQUIRED_PRICE_10],
          forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
          maxMessages: 3,
        },
      },
    ],
  },

  // ── CASO C — "?" depois da oferta ───────────────────────────────
  {
    id: "question_mark_after_offer",
    title: "C) '?' depois da oferta → esclarece, não repete o bloco nem reinicia",
    classification: "gate ausente (esclarecimento) — bug real",
    description:
      "Foto recebida, IA já ofertou (R$10 + Pix). Lead manda '?'. Antes: a IA repetia o bloco inteiro. Agora esclarece a oferta de forma curta e diferente. Vale também para 'como assim?'.",
    initialHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Lead: Tirar a pessoa do meio",
      "Atendente: Recebi a foto. Dá pra trabalhar nela.",
      "Atendente: Mantendo o rosto natural.",
      "Atendente: Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
    ],
    summary: "[FOTO_RECEBIDA]",
    turns: [
      {
        label: "lead manda só '?'",
        batch: [{ content: "?" }],
        expect: {
          route: "offer_clarification",
          required: [/r\$\s*10|pix/i],
          forbidden: [
            /pra fazer essa foto fica r\$10\. quer que eu te mande o pix\?/i,
            ...POST_PHOTO_FORBIDDEN,
            ...ALWAYS_FORBIDDEN,
          ],
          maxMessages: 2,
        },
      },
      {
        label: "lead insiste 'como assim?'",
        batch: [{ content: "como assim?" }],
        expect: {
          route: "offer_clarification",
          required: [/r\$\s*10|pix|comprovante/i],
          forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
          maxMessages: 2,
        },
      },
    ],
  },

  // ── CASO D — Pix depois da foto ─────────────────────────────────
  {
    id: "pix_after_photo_no_reask",
    title: "D) Depois do Pix, com foto já recebida → pede comprovante, nunca a foto",
    classification: "estado persistente de foto — bug real",
    description:
      "Pix já enviado e foto já recebida. Mesmo que o modelo tente pedir a foto de novo, a resposta não pode pedir foto: pede o comprovante e mantém o contexto.",
    initialHistory: [
      "Lead: Cliente enviou uma foto para restaurar.",
      "Atendente: Pra fazer essa foto fica R$10. Quer que eu te mande o Pix?",
      "Lead: Sim",
      "Atendente: Perfeito. O Pix é:",
      "Atendente: estudiofotos000@gmail.com",
      "Atendente: Nome: Lucas Agostini — Nubank",
    ],
    summary: "[FOTO_RECEBIDA]\n[PAGAMENTO: WAITING_PAYMENT_RECEIPT]",
    turns: [
      {
        label: "lead pergunta 'e agora?' e o modelo tenta repedir a foto",
        batch: [{ content: "E agora?" }],
        mockModelResponse: "Beleza! Me manda a foto aqui que eu vejo pra você.",
        expect: {
          route: "ai_response",
          required: [/comprovante/i],
          forbidden: [...POST_PHOTO_FORBIDDEN, ...POST_PIX_FORBIDDEN],
          maxMessages: 3,
        },
      },
    ],
  },

  // ── CASO E — áudio sem transcrição ──────────────────────────────
  {
    id: "audio_without_transcription_seq",
    title: "E) Áudio sem transcrição → pede confirmação por escrito, não inventa",
    classification: "mídia (áudio)",
    description:
      "Cliente manda só um áudio. A IA não pode fingir que entendeu: pede confirmação por escrito.",
    initialHistory: ["Lead: Oi"],
    summary: null,
    turns: [
      {
        label: "áudio sem transcrição",
        batch: [{ content: "Cliente enviou um áudio.", type: "AUDIO" }],
        expect: {
          route: "audio_clarification",
          required: [/[aá]udio/i, /por escrito|confirma/i],
          forbidden: [...POST_PHOTO_FORBIDDEN, ...ALWAYS_FORBIDDEN],
          maxMessages: 1,
        },
      },
    ],
  },

  {
    id: "repeated_payment_questions_vary",
    title: "Duas perguntas seguidas sobre pagamento → respostas variam",
    classification: "anti-repetição",
    description:
      "Cliente pergunta sobre o pagamento duas vezes seguidas. As duas respostas reconhecem o comprovante, mas não podem ser idênticas palavra por palavra.",
    initialHistory: POST_RECEIPT_HISTORY,
    summary: "[FOTO_RECEBIDA]\n[PAGAMENTO: COMPROVANTE_RECEBIDO_AGUARDANDO_CONFERENCIA]",
    turns: [
      {
        label: "já paguei",
        batch: [{ content: "Já paguei" }],
        expect: {
          route: "post_receipt_state",
          required: [/recebi o comprovante|comprovante já chegou/i],
          forbidden: [...POST_RECEIPT_FORBIDDEN],
          maxMessages: 2,
        },
      },
      {
        label: "confirmou mesmo?",
        batch: [{ content: "Confirmou mesmo?" }],
        expect: {
          route: "post_receipt_state",
          required: [/recebi o comprovante|comprovante já chegou|conferindo/i],
          forbidden: [...POST_RECEIPT_FORBIDDEN],
          maxMessages: 2,
        },
      },
    ],
    globals: {
      noConsecutiveDuplicates: true,
    },
  },
];
