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

const FREE_FALLBACK_MODEL = "google/gemma-4-31b-it:free";

class OpenRouterService {


  private mockResponse() {
    return "Perfeito, entendi. Me diz só uma coisa: hoje seu foco é vender mais ou melhorar o suporte primeiro?";
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

    try {
      const { data } = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          temperature,
          max_tokens: args.maxTokens ?? 400,
          messages: args.messages,
        },
        {
          timeout: 20_000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
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

      await prisma.log.create({
        data: {
          type: "OPENROUTER_RESPONSE",
          message: `Modelo ${model} respondeu com sucesso`,
          payload: {
            usage: data?.usage,
            finishReason: data?.choices?.[0]?.finish_reason,
          },
        },
      });

      return {
        output,
        model,
        usage: data?.usage ?? null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido no OpenRouter";

      await prisma.log.create({
        data: {
          type: "OPENROUTER_ERROR",
          message,
          payload: {
            model,
          },
        },
      });

      return {
        output:
          "Tive uma instabilidade rápida aqui. Quer que eu te mande um resumo objetivo da oferta e valores?",
        model,
        usage: null,
        fallback: true,
        error: message,
      };
    }
  }
}

export const openRouterService = new OpenRouterService();
