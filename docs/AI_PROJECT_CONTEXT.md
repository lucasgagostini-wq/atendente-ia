# Atendente IA — Contexto para IA/Codex/Claude

> **Leia este arquivo primeiro em qualquer nova sessão de desenvolvimento.**
> Fonte de verdade técnica do projeto. Atualizar sempre que uma funcionalidade mudar de estado.

---

## 1. O que é o projeto

SaaS local de atendimento automático via WhatsApp para um estúdio de restauração de fotos antigas.
A atendente IA se chama **Camila** e atende leads que chegam pelo WhatsApp, conduz o processo de venda, envia PIX e recebe comprovante — tudo via IA.

---

## 2. URLs e números importantes

| Item | Valor |
|---|---|
| App produção (Vercel) | https://atendente-ia-eight.vercel.app |
| Webhook Evolution/Baileys | https://atendente-ia-eight.vercel.app/api/webhooks/evolution |
| App local | http://localhost:3000 |
| Bridge local | http://localhost:8080 |
| Número WhatsApp da IA | **5519984451744** |
| Número admin / QA | **5519998266669** |
| PIX chave | estudiofotos000@gmail.com |
| PIX nome | Lucas Agostini |
| PIX banco | Nubank |

---

## 3. Preços oficiais

| Pacote | Preço |
|---|---|
| 1 foto | R$10 |
| 2 fotos | R$18 |
| 5 fotos | R$29 |
| 10 fotos | R$39 |
| 20 fotos | R$58 |

---

## 4. Stack técnica

| Camada | Tecnologia |
|---|---|
| App | Next.js 14 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui + Phosphor Icons |
| State | TanStack Query + Zustand |
| ORM / DB | Prisma + PostgreSQL (Supabase) |
| Auth | JWT (jose) + bcryptjs — cookie `atendente_admin` |
| WhatsApp local | Baileys bridge (`scripts/baileys-bridge.mjs`, porta 8080) |
| WhatsApp API | Evolution API (configurada em `/configuracoes`) |
| IA | OpenRouter — deepseek/deepseek-chat |
| Vision | OpenRouter — modelo separado para análise de comprovante |
| Deploy | Vercel (auto-deploy via push para `main`) |
| Prospecção | Apify + Google Places crawler |

---

## 5. Fluxo principal (WhatsApp → IA → Resposta)

```
Lead envia mensagem no WhatsApp
  ↓
Baileys Bridge (porta 8080) recebe via WebSocket
  ↓
Bridge inicia "composing/digitando" imediatamente (antes da IA)
  ↓
Bridge chama POST /api/webhooks/evolution na Vercel
  ↓
Webhook: deduplicação → upsert lead → salva mensagem INBOUND
  ↓
waitForInboundSilence() → aguarda silêncio de 4s (texto) ou 6s (com mídia)
  → Se chegar mensagem mais nova no intervalo: descarta essa resposta (debounce)
  → Se silêncio confirmado: consolida batch de mensagens
  ↓
Verifica gates (em ordem):
  1. shouldTransferToHuman? → pausa IA, avisa lead
  2. globalSettings.aiPaused? → silencioso
  3. !lead.aiEnabled || humanTakeover? → silencioso
  4. isWaitingReceipt && hasRecentPixInHistory && detectPaymentReceipt()?
     → rota de análise de comprovante (vision AI ou text)
  5. detectPaymentIntent()?
     → envia dados do PIX, seta flag WAITING_PAYMENT_RECEIPT
  6. Demais mensagens → resposta da IA via OpenRouter
  ↓
Resposta volta no JSON para o Bridge
  ↓
Bridge aguarda remaining typing delay (mínimo 3500-4000ms após IA responder)
  ↓
Bridge envia mensagem(ns) no WhatsApp
  ↓
Bridge para "composing" (clearTypingSession)
```

---

## 6. Comandos úteis

