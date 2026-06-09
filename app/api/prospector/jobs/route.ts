import { NextResponse } from "next/server";
import { prospectorJobSchema } from "@/lib/validations";
import { prospectorService } from "@/services/prospector.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const maxDuration = 300;

export async function GET() {
  try {
    const jobs = await prospectorService.listJobs();
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao listar jobs de prospecção",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = prospectorJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const job = await prospectorService.createAndRunGoogleMapsJob(parsed.data);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao executar prospecção Google Maps",
        detail: error instanceof Error ? error.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
