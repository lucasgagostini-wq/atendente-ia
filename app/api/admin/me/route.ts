import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/me
 *
 * Retorna os dados do admin autenticado. Útil para confirmar sessão e
 * para o Admin Console verificar se o usuário pode executar comandos.
 */
export async function GET() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: "admin",
    canRunCommands: true,
  });
}
