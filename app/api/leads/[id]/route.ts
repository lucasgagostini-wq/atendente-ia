import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/validations";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

type Context = {
  params: { id: string };
};

export async function GET(_: Request, context: Context) {
  const activeProfile = await profileService.getProfileBySlug(
    getProfileSlugFromRequest(_),
  );
  const lead = await leadService.getLeadById(context.params.id, activeProfile.id);

  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  return NextResponse.json(lead);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = leadSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const currentLead = await leadService.getLeadById(context.params.id, activeProfile.id);
    if (!currentLead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
    }

    const lead = await leadService.updateLead(context.params.id, {
      name: parsed.data.name ?? undefined,
      phone: parsed.data.phone
        ? parsed.data.phone.replace(/\D/g, "")
        : undefined,
      source: toNullable(parsed.data.source),
      status: parsed.data.status,
      funnelStage: parsed.data.funnelStage,
      operationStage: parsed.data.operationStage,
      aiEnabled: parsed.data.aiEnabled,
      humanTakeover: parsed.data.humanTakeover,
      summary: toNullable(parsed.data.summary),
      interest: toNullable(parsed.data.interest),
    }, parsed.data.tagIds);

    return NextResponse.json(lead);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar lead",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(_),
    );
    await leadService.runBulkAction({
      profileId: activeProfile.id,
      action: "DELETE",
      leadIds: [context.params.id],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao excluir lead",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
