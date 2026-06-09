/**
 * tests/ai-conversations/run.ts
 *
 * Runner de regressão de conversas. Roda todos os fixtures pelo simulador puro
 * (sem WhatsApp/DB/LLM) e valida rota, nº de mensagens e regras de saída.
 *
 *   npm run test:ai-conversations
 *
 * Para adicionar um caso novo: edite tests/ai-conversations/fixtures.ts.
 * Para rodar com IA real (opcional/manual): npm run eval:ai-live (ver docs).
 */

import { fixtures } from "./fixtures";
import { sequences } from "./sequences";
import { simulateConversation } from "./simulate";
import type { PixReceiptAnalysis } from "../../services/payment-receipt.service";
import { evaluateOutput } from "./asserts";

let passed = 0;
let failed = 0;

console.log("\n▶ Regressão de conversas de IA (simulação pura)\n");

for (const fixture of fixtures) {
  const result = simulateConversation(fixture);
  const problems: string[] = [];

  // 1. Rota esperada (orquestração)
  if (result.route !== fixture.expect.route) {
    problems.push(`rota: esperado "${fixture.expect.route}", obtido "${result.route}"`);
  }

  // 2. Nº máximo de mensagens (manter curto)
  if (fixture.expect.maxMessages != null && result.messages.length > fixture.expect.maxMessages) {
    problems.push(`mensagens: ${result.messages.length} > máx ${fixture.expect.maxMessages}`);
  }

  // 3. Regras de saída (frases proibidas/obrigatórias)
  const failures = evaluateOutput(result.finalText, {
    forbidden: fixture.expect.forbidden,
    required: fixture.expect.required,
  });
  for (const failure of failures) {
    if (failure.kind === "forbidden") {
      problems.push(`proibido encontrado: /${failure.pattern}/`);
    } else {
      problems.push(`obrigatório ausente: /${failure.pattern}/`);
    }
  }

  // 4. Limite duro de tamanho por mensagem (WhatsApp curto)
  for (const message of result.messages) {
    if (message.length > 180) {
      problems.push(`mensagem longa demais (${message.length} chars): "${message.slice(0, 40)}…"`);
    }
  }

  if (problems.length === 0) {
    passed++;
    console.log(`  ✅ ${fixture.id} — ${fixture.title}`);
    console.log(`     causa coberta: ${fixture.classification} | rota: ${result.route} | msgs: ${result.messages.length}`);
  } else {
    failed++;
    console.error(`  ❌ ${fixture.id} — ${fixture.title}`);
    console.error(`     causa: ${fixture.classification}`);
    for (const problem of problems) {
      console.error(`     · ${problem}`);
    }
    console.error(`     saída final:\n       ${result.finalText.replace(/\n/g, "\n       ")}`);
  }
}

// ── Sequências multi-turno ──────────────────────────────────────────
// Cada turno do cliente é processado com o histórico acumulado (incluindo as
// respostas da IA dos turnos anteriores). Pega bugs de repetição entre turnos.
console.log("\n▶ Sequências multi-turno (pós-comprovante / anti-repetição)\n");

function normalizeFinal(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

for (const sequence of sequences) {
  const workingHistory = [...sequence.initialHistory];
  const turnFinals: string[] = [];
  const problems: string[] = [];

  for (const turn of sequence.turns) {
    const result = simulateConversation({
      recentHistory: [...workingHistory],
      summary: sequence.summary,
      batch: turn.batch,
      mockModelResponse: turn.mockModelResponse,
      mockReceiptAnalysis: turn.mockReceiptAnalysis as Partial<PixReceiptAnalysis> | undefined,
    });
    turnFinals.push(result.finalText);

    if (turn.expect.route && result.route !== turn.expect.route) {
      problems.push(`[${turn.label}] rota: esperado "${turn.expect.route}", obtido "${result.route}"`);
    }
    if (turn.expect.maxMessages != null && result.messages.length > turn.expect.maxMessages) {
      problems.push(`[${turn.label}] mensagens: ${result.messages.length} > máx ${turn.expect.maxMessages}`);
    }
    const failures = evaluateOutput(result.finalText, {
      forbidden: turn.expect.forbidden,
      required: turn.expect.required,
    });
    for (const failure of failures) {
      const kind = failure.kind === "forbidden" ? "proibido encontrado" : "obrigatório ausente";
      problems.push(`[${turn.label}] ${kind}: /${failure.pattern}/ → "${result.finalText.replace(/\n/g, " ⏎ ")}"`);
    }

    // Acrescenta a rodada ao histórico para o próximo turno (cliente + IA).
    for (const message of turn.batch) {
      workingHistory.push(`Lead: ${message.content}`);
    }
    for (const message of result.messages) {
      workingHistory.push(`Atendente: ${message}`);
    }
  }

  // Asserções globais da sequência.
  if (sequence.globals?.phraseAtMostOnce) {
    for (const rule of sequence.globals.phraseAtMostOnce) {
      const hits = turnFinals.filter((text) => rule.pattern.test(text)).length;
      if (hits > rule.max) {
        problems.push(`frase /${rule.pattern.source}/ apareceu em ${hits} turnos (máx ${rule.max})`);
      }
    }
  }
  if (sequence.globals?.noConsecutiveDuplicates) {
    for (let i = 1; i < turnFinals.length; i += 1) {
      if (normalizeFinal(turnFinals[i]) === normalizeFinal(turnFinals[i - 1])) {
        problems.push(`turnos ${i} e ${i + 1} têm resposta idêntica (repetição)`);
      }
    }
  }

  if (problems.length === 0) {
    passed++;
    console.log(`  ✅ ${sequence.id} — ${sequence.title}`);
    console.log(`     causa coberta: ${sequence.classification} | turnos: ${sequence.turns.length}`);
  } else {
    failed++;
    console.error(`  ❌ ${sequence.id} — ${sequence.title}`);
    console.error(`     causa: ${sequence.classification}`);
    for (const problem of problems) {
      console.error(`     · ${problem}`);
    }
  }
}

console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`✅ ${passed}/${passed} cenários de conversa passaram`);
} else {
  console.log(`❌ ${failed} falharam, ${passed} passaram`);
  process.exit(1);
}