```bash
# Iniciar tudo junto (app + bridge)
npm run start:local

# Só o app Next.js
npm run dev

# Só o bridge Baileys
npm run bridge:baileys

# Resumo rápido do projeto (orientação para IA)
npm run ai:check

# Testes unitários de segurança da IA
npm run test:ai-safety

# Regressão de conversas reais (sem WhatsApp) — ver docs/AI_CONVERSATION_TESTING.md
npm run test:ai-conversations

# Eval opcional com IA real (precisa de OPENROUTER_API_KEY)
npm run eval:ai-live

# Testes de timing do "digitando"
npm run test:typing-delay

# DB via Prisma Studio
npm run db:studio

# Build de produção (com prisma generate)
npm run build

# Lint
npm run lint
```

---

## 7. Resetar lead de teste

O reset do número QA (`5519998266669`) está disponível pelo **Admin Command Palette** no app:
1. Abrir o app em http://localhost:3000 (ou Vercel)
2. Pressionar **Ctrl+K** (ou **Cmd+K**)
3. Digitar "reset" ou "admin"
4. Selecionar **"Resetar número admin"** e confirmar

O reset apaga: conversas, mensagens, summary, funnelStage, status, lastMessage, aiEnabled=true.
Preserva: tags do lead.

---

## 8. Variáveis de ambiente importantes

Ver `.env.example` para lista completa comentada. Principais:

```env
DATABASE_URL=                          # PostgreSQL Supabase (pooler)
DIRECT_URL=                            # Supabase direct (para migrações)
ADMIN_SESSION_SECRET=                  # JWT do painel admin (defina na Vercel). Aliases: JWT_SECRET, NEXTAUTH_SECRET.
                                       # Em prod sem valor, a sessão é derivada do DATABASE_URL — nunca do "dev-secret" público.
OPENROUTER_API_KEY=                    # Chave da IA
OPENROUTER_DEFAULT_MODEL=deepseek/deepseek-chat
BAILEYS_BRIDGE_API_KEY=local-bridge-key
BAILEYS_BRIDGE_WEBHOOK_URL=https://atendente-ia-eight.vercel.app/api/webhooks/evolution
TYPING_COVER_MS=12000                  # Cobertura de "composing" antes da IA responder
INCOMING_MESSAGE_DEBOUNCE_MS=2500      # Legacy — substituído por waitForInboundSilence
AI_DEBUG=true                          # Liga o snapshot de diagnóstico da IA (dados mascarados). Ver docs/AI_CONVERSATION_TESTING.md
```

---

## 9. Status das funcionalidades

### ✅ Implementado e funcionando em produção

| Funcionalidade | Arquivo principal | Status |
|---|---|---|
| Fluxo WhatsApp completo | `scripts/baileys-bridge.mjs` + `route.ts` | ✅ OK |
| Silêncio/consolidação de burst | `route.ts` — `waitForInboundSilence()` | ✅ OK |
| Typing presence natural | `scripts/baileys-bridge.mjs` | ✅ OK |
| Supressão de reply obsoleto | `scripts/baileys-bridge.mjs` | ✅ OK |
| Classificação foto vs comprovante | `services/ai-safety.service.ts` | ✅ CORRIGIDO |
| PIX automático | `route.ts` — `detectPaymentIntent()` | ✅ OK |
| Análise de comprovante por visão | `services/payment-receipt.service.ts` | ✅ OK |
| Persona Camila (backbone) | `services/prompt.service.ts` | ✅ OK |
| Admin Command Palette (Ctrl+K) | `components/admin-console/` | ✅ OK |
| Reset de lead QA | `services/lead-reset.service.ts` | ✅ OK (só via palette) |
| Dashboard + métricas | `app/dashboard/` | ✅ OK |
| Conversas estilo iMessage | `app/conversas/` | ✅ OK |
| CRM / Leads | `app/leads/` | ✅ OK |
| Pausa global da IA (aiPaused) | `Settings.aiPaused` + dashboard | ✅ OK |
| Auth JWT | `lib/session.ts` | ✅ OK |
| Prospecção Google Maps | `app/prospeccao/` | ✅ OK |
| Auto-deploy Vercel | GitHub → Vercel | ✅ OK |

