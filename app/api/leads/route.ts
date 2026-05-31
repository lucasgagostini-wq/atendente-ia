import { FunnelStage, LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { leadSchema } from "@/lib/validations";
import { leadService } from "@/services/lead.service";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const stage = request.nextUrl.searchParams.get("stage") as FunnelStage | null;
  const status = request.nextUrl.searchParams.get("status") as LeadStatus | null;

  const leads = await leadService.getLeads({
    search,
    stage: stage ?? undefined,
    status: status ?? undefined,
  });

  return NextResponse.json(leads);
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
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao criar lead",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
