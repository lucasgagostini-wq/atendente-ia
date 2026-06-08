/**
 * scripts/ai-check.ts
 *
 * Orientação rápida para IA/humano iniciar sessão de desenvolvimento.
 * Uso: npm run ai:check
 */

import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

const lines = [
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "  Atendente IA — Quick Check",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "  App produção : https://atendente-ia-eight.vercel.app",
  "  Webhook      : https://atendente-ia-eight.vercel.app/api/webhooks/evolution",
  "  App local    : http://localhost:3000",
  "  Bridge local : http://localhost:8080",
  "",
  "  Número IA (WhatsApp) : 5519984451744",
  "  Número admin / QA    : 5519998266669",
  "",
  "  PIX: estudiofotos000@gmail.com | Lucas Agostini | Nubank",
  "",
  "  Preços: 1 foto R$10 · 2 fotos R$18 · 5 fotos R$29 · 10 fotos R$39 · 20 fotos R$58",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "  Comandos essenciais",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "  npm run start:local          # app + bridge juntos",
  "  npm run dev                  # só Next.js",
  "  npm run bridge:baileys       # só bridge WhatsApp",
  "  npm run test:ai-safety       # testes de segurança da IA",
  "  npm run test:typing-delay    # testes de delay",
  "  npm run db:studio            # Prisma Studio",
  "",
  "  Reset lead QA: Ctrl+K no painel → \"Resetar número admin\"",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "  Contexto completo",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  `  Técnico  : ${path.join(ROOT, "docs", "AI_PROJECT_CONTEXT.md")}`,
  `  Obsidian : C:\\Users\\lucas\\Documents\\Lucas AI Brain\\02_AI_MEMORY\\Quick Start - Atendente IA.md`,
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "  Arquivos para ler primeiro",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "  1. docs/AI_PROJECT_CONTEXT.md               ← este doc",
  "  2. app/api/webhooks/evolution/route.ts       ← fluxo principal",
  "  3. services/ai-safety.service.ts             ← regras de detecção",
  "  4. services/prompt.service.ts                ← persona Camila",
  "  5. scripts/baileys-bridge.mjs                ← bridge WhatsApp",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "  Próximo teste recomendado",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "  1. npm run test:ai-safety && npm run test:typing-delay",
  "  2. Mandar mensagem do número QA (5519998266669) no WhatsApp",
  "  3. Enviar foto para restaurar — confirmar que IA não trata como comprovante",
  "  4. Pedir PIX — confirmar que dados chegam corretos",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
];

for (const line of lines) {
  console.log(line);
}