### ⚠️ Incompleto / pendente

| Item | Detalhe |
|---|---|
| Automações com execução real | UI existe, triggers não disparam |
| `npm run reset-lead` (CLI) | Não existe — usar Command Palette no app |
| Tunnel público estável | Cloudflare tunnel expira; afeta envio manual e disparos |
| Paginação nas listagens | OK até ~500 registros |
| Validação `validatePromptMaster` | Ainda checa preço "9,99" em vez de "R$10" (só log, não bloqueia) |

---

## 10. Janela de silêncio (burst consolidation)

Implementada em `route.ts` — substitui o debounce simples anterior.

```
TEXT_SILENCE_WINDOW_MS = 4000ms    (aguarda 4s sem nova mensagem de texto)
BATCH_SILENCE_WINDOW_MS = 6000ms   (aguarda 6s se tiver mídia no batch)
MAX_BATCH_WAIT_MS = 12000ms        (timeout máximo — nunca espera mais que 12s)
SILENCE_POLL_INTERVAL_MS = 400ms   (frequência do polling)
```

Quando o lead manda várias mensagens em sequência, só a última aciona a IA — e ela recebe todas as mensagens como contexto consolidado.

---

## 11. Classificação foto vs comprovante

Bug histórico: fotos para restaurar eram tratadas como comprovantes de PIX.

**Regra atual (corrigida):**
- `detectPaymentReceipt()` só retorna `true` se:
  - O texto menciona pagamento ("paguei", "comprovante", "fiz o pix", etc.), OU
  - `hasPhoto=true` E o texto da mensagem contém "comprovante" ou "documento" (auto-injetado para `documentMessage`), OU
  - `hasPhoto=true` E `hasRecentPixContext()` retorna true (PIX apareceu no histórico recente)
- O gate na `route.ts` exige: `isWaitingReceipt && hasRecentPixInHistory && detectPaymentReceipt()`
- `hasRecentPixContext()` verifica se "Chave PIX", chave do e-mail, ou "Lucas Agostini" aparecem no histórico

---

## 12. Typing / "digitando"

| Parâmetro | Valor padrão |
|---|---|
| Mensagem curta (≤80 chars) | 2800–3600ms |
| Mensagem média (≤220 chars) | 4700–5600ms |
| Mensagem longa (>220 chars) | 8000–12000ms |
| Floor após IA responder | 3500–4000ms |
| Cobertura inicial (TYPING_COVER_MS) | 12000ms |

Bridge inicia "composing" ANTES de chamar o webhook. Após retorno da IA, aplica o remaining delay com piso de 3500ms.

---

## 13. Arquivos críticos (ler antes de mexer)

| Arquivo | Por que é crítico |
|---|---|
| `app/api/webhooks/evolution/route.ts` | Todo o fluxo de resposta — 1167 linhas |
| `services/ai-safety.service.ts` | Detecção de intent, comprovante, CTA comercial |
| `services/prompt.service.ts` | Backbone da persona Camila |
| `scripts/baileys-bridge.mjs` | Bridge WhatsApp local — typing, stale reply |
| `lib/admin-console/commands.ts` | Definição dos comandos do Ctrl+K |
| `services/lead-reset.service.ts` | Reset de lead por telefone |
| `lib/typing-delay.ts` | Delays de digitação |
| `prisma/schema.prisma` | Schema do banco |

---

## 14. Arquivos para NÃO mexer sem necessidade

- `app/configuracoes/page.tsx` — tem mudanças pré-existentes não commitadas
- `app/disparos/page.tsx` — tem mudanças pré-existentes não commitadas
- `prisma/schema.prisma` — alteração exige migração em produção
- `services/payment-receipt.service.ts` — integração de vision AI para comprovante

---

## 15. Próximos testes obrigatórios

Antes de tráfego real, rodar a sequência:

