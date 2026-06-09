/**
 * tests/ai-conversations/eval-live.ts
 *
 * Avaliação OPCIONAL com IA real (OpenRouter). Diferente de
 * `npm run test:ai-conversations` (determinístico, sem rede), este modo chama o
 * modelo de verdade e verifica se a saída — DEPOIS dos guardrails — ainda viola
 * alguma regra dura. Serve para flagrar modelo fraco / prompt ruim.
 *
 *   OPENROUTER_API_KEY=... npm run eval:ai-live
 *
 * Não roda no CI: sem OPENROUTER_API_KEY ele explica e sai com código 0.
 * Não toca em banco de dados — usa um backbone de prompt embutido.
 */

import axios from "axios";
import { buildAiIncomingTextFromBatch, type PendingInboundMessage } from "../../lib/webhook-helpers";
import {
  conversationHasServiceImage,
  ensureSalesCTA,
  normalizeCommercialResponse,
  sanitizeAIResponse,
  splitResponseIntoWhatsAppMessages,
} from "../../services/ai-safety.service";
import { ALWAYS_FORBIDDEN, POST_PHOTO_FORBIDDEN, evaluateOutput } from "./asserts";
import { fixtures } from "./fixtures";

const BACKBONE = [
  "Voce e Camila, atendente humana brasileira de um estudio de restauracao e edicao de fotos.",
  "Fale curto (1 a 3 frases), natural, sem dizer que e IA/bot.",
  "Tambem fazemos edicoes simples (tirar pessoa/objeto, trocar fundo, colorir). 1 foto = R$10.",
  "Se a foto ja foi enviada, NUNCA peca a foto de novo.",
  "Nunca ofereca previa gratis. Nunca prometa ajuste infinito. Conduza pro Pix.",
  "PIX: estudiofotos000@gmail.com | Lucas Agostini | Nubank. So peca comprovante depois do Pix.",
  "So use linguagem de memoria/avo/lembranca se o cliente trouxer esse contexto.",
].join("\n");

// Espelha a cadeia de fallback da produção (services/openrouter.service.ts):
// o modelo primário pode ser pago e retornar 402 sem créditos; aí caímos nos
// modelos gratuitos, que é o que a Vercel realmente serve nesse caso.
const FREE_FALLBACK_MODELS = [
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

function modelsToTry() {
  const primary = process.env.OPENROUTER_DEFAULT_MODEL || "deepseek/deepseek-chat";
  return Array.from(new Set([primary, ...FREE_FALLBACK_MODELS]));
}

async function callModel(systemPrompt: string, userText: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const errors: string[] = [];

  for (const model of modelsToTry()) {
    try {
      const { data } = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          temperature: 0.6,
          max_tokens: 220,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
        },
        {
          timeout: 30_000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "Atendente IA — eval-live",
          },
        },
      );

      const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (content) return { content, model };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      errors.push(`${model}: ${status ?? (error instanceof Error ? error.message : "erro")}`);
    }
  }

  throw new Error(`nenhum modelo respondeu — ${errors.join(" | ")}`);
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("ℹ️  eval:ai-live precisa de OPENROUTER_API_KEY. Pulando (sem erro).");
    console.log("   Rode com: OPENROUTER_API_KEY=sk-or-... npm run eval:ai-live");
    return;
  }

  const aiFixtures = fixtures.filter((fixture) => fixture.expect.route === "ai_response");
  let violations = 0;
  let evaluated = 0;
  let modelUsed = "";

  console.log(`\n▶ Eval com IA real — ${aiFixtures.length} cenários de resposta livre\n`);

  for (const fixture of aiFixtures) {
    const batch: PendingInboundMessage[] = fixture.batch.map((message, index) => ({
      id: `m${index}`,
      content: message.content,
      type: message.type ?? "TEXT",
      createdAt: new Date(),
    }));
    const batchHasPhoto = batch.some((message) => message.type === "IMAGE");
    const userText = buildAiIncomingTextFromBatch(batch, false);

    const context = {
      incomingText: userText,
      recentHistory: (fixture.recentHistory ?? []).slice(-6),
      hasPhoto: conversationHasServiceImage({
        recentHistory: fixture.recentHistory,
        summary: fixture.summary,
        hasPhoto: batchHasPhoto,
      }),
    };

    let raw = "";
    try {
      const result = await callModel(BACKBONE, userText);
      raw = result.content;
      modelUsed = result.model;
      evaluated += 1;
    } catch (error) {
      console.error(`  ⚠️  ${fixture.id}: falha na chamada do modelo — ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const safe = sanitizeAIResponse(raw, context);
    const commercial = normalizeCommercialResponse(ensureSalesCTA(safe.output, context), context);
    const messages = splitResponseIntoWhatsAppMessages(commercial);
    const finalText = messages.join("\n");

    const failures = evaluateOutput(finalText, {
      forbidden: [...ALWAYS_FORBIDDEN, ...POST_PHOTO_FORBIDDEN, ...(fixture.expect.forbidden ?? [])],
    });

    if (failures.length === 0) {
      console.log(`  ✅ ${fixture.id} — sem violações após guardrails`);
    } else {
      violations += failures.length;
      console.error(`  ❌ ${fixture.id}`);
      console.error(`     bruto: ${raw.replace(/\n/g, " ⏎ ")}`);
      console.error(`     final: ${finalText.replace(/\n/g, " ⏎ ")}`);
      for (const failure of failures) {
        console.error(`     · proibido: /${failure.pattern}/`);
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);

  if (evaluated === 0) {
    console.log("⚠️  Nenhum cenário foi avaliado — todos os modelos falharam (ex.: 402 sem créditos).");
    console.log("   Isso NÃO é um passe. Verifique créditos/modelo no OpenRouter e rode de novo.");
    process.exit(1);
  }

  console.log(`Modelo usado: ${modelUsed} | cenários avaliados: ${evaluated}/${aiFixtures.length}`);
  if (violations === 0) {
    console.log("✅ Modelo real passou pelos guardrails sem violações de regra dura.");
  } else {
    console.log(`⚠️  ${violations} violações encontradas (modelo fraco ou prompt a ajustar).`);
    process.exit(1);
  }
}

main();
