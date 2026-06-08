/**
 * smoke-auth.spec.ts
 *
 * Smoke tests que requerem autenticação.
 * Dependem do global.setup.ts — a sessão é carregada de .auth/state.json.
 *
 * Se E2E_ADMIN_PASSWORD não foi definido no setup, os testes aqui irão falhar
 * ao tentar acessar páginas protegidas (redirecionam para /login).
 * Nesse caso, defina E2E_ADMIN_PASSWORD no .env.local:
 *   E2E_ADMIN_PASSWORD=sua_senha_aqui
 */

import { test, expect } from "@playwright/test";

// Se o estado de auth está vazio (sem password no setup), pula os testes
test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_ADMIN_PASSWORD) {
    test.skip(true, "E2E_ADMIN_PASSWORD não definido — skipping authenticated tests");
  }
});

test.describe("Dashboard", () => {
  test("carrega página principal do dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Não redireciona para login
    await expect(page).not.toHaveURL(/\/login/);

    // Algum heading ou conteúdo do dashboard está presente
    await expect(
      page.locator("h1, h2, [data-testid='dashboard'], main").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("métricas ou cards do dashboard são renderizados", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);

    // Deve ter pelo menos um card/métrica visível
    // (funciona mesmo sem dados — os cards existem com valor 0)
    const cards = page.locator("[class*='card'], [class*='Card'], [class*='metric']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Conversas", () => {
  test("carrega página de conversas", async ({ page }) => {
    await page.goto("/conversas");
    await expect(page).not.toHaveURL(/\/login/);

    // Página carregou — sidebar ou container principal visível
    await expect(
      page.locator("main, [class*='sidebar'], [class*='conversation'], h1").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("painel de conversas renderiza sem erro", async ({ page }) => {
    await page.goto("/conversas");
    await expect(page).not.toHaveURL(/\/login/);

    // A página tem dois painéis: sidebar (lista) + área de mensagens
    // Verifica que pelo menos o container principal carregou
    await expect(page.locator("main, [class*='flex'][class*='h-']").first()).toBeVisible({ timeout: 10_000 });

    // Sem mensagem de erro crítico na tela
    await expect(page.locator("text=500, text=Error, text=crashed")).toHaveCount(0);
  });
});

test.describe("Disparos", () => {
  test("carrega página de disparos", async ({ page }) => {
    await page.goto("/disparos");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.locator("main, h1, [class*='disparos']").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Navegação principal", () => {
  test("sidebar de navegação está visível e funcional", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);

    // Sidebar ou nav principal visível
    const nav = page.locator("nav, [class*='sidebar'], [class*='navigation']").first();
    await expect(nav).toBeVisible({ timeout: 8_000 });
  });

  test("navegar para /leads carrega a lista", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.locator("main, h1, table, [class*='lead']").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