1. Lead manda mensagem inicial → IA responde sem se apresentar duas vezes
2. Lead envia foto para restaurar → IA reconhece como foto (não comprovante)
3. Lead pergunta preço → IA responde com tabela correta (R$10, R$18…)
4. Lead pede PIX → IA envia dados automaticamente
5. Lead manda comprovante real → IA reconhece, aguarda conferência
6. Lead manda imagem aleatória como fake comprovante → IA pede comprovante válido
7. Lead manda 3 mensagens em sequência → IA responde só na última, consolidando contexto
8. Ctrl+K no painel → "Resetar número admin" funciona

---

## 16. Problemas conhecidos

| Problema | Impacto | Status |
|---|---|---|
| Tunnel Cloudflare expirado | Envio manual e disparos não funcionam | Ativo — criar novo tunnel quando precisar |
| `buildExpectedPaymentData` usa default "9.99" | Valor esperado do comprovante fica desatualizado se a conversa não citou preço | Baixo — não bloqueia, só afeta `matchesAmount` |
| Automações não executam | UI só salva regras, não dispara | Backlog |
| Segredo de sessão (`lib/session.ts`) | **Corrigido** — não usa mais o "dev-secret" público em prod (deriva do DATABASE_URL). **Falta** definir `ADMIN_SESSION_SECRET` no painel da Vercel para um valor dedicado | ⚠️ Ação pendente na Vercel |
| Webhook `/api/webhooks/evolution` sem assinatura | Endpoint público aceita qualquer POST (pode injetar mensagem / gastar crédito de IA) | Recomendado — exige mudança coordenada bridge+webhook |
| Modelo primário pago sem créditos | `OPENROUTER_DEFAULT_MODEL=deepseek/deepseek-chat` retorna **HTTP 402**; produção cai no fallback gratuito (`openai/gpt-oss-20b:free`…). O `eval:ai-live` confirmou que o modelo free passa pelos guardrails | Funcional via fallback — repor créditos só se quiser o deepseek |
| Fix de conversas (`e8c2a28`) não está em produção | Está na branch local `melhorias/roadmap`, **não publicada** no remoto; `origin/main` (Vercel) está em `12d0350`. Deploy exige merge → `main` (ação humana) | ⚠️ Pendente de deploy |

---

## 17. Cuidados para não quebrar

- **Nunca** alterar o regex do PIX key (estudiofotos000@gmail.com) sem atualizar `RECENT_PIX_CONTEXT_PATTERNS`
- **Nunca** remover o `try/finally` em `scripts/baileys-bridge.mjs` — garante que o "composing" para sempre
- **Nunca** comprimir o webhook em `route.ts` sem testar o fluxo de foto vs comprovante
- **Sempre** rodar `npm run test:ai-safety` e `npm run test:typing-delay` depois de alterar `services/ai-safety.service.ts` ou `lib/typing-delay.ts`
- **Sempre** verificar que `INCOMING_MESSAGE_DEBOUNCE_MS` está definido — o debounce antigo foi substituído por `waitForInboundSilence` mas a var ainda existe
- **Push para `main` = deploy imediato na Vercel** — testar localmente antes

---

## 18. Regressão de conversas + diagnóstico (novo)

- `npm run test:ai-conversations` — cenários reais (caso "Sim após Pix", edição simples, comprovante pós-Pix, etc.) sem WhatsApp/DB/LLM.
- `AI_DEBUG=true` — snapshot mascarado por resposta (flags de estado, texto consolidado, resposta bruta x final).
- Correções de estado/guardrail aplicadas: marca `[FOTO_RECEBIDA]` no summary, confirmação afirmativa pós-Pix vira Pix determinístico, supressão de reinício de venda pós-Pix, remoção de eco do bloco anterior.
- **Detalhes completos em `docs/AI_CONVERSATION_TESTING.md`.**

---

## 19. Arquitetura multi-perfil (2026-06-09)

Implementado o primeiro corte real de multi-perfil/oferta.

