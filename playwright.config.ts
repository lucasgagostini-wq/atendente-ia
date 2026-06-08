import { defineConfig, devices } from "@playwright/test";

/**
 * playwright.config.ts
 *
 * Configuração dos smoke tests E2E do painel admin.
 * Documentação: https://playwright.dev/docs/test-configuration
 *
 * Para rodar:
 *   npm run test:e2e
 *
 * O servidor dev (porta 3000) é iniciado automaticamente se não estiver rodando.
 * Em CI, use npm run build && npm run start em vez de npm run dev.
 */

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  /* Timeout global por teste */
  timeout: 30_000,
  /* Timeout da asserção */
  expect: { timeout: 5_000 },
  /* Rodar testes em paralelo */
  fullyParallel: true,
  /* Não permitir test.only em CI */
  forbidOnly: !!process.env.CI,
  /* Retry apenas em CI */
  retries: process.env.CI ? 2 : 0,
  /* Workers */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter */
  reporter: "list",

  use: {
    /* URL base dos testes */
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    /* Capturar trace apenas ao falhar em CI */
    trace: "on-first-retry",
    /* Screenshot ao falhar */
    screenshot: "only-on-failure",
  },

  projects: [
    /* Setup global: cria usuário de teste + salva sessão autenticada */
    {
      name: "setup",
      testMatch: "**/global.setup.ts",
    },
    /* Testes sem autenticação */
    {
      name: "smoke-public",
      testMatch: "**/smoke-public.spec.ts",
    },
    /* Testes com autenticação (dependem do setup) */
    {
      name: "smoke-auth",
      testMatch: "**/smoke-auth.spec.ts",
      use: {
        storageState: "tests/e2e/.auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],

  /* Inicia o servidor de desenvolvimento automaticamente */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    /* Reusar servidor existente em desenvolvimento (evita duplo start) */
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
