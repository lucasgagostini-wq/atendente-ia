/**
 * api-handler.ts
 *
 * Wrapper padronizado para handlers de API do Next.js.
 * Centraliza tratamento de erros, logging e formato de resposta.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/** Formato padrão de erro da API */
type ApiErrorResponse = {
  error: string;
  detail?: string;
  code?: string;
};

/** Converte qualquer erro em resposta HTTP padronizada */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // Erro de validação Zod
  if (error instanceof ZodError) {
    const issues = error.issues ?? [];
    return NextResponse.json(
      { error: "Dados inválidos", detail: issues.map((i: { message: string }) => i.message).join("; ") },
      { status: 400 },
    );
  }

  // Erro do Prisma — registro não encontrado
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Registro não encontrado", code: "P2025" }, { status: 404 });
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Registro duplicado", code: "P2002" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Erro no banco de dados", code: error.code },
      { status: 500 },
    );
  }

  // Erro padrão JavaScript
  if (error instanceof Error) {
    const status = error.message.includes("não encontrado") ? 404
      : error.message.includes("não autenticado") ? 401
      : error.message.includes("não configurad") ? 412
      : 500;

    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
}

/**
 * Wrapper para handlers de API que automaticamente:
 * - Captura e formata erros
 * - Retorna respostas padronizadas
 *
 * @example
 * export const GET = withErrorHandler(async () => {
 *   const data = await someService.getData();
 *   return NextResponse.json(data);
 * });
 */
export function withErrorHandler(
  handler: (request: Request, context?: unknown) => Promise<NextResponse>,
) {
  return async (request: Request, context?: unknown): Promise<NextResponse> => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error("[API Error]", request.method, new URL(request.url).pathname, error);
      return handleApiError(error);
    }
  };
}

/** Retorna 200 com dados ou 404 se null */
export function jsonOrNotFound<T>(
  data: T | null,
  notFoundMessage = "Não encontrado",
): NextResponse {
  if (data === null || data === undefined) {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }
  return NextResponse.json(data);
}
