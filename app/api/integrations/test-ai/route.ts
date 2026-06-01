import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openRouterService } from "@/services/openrouter.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalize(value?: string | null) {
  return value && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt =
      typeof body?.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Gere uma resposta curta, natural e comercial para um lead de hamburgueria.";

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });

    const apiKey =
      normalize(settings.openRouterApiKey) || normalize(process.env.OPENROUTER_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "OpenRouter API Key não configurada.",
          detail: "Preencha a chave em Configurações para habilitar IA real.",
        },
        { status: 412 },
      );
    }

    const generated = await openRouterService.generateResponse({
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente comercial em português do Brasil. Responda em uma frase curta.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 120,
      temperature: 0.5,
    });

    return NextResponse.json(generated);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao testar IA",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

