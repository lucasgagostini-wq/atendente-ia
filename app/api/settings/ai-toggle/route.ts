/**
 * POST /api/settings/ai-toggle
 *
 * Liga ou desliga a IA globalmente.
 * Quando pausada, o webhook salva as mensagens recebidas mas não gera resposta automática.
 * Nenhum lead é modificado — ao reativar, tudo volta como estava.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, invalidateSettingsCache } from "@/lib/settings-cache";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const current = await getSettings();
    const newState = !current.aiPaused;

    await prisma.settings.update({
      where: { id: "default" },
      data: { aiPaused: newState },
    });

    // Força o cache a buscar o novo valor na próxima requisição
    invalidateSettingsCache();

    await prisma.log.create({
      data: {
        type: newState ? "AI_GLOBALLY_PAUSED" : "AI_GLOBALLY_RESUMED",
        message: newState
          ? "IA pausada globalmente pelo operador."
          : "IA reativada globalmente pelo operador.",
        payload: { aiPaused: newState },
      },
    });

    return NextResponse.json({ aiPaused: newState });
  } catch (error) {
    return NextResponse.json(
      { error: "Falha ao alternar estado da IA", detail: error instanceof Error ? error.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ aiPaused: settings.aiPaused ?? false });
}
