import { NextResponse } from "next/server";
import { prospectorService } from "@/services/prospector.service";

export const dynamic = "force-dynamic";

type Context = {
  params: { id: string };
};

export async function GET(_: Request, context: Context) {
  const job = await prospectorService.getJobById(context.params.id);

  if (!job) {
    return NextResponse.json(
      { error: "Job de prospecção não encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(job);
}

