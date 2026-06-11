import { NextResponse } from "next/server";
import { isBridgeAuthorized } from "@/lib/bridge-auth";
import { bridgeOutboxClaimSchema } from "@/lib/validations";
import { outboundMessageService } from "@/services/outbound-message.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!isBridgeAuthorized(request)) {
      return NextResponse.json({ error: "Bridge não autorizada" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bridgeOutboxClaimSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const activeProfile = await profileService.getProfileBySlug(parsed.data.profileSlug);
    const requestedInstance = parsed.data.instanceName?.trim() || null;

    if (
      requestedInstance &&
      activeProfile.whatsappSessionName &&
      requestedInstance !== activeProfile.whatsappSessionName
    ) {
      return NextResponse.json(
        { error: "Bridge conectada à sessão errada para este perfil" },
        { status: 409 },
      );
    }

    const jobs = await outboundMessageService.claimPendingJobs({
      profileId: activeProfile.id,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao buscar fila de envio",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
