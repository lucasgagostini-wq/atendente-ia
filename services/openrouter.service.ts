import axios from "axios";
import { getSettings } from "@/lib/settings-cache";
import { prisma } from "@/lib/prisma";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateArgs = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

const FREE_FALLBACK_MODEL = "openai/gpt-oss-20b:free";
const FREE_FALLBACK_MODELS = [
  FREE_FALLBACK_MODEL,
  "z-ai/glm-4.5-air:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

class OpenRouterService {


  private mockResponse() {
    return "Perfeito, entendi. Me diz só uma coisa: hoje seu foco é vender mais ou melhorar o suporte primeiro?";
  }

  private async requestCompletion(args: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens?: number;
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
        timeout: 20_000,
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
    const model =
      args.model ||
      settings.openRouterModel ||
      process.env.OPENROUTER_DEFAULT_MODEL ||
      FREE_FALLBACK_MODEL;
    const temperature = args.temperature ?? settings.temperature ?? 0.6;

    if (!apiKey) {
      return {
        output: this.mockResponse(),
        model: "mock/local",
        usage: null,
      };
    }

    const modelsToTry = Array.from(new Set([model, ...FREE_FALLBACK_MODELS]));

    for (const candidateModel of modelsToTry) {
      try {
        const generated = await this.requestCompletion({
          apiKey,
          model: candidateModel,
          messages: args.messages,
          temperature,
          maxTokens: args.maxTokens,
        });

        await prisma.log.create({
          data: {
            type: "OPENROUTER_RESPONSE",
            message: `Modelo ${candidateModel} respondeu com sucesso`,
            payload: {
              usage: generated.usage,
              finishReason: generated.finishReason,
              recoveredFromModel: candidateModel === model ? null : model,
            },
          },
        });

        return {
          output: generated.output,
          model: candidateModel,
          usage: generated.usage,
        };
      } catch (error) {
        const status =
          axios.isAxiosError(error) ? error.response?.status ?? null : null;
        const detail =
          axios.isAxiosError(error)
            ? error.response?.data?.error?.message || error.response?.data
            : null;
        const message =
          error instanceof Error ? error.message : "Erro desconhecido no OpenRouter";

        await prisma.log.create({
          data: {
            type: "OPENROUTER_ERROR",
            message,
            payload: {
              model: candidateModel,
              primaryModel: model,
              status,
              detail,
            },
          },
        });
      }
    }

    return {
      output:
        "Tive uma instabilidade rápida aqui. Quer que eu te mande um resumo objetivo da oferta e valores?",
      model,
      usage: null,
      fallback: true,
      error: "Todos os modelos configurados falharam.",
    };
  }
}

export const openRouterService = new OpenRouterService();
