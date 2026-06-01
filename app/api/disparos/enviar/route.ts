import { NextResponse } from "next/server";
import { broadcastSendSchema } from "@/lib/validations";
import { broadcastService } from "@/services/broadcast.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = broadcastSendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.minIntervalSeconds > parsed.data.maxIntervalSeconds) {
      return NextResponse.json(
        { error: "Intervalo mínimo maior que o máximo." },
        { status: 400 },
      );
    }

    const result = await broadcastService.runTagBroadcast({
      tagId: parsed.data.tagId,
      campaignName: parsed.data.campaignName || undefined,
      baseMessage: parsed.data.baseMessage,
      variations: parsed.data.variations,
      minIntervalSeconds: parsed.data.minIntervalSeconds,
      maxIntervalSeconds: parsed.data.maxIntervalSeconds,
      maxLeads: parsed.data.maxLeads,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao executar disparo",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

