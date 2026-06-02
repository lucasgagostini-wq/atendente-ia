import { FunnelStage, LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { leadSchema } from "@/lib/validations";
import { leadService } from "@/services/lead.service";
import { handleApiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const leads = await leadService.getLeads({
      search: searchParams.get("search") ?? undefined,
      stage: (searchParams.get("stage") as FunnelStage | null) ?? undefined,
      status: (searchParams.get("status") as LeadStatus | null) ?? undefined,
      tagId: searchParams.get("tagId") ?? undefined,
      onlyDialable: searchParams.get("onlyDialable") === "true",
    });
    return NextResponse.json(leads);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = leadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const lead = await leadService.createLead({
      name: parsed.data.name || null,
      phone: parsed.data.phone.replace(/\D/g, ""),
      source: toNullable(parsed.data.source),
      status: parsed.data.status ?? "NEW",
      funnelStage: parsed.data.funnelStage ?? "COLD",
      aiEnabled: parsed.data.aiEnabled ?? true,
      humanTakeover: parsed.data.humanTakeover ?? false,
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
