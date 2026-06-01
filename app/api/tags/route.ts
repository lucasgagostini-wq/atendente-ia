import { NextResponse } from "next/server";
import { tagSchema } from "@/lib/validations";
import { leadService } from "@/services/lead.service";

export const dynamic = "force-dynamic";

const defaultColors = [
  "#3B82F6",
  "#06B6D4",
  "#14B8A6",
  "#22C55E",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#A855F7",
];

export async function GET() {
  const tags = await leadService.listTags();
  return NextResponse.json(tags);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = tagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tag = await leadService.createTag({
      name: parsed.data.name,
      color:
        parsed.data.color ||
        defaultColors[Math.floor(Math.random() * defaultColors.length)],
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao salvar tag",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

