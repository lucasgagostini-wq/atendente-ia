import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await prisma.log.findMany({
    where: {
      type: "BROADCAST_RUN",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(runs);
}

