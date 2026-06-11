import { NextResponse } from "next/server";
import { isBridgeAuthorized } from "@/lib/bridge-auth";
import { bridgeOutboxStatusSchema } from "@/lib/validations";
import { outboundMessageService } from "@/services/outbound-message.service";

export const dynamic = "force-dynamic";

type Context = {
  params: { id: string };
};

export async function POST(request: Request, context: Context) {
  try {
    if (!isBridgeAuthorized(request)) {
      return NextResponse.json({ error: "Bridge não autorizada" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bridgeOutboxStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.status === "SENT") {
      const job = await outboundMessageService.markJobSent({
        jobId: context.params.id,
        whatsappMessageId: parsed.data.whatsappMessageId ?? null,
        providerPayload: parsed.data.providerPayload ?? undefined,
      });

      return NextResponse.json({ ok: true, job });
    }

    const job = await outboundMessageService.markJobError({
      jobId: context.params.id,
      errorMessage: parsed.data.errorMessage?.trim() || "Falha ao enviar pela bridge",
      providerPayload: parsed.data.providerPayload ?? undefined,
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar job de envio",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
