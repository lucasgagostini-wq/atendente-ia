# Roadmap de Melhorias — Progresso

Branch: `melhorias/roadmap` | Iniciado: 2026-06-08 | Concluído: 2026-06-08

---

## ✅ FASE 1 — Segurança

### [QW1] Correção do session.ts — `dev-secret` em produção
**Status:** ✅ Commitado (`06d0ad9`)

**O que mudou:**
- `lib/session.ts`: `getAuthSecret()` async; lê `ADMIN_SESSION_SECRET` → `JWT_SECRET` → `NEXTAUTH_SECRET`; em produção deriva do `DATABASE_URL` via SHA-256; nunca usa `"dev-secret"` em produção
- `app/api/webhooks/evolution/route.ts`: error catch usa `JSON.stringify(payload)` + `error.stack`
- `.env.example`, `.gitignore`, `docs/AI_PROJECT_CONTEXT.md`: atualizados

**🛑 Ação pendente (humano):**
- Setar `ADMIN_SESSION_SECRET` na Vercel: `openssl rand -base64 48`
- Vercel → projeto → Settings → Environment Variables → `ADMIN_SESSION_SECRET` → Redeploy

---

## ✅ FASE 2 — Rede de proteção

### [G2] Harness de integração do webhook
**Status:** ✅ 46/46 testes passando (`ae2a14d`)
- `scripts/test-webhook-logic.ts`: 46 testes cobrindo `extractIncomingPayload`, `shouldTransferToHuman`, `buildAiIncomingText`, `buildAiIncomingTextFromBatch`, `receiptDecisionFromAnalysis`, `dedupeBatchParts`, e 4 cenários integrados
- `npm run test:webhook-logic`

### [G1] Smoke tests Playwright
**Status:** ✅ 15 testes passando (`a8c5ad5`)
- 3 projetos: setup (login auth), smoke-public (7 testes), smoke-auth (8 testes)
- `playwright.config.ts`, `tests/e2e/global.setup.ts`, `smoke-public.spec.ts`, `smoke-auth.spec.ts`
- `scripts/setup-e2e-user.ts` cria/recria usuário `e2e-test@atendenteia.local`
- `npm run test:e2e`

---

## ✅ FASE 3 — Webhook auth + API keys

### [RK1] Assinatura do webhook (bridge ↔ servidor)
**Status:** ✅ Implementado (`a6e25fa`) — **🛑 NÃO ativar em produção sem sincronizar os dois lados**

- `scripts/baileys-bridge.mjs`: envia `X-Webhook-Secret` se env `WEBHOOK_SECRET` definida
- `app/api/webhooks/evolution/route.ts`: valida header; sem a env → modo legado (backward-compatible)
- Log `WEBHOOK_AUTH_FAILED` quando header inválido/ausente

**Para ativar em produção:** `openssl rand -hex 32` → definir em bridge + Vercel simultaneamente

### [RK2] API keys em texto plano na tabela Settings
**Status:** ✅ Documentado — sem mudança de código necessária
- Supabase tem encryption at rest (AES-256)
- Padrão `settings.key || process.env.KEY` já existe em todos os serviços
- Recomendação: mover chaves sensíveis para Vercel env vars (não banco)

---

## ✅ FASE 4 — Capacidade falsa

### [RK3] Automações sem execução
**Status:** ✅ Banner informativo adicionado (`adeefdc`)
- `app/automacoes/page.tsx`: banner âmbar "Funcionalidade em desenvolvimento"
- Usuário vê que as regras são salvas mas não disparadas automaticamente
- Decisão: honesto > ocultar; código de execução real será FASE futura

---

## ✅ FASE 5 — Performance e custo

### [QW2] Paginação em leadService.getLeads
**Status:** ✅ Implementado (`f4bd49f`)
- `services/lead.service.ts`: `LEADS_DEFAULT_LIMIT=500`, `LEADS_MAX_LIMIT=2000`, params `limit`/`skip`
- `app/api/leads/route.ts`: repassa `limit` e `skip` da query string
- `app/leads/page.tsx`: banner amarelo quando `leads.length >= 500`

### [QW4+RK4] Retenção de logs + lead-reset memory fix
**Status:** ✅ Implementado (`f4bd49f`)
- `scripts/prune-logs.ts`: script com dry-run; configurável por `PRUNE_LOGS_DAYS`
- `services/lead-reset.service.ts`: substituiu `findMany({})` (full scan) por `$queryRaw` com `ILIKE ANY(patterns::text[])` — O(matching rows) em vez de O(all rows)

### [R2] Refactor dashboard bundle
**Status:** ✅ 56.6 kB → 16 kB (-72%) (`33dbe24`)
- Removeu `framer-motion` de `messages-chart.tsx` (chunk de 152 kB era exclusivo do dashboard)
- CSS `@keyframes barGrow` inline substitui `motion.div`
- First Load JS: 190 kB → 149 kB

