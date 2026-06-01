import { NextResponse } from "next/server";
import { prospectorImportSchema } from "@/lib/validations";
import { prospectorService } from "@/services/prospector.service";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Context = {
  params: { id: string };
};

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json();
    const parsed = prospectorImportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await prospectorService.importProspectingLeadsToCrm({
      jobId: context.params.id,
      leadIds: parsed.data.leadIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao importar leads para o CRM",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

