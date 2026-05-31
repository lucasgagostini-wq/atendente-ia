import { NextResponse } from "next/server";
import { automationSchema } from "@/lib/validations";
import { automationService } from "@/services/automation.service";

export const dynamic = "force-dynamic";

type Context = {
  params: { id: string };
};

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json();
    const parsed = automationSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const automation = await automationService.updateAutomation(
      context.params.id,
      parsed.data,
    );
    return NextResponse.json(automation);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar automação",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await automationService.deleteAutomation(context.params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao remover automação",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