### [C3] Vercel metrics + config
**Status:** ✅ Configurado (`b40a3b8`)
- `next.config.mjs`: security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), cache imutável `_next/static`, images AVIF+WebP, `reactStrictMode: true`
- `vercel.json`: região `gru1` (São Paulo), `maxDuration 60s` para /api/ai/respond e /api/prospector, `maxDuration 30s` para webhook e disparos

---

## ✅ FASE 6 — Polimento

### [G4] Auditoria a11y/UX
**Status:** ✅ Implementado (`3aec92d`)

**/conversas:**
- `TypingIndicator`: `role="status"` + `aria-label`; dots com `aria-hidden`
- Search `<Input>`: `aria-label` descritivo
- Stage filter: `role="group"` + `aria-pressed` em cada botão
- Conversa list buttons: `aria-current` + `aria-label` completo (nome, etapa, última msg)
- Status pulse `<span>`: `aria-hidden`
- Chat action buttons: `aria-label` específico por ação

**/dashboard:**
- AI pause button: `aria-label` dinâmico + `aria-pressed`
- Métricas grid: `aria-busy` + `aria-label`
- Atividade recente: `aria-live="polite"` + `aria-busy`; skeletons `aria-hidden`

### [R4] Frontend design polish
**Status:** ✅ Commitado (`b85a83e`)
- `Select`: ring-blue-400 → ring-indigo-500/40, rounded-lg, hover state
- `Textarea`: mesma uniformização + `resize-y` explícito
- `StatusBadge`: dot decorativo com `aria-hidden`
- `globals.css`: `prefers-reduced-motion: reduce` agora cobre `typing-dot`, `status-pulse`, `animate-fade-in-up`, `skeleton`

### [R3] shadcn/ui real (components.json)
**Status:** ✅ Configurado (`09731b2`)
- `components.json`: aponta para `@/components/ui`, `@/lib/utils`, `@/hooks`; baseColor zinc; `npx shadcn@latest add <component>` funcional
- `tailwind.config.ts`: `darkMode: ["class"]`, `borderRadius` via `var(--radius)`, keyframes de accordion-down/up, fade-in-up, bar-grow

### [C1] Claude Vision para comprovante
**Status:** ✅ Avaliado e fix aplicado (`e16c9a0`)
- **Recomendação**: `anthropic/claude-3-5-haiku` via OpenRouter (melhor custo/benefício para comprovantes PIX em PT-BR); `claude-3-5-sonnet` para máxima precisão
- `.env.example`: `OPENROUTER_VISION_MODEL=anthropic/claude-3-5-haiku` como valor padrão sugerido
- `services/payment-receipt.service.ts`: fix de base64 — garante prefixo `data:image/jpeg;base64,` para strings raw (OpenRouter/Claude Vision exige data URI completo)

---

## Extração técnica extra

### Webhook helpers (lib/webhook-helpers.ts)
**Status:** ✅ Commitado (`3f1c3bd`)
- Moveu `normalizePhone`, `extractIncomingPayload`, `shouldTransferToHuman`, `receiptDecisionFromAnalysis`, `buildAiIncomingText`, `dedupeBatchParts`, `buildAiIncomingTextFromBatch` de `route.ts` para `lib/webhook-helpers.ts`
- Corrige build error (Next.js route files não podem exportar não-HTTP symbols)
- Tests atualizado para importar de `../lib/webhook-helpers`

---

## Decisões de arquitetura

| Item | Decisão | Racional |
|---|---|---|
| QW1 — fallback de segredo | SHA-256 do DATABASE_URL | Não adivinhável; estável; sem infra nova |
| RK1 — webhook auth | Secret simples em header (não HMAC) | HTTPS garante TLS; bridge é único emissor confiável |
| RK2 — API keys no banco | Sem app-level encryption | Supabase tem AES-256 at rest; chave de decript. ficaria em env de qualquer forma |
| RK3 — automações | Banner "em desenvolvimento" | Honesto > ocultar; não implementar fake toggle |
| R2 — bundle dashboard | Remover framer-motion | Uma animação simples não justifica 152 kB |
| R3 — shadcn/ui | components.json + darkMode:class | Habilita CLI sem quebrar design system existente |
| C1 — visão | claude-3-5-haiku | Melhor relação latência/custo/precisão PT-BR |

---

## 🛑 Ações que requerem intervenção humana

1. **Setar `ADMIN_SESSION_SECRET`** no painel Vercel: `openssl rand -base64 48`
2. **Ativar `WEBHOOK_SECRET`** simultaneamente em bridge + Vercel: `openssl rand -hex 32`
3. **Setar `VISION_AI_MODEL`** na Vercel: `anthropic/claude-3-5-haiku` (ou `anthropic/claude-3-5-sonnet`)
4. **Executar `prune-logs`** contra banco de produção quando necessário (com confirmação explícita)
