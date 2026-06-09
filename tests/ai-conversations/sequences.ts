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
  DEADLINE_PHRASE_FORBIDDEN,
  POST_PHOTO_FORBIDDEN,
  POST_RECEIPT_FORBIDDEN,
  REQUIRED_DEADLINE_24H,
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
