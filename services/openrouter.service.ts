import axios from "axios";
import { getSettings } from "@/lib/settings-cache";
import { prisma } from "@/lib/prisma";
import { safeFallbackForStage, sanitizeAIResponse } from "@/services/ai-safety.service";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateArgs = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  safetyContext?: {
    incomingText?: string | null;
    recentHistory?: string[];
    hasPhoto?: boolean;
  };
};

const FREE_FALLBACK_MODEL = "openai/gpt-oss-20b:free";
const FREE_FALLBACK_MODELS = [
  FREE_FALLBACK_MODEL,
  "z-ai/glm-4.5-air:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorDetail(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status ?? null : null;
  const detail = axios.isAxiosError(error)
    ? error.response?.data?.error?.message || error.response?.data
    : null;
  const message = error instanceof Error ? error.message : "Erro desconhecido no OpenRouter";

  return { status, detail, message };
}

class OpenRouterService {
  private mockResponse() {
    return safeFallbackForStage("needs_photo");
  }

  private async requestCompletion(args: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens?: number;
    timeoutMs: number;
  }) {
    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: args.model,
        temperature: args.temperature,
        max_tokens: args.maxTokens ?? 400,
        messages: args.messages,
      },
      {
        timeout: args.timeoutMs,
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          "X-Title": "Atendente IA",
        },
      },
    );

    const output = data?.choices?.[0]?.message?.content?.trim();
    if (!output) {
      throw new Error("OpenRouter retornou resposta vazia.");
    }

    return {
      output,
      usage: data?.usage ?? null,
      finishReason: data?.choices?.[0]?.finish_reason,
    };
  }

  async generateResponse(args: GenerateArgs) {
    const settings = await getSettings();
    const apiKey = settings.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const fallbackModel =
      process.env.FALLBACK_AI_MODEL ||
      process.env.OPENROUTER_FALLBACK_MODEL ||
      FREE_FALLBACK_MODEL;
    const model =
      args.model ||
      process.env.PRIMARY_AI_MODEL ||
      settings.openRouterModel ||
      process.env.OPENROUTER_DEFAULT_MODEL ||
      FREE_FALLBACK_MODEL;
    const temperature = args.temperature ?? settings.temperature ?? 0.6;
    const timeoutMs = numberFromEnv("AI_TIMEOUT_MS", 20_000);
    const maxRetries = numberFromEnv("AI_MAX_RETRIES", 1);
    const startedAt = Date.now();

    if (!apiKey) {
      return {
        output: sanitizeAIResponse(this.mockResponse(), args.safetyContext).output,
        model: "mock/local",
        usage: null,
        fallback: true,
      };
    }

    const modelsToTry = Array.from(new Set([model, fallbackModel, ...FREE_FALLBACK_MODELS]));

    // Log de início é fire-and-forget: NÃO bloquear o caminho crítico da resposta.
    // A chamada à IA logo abaixo mantém o event loop vivo até este log persistir.
    prisma.log.create({
      data: {
        type: "AI_REQUEST",
        message: `Solicitação de IA iniciada com modelo principal ${model}`,
        payload: {
          primaryModel: model,
          fallbackModel,
          modelsToTry,
          maxRetries,
          timeoutMs,
          messageCount: args.messages.length,
          maxTokens: args.maxTokens ?? 400,
        },
      },
    }).catch(() => {});

    for (const candidateModel of modelsToTry) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const attemptStartedAt = Date.now();

        try {
          const generated = await this.requestCompletion({
            apiKey,
            model: candidateModel,
            messages: args.messages,
            temperature,
            maxTokens: args.maxTokens,
            timeoutMs,
          });

          const sanitized = sanitizeAIResponse(generated.output, args.safetyContext);

          await prisma.log.create({
            data: {
              type: sanitized.blocked ? "AI_RESPONSE_BLOCKED" : "AI_RESPONSE",
              message: sanitized.blocked
                ? `Resposta do modelo ${candidateModel} bloqueada pela camada de segurança`
                : `Modelo ${candidateModel} respondeu com sucesso`,
              payload: {
                model: candidateModel,
                primaryModel: model,
                attempt,
                durationMs: Date.now() - attemptStartedAt,
                totalDurationMs: Date.now() - startedAt,
                usage: generated.usage,
                finishReason: generated.finishReason,
                rawResponse: generated.output,
                finalResponse: sanitized.output,
                blocked: sanitized.blocked,
                blockReason: sanitized.reason ?? null,
                fallbackStage: sanitized.fallbackStage,
                recoveredFromModel: candidateModel === model ? null : model,
              },
            },
          });

          if (sanitized.blocked) {
            return {
              output: sanitized.output,
              model: candidateModel,
              usage: generated.usage,
              fallback: true,
              blocked: true,
            };
          }

          if (candidateModel !== model) {
            await prisma.log.create({
              data: {
                type: "AI_FALLBACK_USED",
                message: `Fallback de modelo usado: ${candidateModel}`,
                payload: {
                  primaryModel: model,
                  fallbackModel: candidateModel,
                  attempt,
                },
              },
            });
          }

          return {
            output: sanitized.output,
            model: candidateModel,
            usage: generated.usage,
            fallback: candidateModel !== model,
          };
        } catch (error) {
          const { status, detail, message } = extractErrorDetail(error);

          // Logs de erro/retry são fire-and-forget: há sempre trabalho assíncrono
          // depois (retry com sleep, próximo modelo, ou fallback final) que mantém
          // o event loop vivo até o log persistir. Evita somar latência ao caminho crítico.
          prisma.log.create({
            data: {
              type: "AI_ERROR",
              message,
              payload: {
                model: candidateModel,
                primaryModel: model,
                attempt,
                status,
                detail,
                durationMs: Date.now() - attemptStartedAt,
              },
            },
          }).catch(() => {});

          if (attempt < maxRetries) {
            prisma.log.create({
              data: {
                type: "AI_RETRY",
                message: `Tentando novamente o modelo ${candidateModel}`,
                payload: {
                  model: candidateModel,
                  nextAttempt: attempt + 1,
                  status,
                },
              },
            }).catch(() => {});
            await sleep(700);
          }
        }
      }
    }

    const fallback = sanitizeAIResponse(null, args.safetyContext);

    await prisma.log.create({
      data: {
        type: "AI_FALLBACK_USED",
        message: "Todos os modelos falharam; fallback humano seguro aplicado",
        payload: {
          primaryModel: model,
          fallbackModel,
          modelsToTry,
          finalResponse: fallback.output,
          fallbackStage: fallback.fallbackStage,
          totalDurationMs: Date.now() - startedAt,
        },
      },
    });

    return {
      output: fallback.output,
      model,
      usage: null,
      fallback: true,
      error: "Todos os modelos configurados falharam.",
    };
  }
}

export const openRouterService = new OpenRouterService();
