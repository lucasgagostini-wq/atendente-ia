import { NextResponse } from "next/server";
import { evolutionService } from "@/services/evolution.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await evolutionService.getStatus();
  return NextResponse.json(status);
}
