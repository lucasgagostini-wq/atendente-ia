import { NextResponse } from "next/server";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { operationStageSchema } from "@/lib/validations";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

type Context = {
  params: { id: string };
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: Context) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = operationStageSchema.safeParse(body?.operationStage);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Estágio operacional inválido" },
        { status: 400 },
      );
    }

    const lead = await leadService.updateOperationStage({
      leadId: context.params.id,
      profileId: activeProfile.id,
      operationStage: parsed.data,
    });

    return NextResponse.json(lead);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    const status = /não encontrado para este perfil/i.test(detail) ? 404 : 500;

    return NextResponse.json(
      {
        error: "Falha ao atualizar estágio operacional",
        detail,
      },
      { status },
    );
  }
}
