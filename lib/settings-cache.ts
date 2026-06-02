/**
 * settings-cache.ts
 *
 * Cache em memória para as configurações do sistema.
 * Evita o padrão N+1 de chamar prisma.settings.upsert() a cada requisição.
 * TTL de 30 segundos — mudanças aparecem em até 30s sem reiniciar o servidor.
 */

import { prisma } from "@/lib/prisma";
import type { Settings } from "@prisma/client";

const CACHE_TTL_MS = 30_000; // 30 segundos

let cachedSettings: Settings | null = null;
let cacheExpiresAt = 0;

/**
 * Retorna as configurações do sistema com cache de 30 segundos.
 * Na primeira chamada (ou após TTL expirar) busca do banco.
 */
export async function getSettings(): Promise<Settings> {
  const now = Date.now();

  if (cachedSettings && now < cacheExpiresAt) {
    return cachedSettings;
  }

  // Busca ou cria o registro de configurações
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  cachedSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;

  return settings;
}

/**
 * Invalida o cache manualmente.
 * Chamar após salvar novas configurações para refletir imediatamente.
 */
export function invalidateSettingsCache() {
  cachedSettings = null;
  cacheExpiresAt = 0;
}
