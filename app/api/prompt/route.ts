import { NextResponse } from "next/server";
import { promptSchema } from "@/lib/validations";
import { promptService } from "@/services/prompt.service";

export const dynamic = "force-dynamic";

function toNullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function GET() {
  const prompt = await promptService.getPrompt();
  return NextResponse.json(prompt);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = promptSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const prompt = await promptService.updatePrompt({
      ...parsed.data,
      checkoutUrl: toNullable(parsed.data.checkoutUrl),
    });

    return NextResponse.json(prompt);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao atualizar prompt",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
