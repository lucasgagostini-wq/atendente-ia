# Roadmap de Melhorias — Progresso

Branch: `melhorias/roadmap` | Iniciado: 2026-06-08

---

## ✅ FASE 1 — Segurança

### [QW1] Correção do session.ts — `dev-secret` em produção
**Status:** ✅ Commitado na branch  
**Commit:** `06d0ad9` — `fix(security): harden admin session secret`

**O que mudou:**
- `lib/session.ts`: `getAuthSecret()` agora é async; lê `ADMIN_SESSION_SECRET` → `JWT_SECRET` → `NEXTAUTH_SECRET`; em produção deriva do `DATABASE_URL` via SHA-256; nunca usa `"dev-secret"` em produção
- `app/api/webhooks/evolution/route.ts`: error catch agora usa `JSON.stringify(payload)` (era `String(payload)` → `"[object Object]"`) + captura `error.stack`
- `.env.example`, `.gitignore`, `docs/AI_PROJECT_CONTEXT.md`: atualizados

**🛑 Ação pendente (humano):** Setar `ADMIN_SESSION_SECRET` no painel da Vercel.
- Gerar: `openssl rand -base64 48`
- Onde: https://vercel.com → projeto `atendente-ia-eight` → Settings → Environment Variables → `ADMIN_SESSION_SECRET`
- Após salvar: fazer Redeploy manual (ou push para main)

---

## 🔄 FASE 2 — Rede de proteção

### [G2] Harness de integração do webhook
**Status:** 🔄 Em andamento

### [G1] Smoke tests Playwright
**Status:** ⏳ Aguardando G2

---

## ✅ FASE 3 — Webhook auth + API keys

### [RK1] Assinatura do webhook (bridge ↔ servidor)
**Status:** ✅ Implementado na branch — **🛑 NÃO ativar em produção sem sincronizar os dois lados**

**O que mudou:**
- `scripts/baileys-bridge.mjs`: lê `WEBHOOK_SECRET` da env; se definido, envia `X-Webhook-Secret` em cada `emitWebhook`
- `app/api/webhooks/evolution/route.ts`: valida `X-Webhook-Secret` se `WEBHOOK_SECRET` definida no servidor; sem a env var → modo legado (backward-compatible)
- `.env.example`: documenta `WEBHOOK_SECRET` com instrução de ativação
- Log `WEBHOOK_AUTH_FAILED` criado quando header inválido/ausente

**Decisão de arquitetura:** Secret simples no header (não HMAC) — suficiente porque:
1. Transporte é HTTPS (TLS já garante confidencialidade)
2. Bridge é ponto de origem único e confiável
3. HMAC adicionaria complexidade sem benefício de segurança adicional nesse contexto

**Para ativar em produção:**
1. Gerar: `openssl rand -hex 32`
2. Definir `WEBHOOK_SECRET` no bridge (`.env` local) e reiniciar bridge
3. Definir `WEBHOOK_SECRET` na Vercel e fazer redeploy
4. AMBOS devem estar ativos ao mesmo tempo

### [RK2] API keys em texto plano na tabela Settings
**Status:** ✅ Documentado — sem mudança de código necessária

**Análise do risco:**
- Supabase PostgreSQL tem **encryption at rest** (AES-256 na infraestrutura)
- Settings só são acessíveis por admins autenticados — sem API pública expondo os valores
- App-level encryption adicionaria complexidade sem melhoria de segurança real (a chave de decriptografia teria que estar nos env vars de qualquer jeito)
- **Padrão "env fallback" já existe** em todos os serviços: `settings.openRouterApiKey || process.env.OPENROUTER_API_KEY`

**Ação recomendada (sem código, apenas configuração):**
- Mover `OPENROUTER_API_KEY` do banco para o painel da Vercel e deixar campo em branco no banco
- O fallback `|| process.env.OPENROUTER_API_KEY` continuará funcionando
- Evolution API key: idem se necessário

---

## ⏳ FASE 4 — Capacidade falsa

### [RK3] Automações sem execução
**Status:** ⏳ Aguardando

---

## ⏳ FASE 5 — Performance e custo

### [QW2] Paginação em leadService.getLeads
**Status:** ⏳ Aguardando

### [QW4+RK4] Retenção da tabela Log + lead-reset memory
**Status:** ⏳ Aguardando

### [R2] Refactor dashboard (56kB)
**Status:** ⏳ Aguardando

### [C3] vercel-optimize
**Status:** ⏳ Aguardando

---

## ⏳ FASE 6 — Polimento

### [G4] Auditoria a11y/UX
**Status:** ⏳ Aguardando

### [R4] Frontend design polish
**Status:** ⏳ Aguardando

### [R3] shadcn/ui real (components.json)
**Status:** ⏳ Aguardando

### [C1] Claude Vision para comprovante
**Status:** ⏳ Aguardando

---

## Decisões de arquitetura

| Item | Decisão | Racional |
|---|---|---|
| QW1 — fallback de segredo | SHA-256 do DATABASE_URL (não "dev-secret") | Não adivinhável externamente; estável entre instâncias; sem infra nova |
