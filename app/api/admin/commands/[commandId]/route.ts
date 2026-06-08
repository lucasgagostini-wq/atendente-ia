import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-handler";
import { adminCommandService } from "@/services/admin-command.service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    commandId: string;
  };
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const payload = await adminCommandService.execute(context.params.commandId);
    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
