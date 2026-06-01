import { NextResponse } from "next/server";
import { broadcastSuggestionSchema } from "@/lib/validations";
import { broadcastService } from "@/services/broadcast.service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = broadcastSuggestionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const suggestion = await broadcastService.generateSuggestion({
      tagName: parsed.data.tagName,
      objective: parsed.data.objective || undefined,
      baseMessage: parsed.data.baseMessage || undefined,
    });

    return NextResponse.json(suggestion);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao gerar sugestão de copy",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

