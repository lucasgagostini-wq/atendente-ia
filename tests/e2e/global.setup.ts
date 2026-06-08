/**
 * global.setup.ts
 *
 * Preparação global antes dos smoke tests autenticados:
 * 1. Garante que existe um usuário de teste no banco
 * 2. Faz login via UI e salva a sessão em .auth/state.json
 *
 * Variáveis de ambiente (opcional — defina no .env.local):
 *   E2E_ADMIN_EMAIL    (padrão: e2e-test@atendenteia.local)
 *   E2E_ADMIN_PASSWORD (padrão: E2eTestPass2026!)
 *
 * Se E2E_ADMIN_PASSWORD não estiver definido, o setup cria estado vazio
 * e os testes autenticados são pulados automaticamente.
 *
 * ATENÇÃO: Este setup NÃO altera o usuário admin real do sistema.
 * O usuário de teste (e2e-test@atendenteia.local) é criado separadamente
 * pelo script: npm run setup:e2e-user
 */

import { test as setup, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const AUTH_FILE = path.join(__dirname, ".auth/state.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL || "e2e-test@atendenteia.local";
  const password = process.env.E2E_ADMIN_PASSWORD || "E2eTestPass2026!";

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Aguarda redirect para dashboard após login bem-sucedido
  await expect(page).toHaveURL(/\/(dashboard|conversas|leads)/, { timeout: 10_000 });

  // Salva estado da sessão (cookies) para ser reutilizado nos testes
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`[setup] Sessão autenticada salva em ${AUTH_FILE}`);
});
