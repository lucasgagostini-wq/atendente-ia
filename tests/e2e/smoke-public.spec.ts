/**
 * smoke-public.spec.ts
 *
 * Smoke tests que NÃO requerem autenticação.
 * Rodam sempre, mesmo sem E2E_ADMIN_PASSWORD definido.
 */

import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("página de login carrega com formulário correto", async ({ page }) => {
    await page.goto("/login");

    // Título visível
    await expect(page).toHaveTitle(/atendente/i);

    // Campos presentes (sem label htmlFor, usamos type)
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Botão desabilitado enquanto campos vazios (disabled={!email || !password})
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("credenciais inválidas exibem toast de erro", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[type="email"]').fill("naoexiste@teste.com");
    await page.locator('input[type="password"]').fill("senhaerrada123");
    await page.locator('button[type="submit"]').click();

    // Sonner toast de erro aparece com mensagem de erro
    await expect(
      page.locator('[data-sonner-toast][data-type="error"], [data-type="error"], li[data-visible]')
    ).toBeVisible({ timeout: 8_000 });

    // Permanece na página de login
    await expect(page).toHaveURL(/\/login/);
  });

  test("botão desabilitado sem preencher campos", async ({ page }) => {
    await page.goto("/login");

    // Botão está desabilitado quando campos estão vazios
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Preenche só email — ainda desabilitado
    await page.locator('input[type="email"]').fill("teste@teste.com");
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Preenche senha — ativa
    await page.locator('input[type="password"]').fill("alguma-senha");
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test("heading 'Atendente IA' está visível", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText(/Atendente IA/i);
  });
});

test.describe("Proteção de rotas", () => {
  test("acessar /dashboard sem auth redireciona para /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("acessar /conversas sem auth redireciona para /login", async ({ page }) => {
    await page.goto("/conversas");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("acessar /leads sem auth redireciona para /login", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});
