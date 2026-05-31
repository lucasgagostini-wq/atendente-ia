import { NextResponse } from "next/server";
import { automationSchema } from "@/lib/validations";
import { automationService } from "@/services/automation.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const automations = await automationService.getAutomations();
  return NextResponse.json(automations);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = automationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const automation = await automationService.createAutomation(parsed.data);
    return NextResponse.json(automation, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao criar automação",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