### Perfis existentes

1. `restauracao-fotos`
   - Nome: `Restauração de Fotos`
   - Pix: `estudiofotos000@gmail.com` / `Lucas Agostini` / `Nubank`
   - Status inicial seguro: `PAUSED`
   - `aiEnabled`: `false` por padrão na criação
   - Usa o WhatsApp/bridge atual como fallback compatível

2. `musica-personalizada`
   - Nome: `Música Personalizada`
   - Status: `AWAITING_WHATSAPP`
   - `aiEnabled`: `false`
   - Prompt placeholder criado
   - Ainda sem Pix definitivo e sem WhatsApp conectado

### Banco / schema

- Novo enum: `ProfileStatus`
  - `ACTIVE`
  - `PAUSED`
  - `AWAITING_WHATSAPP`
  - `DISCONNECTED`
- Novo model: `Profile`
  - campos: `id`, `name`, `slug`, `description`, `status`, `aiEnabled`, `whatsappNumber`, `whatsappSessionName`, `pixKey`, `pixName`, `pixBank`, `promptConfig`, `settings`, `createdAt`, `updatedAt`
- `Lead`
  - ganhou `profileId`
  - `phone` deixou de ser único global
  - novo composto único: `@@unique([profileId, phone])`
- `Prompt`
  - ganhou `profileId`
- Migration criada:
  - `prisma/migrations/20260609_multi_profile/migration.sql`

### Bootstrap / backfill

- Serviço novo: `services/profile.service.ts`
- `ensureDefaultProfiles()` faz:
  - upsert dos perfis padrão
  - backfill de leads sem `profileId` para `restauracao-fotos`
  - backfill de prompts sem `profileId` para `restauracao-fotos`
  - criação automática de prompt placeholder para `musica-personalizada`
- Teste dedicado:
  - `npm run test:profiles`

### Seleção de perfil no app

- Seletor global no shell autenticado
- Cookie usado: `active-profile`
- Query param suportado e preferido:
  - `?profile=restauracao-fotos`
  - `?profile=musica-personalizada`
- Arquivos centrais:
  - `components/layout/profile-switcher.tsx`
  - `hooks/use-profiles.ts`
  - `lib/profile-utils.ts`
  - `app/api/profiles/route.ts`

### Escopo por perfil já aplicado

- Dashboard
- Conversas
- Leads
- Prompt
- Status de integrações
- Toggle de IA
- Webhook WhatsApp
- Envio manual `/api/evolution/send`
- Importação do prospector para CRM

### Webhook / bridge

- `scripts/baileys-bridge.mjs` agora envia `profileSlug` no payload do webhook
- ENV suportada no bridge:
  - `WHATSAPP_PROFILE_SLUG`
  - fallback: `PROFILE_SLUG`
- Se o webhook não receber `profileSlug`, cai em:
  - `restauracao-fotos`

### IA por perfil

- O webhook resolve o `Profile` antes de responder
- `Prompt` agora é carregado por `profileId`
- `composeSystemPrompt()` recebe o perfil ativo
- A IA só responde se:
  - `settings.aiPaused !== true` (trava global de segurança)
  - `profile.aiEnabled === true`
  - lead não estiver em takeover humano

### Limitações atuais (intencionais)

- `musica-personalizada` ainda não tem funil comercial definitivo
- `musica-personalizada` ainda não tem Pix definitivo
- `musica-personalizada` ainda não tem bridge/WhatsApp dedicado
- O bridge atual continua monoperfil na prática; o `profileSlug` já prepara o caminho para múltiplos números, mas ainda não existe gerenciador avançado local
- `app/configuracoes/page.tsx` e `app/disparos/page.tsx` continuaram intocados por causa das mudanças locais pré-existentes

### Comandos úteis

- `npm run test:profiles`
- `npm run test:webhook-logic`
- `npm run test:ai-safety`
- `npm run test:ai-conversations`
- `npm run bridge`

---

*Última atualização: 2026-06-09*
