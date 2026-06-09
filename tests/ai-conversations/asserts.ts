/**
 * tests/ai-conversations/asserts.ts
 *
 * Regras duras de saída — o que a resposta final NUNCA pode conter e o que
 * SEMPRE precisa conter, por categoria. Usadas pelos fixtures e pelo runner.
 *
 * Importante sobre "prévia grátis": a frase aparece de forma LEGÍTIMA quando a
 * IA NEGA a prévia ("a gente não faz prévia grátis"). Por isso o proibido aqui
 * é OFERECER prévia, não a palavra isolada.
 */

// Proibidas SEMPRE (independente do estágio).
export const ALWAYS_FORBIDDEN: RegExp[] = [
  /\bcr[eé]ditos?\b/i,
  /at[eé] ficar satisfeito/i,
  /quantas vezes precisar/i,
  /\bme avisa\b/i,
  /quando quiser/i,
  /\bse quiser\b/i,
  /fica [aà] vontade/i,
  // Oferecer prévia/teste grátis (negar é permitido).
  /(fa[cç]o|posso fazer|te (mando|envio|fa[cç]o)|consigo fazer) (uma )?(pr[eé]via|amostra|demonstra[cç][aã]o)/i,
];

// Proibidas quando a foto JÁ foi recebida (não pedir de novo).
export const POST_PHOTO_FORBIDDEN: RegExp[] = [
  /me manda a foto/i,
  /manda a foto/i,
  /envia a foto/i,
  /me envia a foto/i,
  /manda ela aqui/i,
  /me manda aqui que eu vejo/i,
  /manda aqui que eu vejo/i,
  /qual foto/i,
  /qual voc[eê] gostaria de come[cç]ar/i,
  /qual quer come[cç]ar/i,
  /que foto voc[eê] quer/i,
];

// Proibidas depois que o Pix já foi enviado (não reiniciar a venda).
export const POST_PIX_FORBIDDEN: RegExp[] = [
  /quer que eu te mande o pix/i,
  /posso te mandar o pix/i,
  /quer que eu te passe o pix/i,
  /pra fazer[^.!?]*fica\s*r\$\s*10/i,
];

// Obrigatórias quando o Pix é enviado.
export const REQUIRED_IN_PIX: RegExp[] = [
  /estudiofotos000@gmail\.com/i,
  /lucas agostini/i,
  /nubank/i,
  /comprovante/i,
];

// Obrigatórias em edição simples / reconhecimento de serviço.
export const REQUIRED_ACKNOWLEDGES_SERVICE: RegExp[] = [
  /consigo|d[aá] pra|recebi a foto|posso fazer|trabalhar nela/i,
];

export const REQUIRED_PRICE_10: RegExp[] = [/r\$\s*10\b/i];

export const REQUIRED_DEADLINE_24H: RegExp[] = [/at[eé]\s*24h|at[eé]\s*24\s*horas/i];

export const WRONG_DEADLINE_FORBIDDEN: RegExp[] = [
  /2\s*a\s*5\s*dias\s*[uú]teis/i,
  /entre\s*2\s*e\s*5\s*dias/i,
  /alguns\s+dias\s*[uú]teis/i,
  /\b2\s*dias\s*[uú]teis?\b/i,
  /\b5\s*dias\s*[uú]teis?\b/i,
];

export const POST_RECEIPT_FORBIDDEN: RegExp[] = [
  /quer que eu te mande o pix/i,
  /posso te mandar o pix/i,
  /me manda a foto/i,
  /manda a foto/i,
  /envia a foto/i,
  /qual foto/i,
  /me manda o comprovante/i,
  /manda o comprovante/i,
  /envia o comprovante/i,
  /pode me mandar o comprovante/i,
  /pagamento confirmado/i,
  /pagamento aprovado/i,
  /j[aá] caiu/i,
  /j[aá] est[aá] pago/i,
  /j[aá] comecei/i,
];

// Linguagem emocional que NÃO deve aparecer se o cliente não trouxe o contexto.
export const EMOTIONAL_LANGUAGE: RegExp[] = [
  /\bav[oó]\b/i,
  /lembran[cç]a/i,
  /mem[oó]ria/i,
  /falecid/i,
  /saudade/i,
];

export type OutputExpectation = {
  forbidden?: RegExp[];
  required?: RegExp[];
};

export type AssertionFailure = { kind: "forbidden" | "required"; pattern: string; text: string };

/** Avalia a saída final contra as regras; retorna lista de violações (vazia = ok). */
export function evaluateOutput(finalText: string, expectation: OutputExpectation): AssertionFailure[] {
  const failures: AssertionFailure[] = [];

  for (const pattern of expectation.forbidden ?? []) {
    if (pattern.test(finalText)) {
      failures.push({ kind: "forbidden", pattern: pattern.source, text: finalText });
    }
  }

  for (const pattern of expectation.required ?? []) {
    if (!pattern.test(finalText)) {
      failures.push({ kind: "required", pattern: pattern.source, text: finalText });
    }
  }

  return failures;
}
