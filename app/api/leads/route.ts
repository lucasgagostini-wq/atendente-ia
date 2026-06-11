import { FunnelStage, LeadStatus, OperationStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getOperationalDefaultsForProfile, resolveLeadName } from "@/lib/lead-profile";
import { leadSchema } from "@/lib/validations";
import { getProfileSlugFromRequest } from "@/lib/profile-context";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";
import { handleApiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const limitParam = searchParams.get("limit");
    const skipParam = searchParams.get("skip");

    const leads = await leadService.getLeads({
      profileId: activeProfile.id,
      search: searchParams.get("search") ?? undefined,
      stage: (searchParams.get("stage") as FunnelStage | null) ?? undefined,
      operationStage: (searchParams.get("operationStage") as OperationStage | null) ?? undefined,
      status: (searchParams.get("status") as LeadStatus | null) ?? undefined,
      tagId: searchParams.get("tagId") ?? undefined,
      onlyDialable: searchParams.get("onlyDialable") === "true",
      limit: limitParam ? Number(limitParam) : undefined,
      skip: skipParam ? Number(skipParam) : undefined,
    });
    return NextResponse.json(leads);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const activeProfile = await profileService.getProfileBySlug(
      getProfileSlugFromRequest(request),
    );
    const profileDefaults = getOperationalDefaultsForProfile(activeProfile.slug);
    const body = await request.json();
    const parsed = leadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const lead = await leadService.createLead({
      profile: { connect: { id: activeProfile.id } },
      name: resolveLeadName([parsed.data.name], parsed.data.phone),
      phone: parsed.data.phone.replace(/\D/g, ""),
      source: toNullable(parsed.data.source),
      status: parsed.data.status ?? profileDefaults.status ?? "NEW",
      funnelStage: parsed.data.funnelStage ?? profileDefaults.funnelStage ?? "COLD",
      operationStage: parsed.data.operationStage ?? profileDefaults.operationStage ?? undefined,
      aiEnabled: parsed.data.aiEnabled ?? profileDefaults.aiEnabled ?? true,
      humanTakeover: parsed.data.humanTakeover ?? profileDefaults.humanTakeover ?? false,
      summary: toNullable(parsed.data.summary),
      interest: toNullable(parsed.data.interest),
      leadTags:
        parsed.data.tagIds && parsed.data.tagIds.length > 0
          ? {
              create: parsed.data.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
