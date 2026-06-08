/**
 * prune-logs.ts
 *
 * Remove logs da tabela Log com mais de N dias (padrão: 30).
 * Executar em DESENVOLVIMENTO ou staging para limpar o banco local.
 *
 * ⚠️  CUIDADO: NÃO execute em produção sem confirmação explícita.
 *     A tabela Log em produção pode ter dados relevantes para diagnóstico.
 *
 * Uso:
 *   npm run prune-logs              → remove logs com > 30 dias
 *   PRUNE_LOGS_DAYS=7 npm run prune-logs  → remove logs com > 7 dias
 *   PRUNE_DRY_RUN=true npm run prune-logs → apenas conta (não deleta)
 *
 * Para rodar contra produção (banco Supabase real), primeiro CONFIRME e use:
 *   DATABASE_URL=<prod-url> PRUNE_LOGS_DAYS=30 npm run prune-logs
 */

import { prisma } from "../lib/prisma";

const DAYS = Math.max(1, Number(process.env.PRUNE_LOGS_DAYS ?? 30));
const DRY_RUN = process.env.PRUNE_DRY_RUN === "true";
const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

console.log(`Logs mais antigos que ${DAYS} dias (antes de ${cutoff.toISOString()})`);
if (DRY_RUN) {
  console.log("Modo DRY RUN — nenhuma linha será deletada.");
}

(async () => {
  try {
    // Conta quantos seriam deletados
    const count = await prisma.log.count({
      where: { createdAt: { lt: cutoff } },
    });

    if (count === 0) {
      console.log("Nenhum log para remover.");
      return;
    }

    console.log(`${count} log(s) encontrado(s) para remoção.`);

    if (!DRY_RUN) {
      const result = await prisma.log.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      console.log(`✅ ${result.count} log(s) removido(s).`);
    } else {
      console.log("(DRY RUN) — use PRUNE_DRY_RUN=false para efetuar a deleção.");
    }
  } catch (error) {
    console.error("❌ Erro:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
