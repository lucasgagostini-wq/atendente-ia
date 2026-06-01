import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evolutionService } from "@/services/evolution.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const connected = await evolutionService.connect();
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    const webhookUrl =
      settings?.webhookUrl ||
      (process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution`
        : null);

    let webhook = null;
    if (webhookUrl) {
      webhook = await evolutionService.setWebhook(webhookUrl);
    }

    return NextResponse.json({ connected, webhook });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";

    return NextResponse.json(
      {
        error: "Falha ao conectar instância",
        detail: message,
      },
      { status: /não configurada/i.test(message) ? 412 : 500 },
    );
  }
}
