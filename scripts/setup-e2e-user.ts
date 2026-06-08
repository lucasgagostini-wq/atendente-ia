/**
 * setup-e2e-user.ts
 *
 * Cria (ou recria) o usuário de teste para os smoke tests Playwright.
 * NÃO altera o usuário admin real do sistema.
 *
 * Uso: npm run setup:e2e-user
 */

import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-test@atendenteia.local";
const TEST_PASS = process.env.E2E_ADMIN_PASSWORD || "E2eTestPass2026!";
const TEST_NAME = "E2E Test";

(async () => {
  try {
    // Remove instância anterior se existir
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

    const passwordHash = await bcrypt.hash(TEST_PASS, 10);
    const user = await prisma.user.create({
      data: { name: TEST_NAME, email: TEST_EMAIL, passwordHash },
    });

    console.log(`✅ Usuário de teste criado: ${user.email} (id: ${user.id})`);
    console.log(`   Use E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD no .env para configurar`);
  } catch (error) {
    console.error("❌ Erro ao criar usuário de teste:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
