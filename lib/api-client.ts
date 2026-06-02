/**
 * api-client.ts
 *
 * Cliente HTTP centralizado para todas as chamadas de API do front-end.
 * Padroniza tratamento de erros, headers e parsing de resposta.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Faz uma requisição autenticada à API interna do Next.js.
 * Lança ApiError em caso de status >= 400.
 */
export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // Tenta parsear JSON independente do status
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `HTTP ${response.status}`,
      payload?.detail,
    );
  }

  return payload as T;
}

/** Helpers para os métodos HTTP mais usados */
export const api = {
  get: <T>(url: string) => apiRequest<T>(url),

  post: <T>(url: string, body?: unknown) =>
    apiRequest<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),

  patch: <T>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: "PATCH", body: JSON.stringify(body) }),

  delete: <T>(url: string) =>
    apiRequest<T>(url, { method: "DELETE" }),
};
