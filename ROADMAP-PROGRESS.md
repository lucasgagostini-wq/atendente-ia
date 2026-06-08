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

## ⏳ FASE 3 — Webhook auth + API keys

### [RK1] Assinatura do webhook (bridge ↔ servidor)
**Status:** ⏳ Aguardando

### [RK2] API keys em texto plano na tabela Settings
**Status:** ⏳ Aguardando

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
