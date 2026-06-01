import { NextResponse } from "next/server";
import { evolutionService } from "@/services/evolution.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const payload = await evolutionService.reconnect();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";

    return NextResponse.json(
      {
        error: "Falha ao reconectar instância",
        detail: message,
      },
      { status: /não configurada/i.test(message) ? 412 : 500 },
    );
  }
}
