import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evolutionService } from "@/services/evolution.service";

export const dynamic = "force-dynamic";

function normalize(value?: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function isLocalWebhook(url: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

function resolveWebhookUrl(args: {
  settingsWebhookUrl?: string | null;
  requestOrigin: string;
}) {
  const settingsWebhookUrl = normalize(args.settingsWebhookUrl);
  if (settingsWebhookUrl && !isLocalWebhook(settingsWebhookUrl)) {
    return settingsWebhookUrl;
  }

  const envBase = normalize(process.env.NEXT_PUBLIC_APP_URL);
  if (envBase && !isLocalWebhook(envBase)) {
    return `${envBase.replace(/\/$/, "")}/api/webhooks/evolution`;
  }

  return `${args.requestOrigin.replace(/\/$/, "")}/api/webhooks/evolution`;
}

export async function POST(request: Request) {
  try {
    const connected = await evolutionService.connect();
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    const requestOrigin = new URL(request.url).origin;
    const webhookUrl = resolveWebhookUrl({
      settingsWebhookUrl: settings?.webhookUrl,
      requestOrigin,
    });

    let webhook = null;
    webhook = await evolutionService.setWebhook(webhookUrl);

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
