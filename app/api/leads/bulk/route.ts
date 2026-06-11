import { NextResponse } from "next/server";
import { leadsBulkSchema } from "@/lib/validations";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function POST(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const body = await request.json();
    const parsed = leadsBulkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;

    if (
      (input.action === "ADD_TAGS" || input.action === "REMOVE_TAGS") &&
      (!input.tagIds || input.tagIds.length === 0)
    ) {
      return NextResponse.json(
        { error: "Informe ao menos uma tag para essa ação." },
        { status: 400 },
      );
    }

    if (input.action === "UPDATE_FIELDS") {
      const data = input.data;
      if (!data) {
        return NextResponse.json(
          { error: "Nenhum campo informado para atualização em massa." },
          { status: 400 },
        );
      }

      const hasAnyField = [
        data.status,
        data.funnelStage,
        data.operationStage,
        data.aiEnabled,
        data.humanTakeover,
        data.source,
      ].some((value) => value !== undefined);

      if (!hasAnyField) {
        return NextResponse.json(
          { error: "Nenhum campo válido para atualização em massa." },
          { status: 400 },
        );
      }
    }

    const result = await leadService.runBulkAction({
      profileId: activeProfile.id,
      leadIds: input.leadIds,
      action: input.action,
      tagIds: input.tagIds,
      data: input.data
        ? {
            ...input.data,
            source: toNullable(input.data.source),
          }
        : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha na ação em massa",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
