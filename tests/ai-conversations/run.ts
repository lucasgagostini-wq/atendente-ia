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
import { simulateConversation } from "./simulate";
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

console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`✅ ${passed}/${passed} cenários de conversa passaram`);
} else {
  console.log(`❌ ${failed} falharam, ${passed} passaram`);
  process.exit(1);
}
