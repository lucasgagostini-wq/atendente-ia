# Atendente IA

SaaS/local de atendimento automatizado para WhatsApp com IA, focado em vendas e suporte de ofertas digitais.

## Visão geral

Fluxo principal:

Tráfego -> Landing -> WhatsApp -> Evolution API -> Backend Next.js -> OpenRouter -> Memória em PostgreSQL/Prisma -> Conversa contínua -> Conversão

Principais entregas:

- Dashboard operacional com métricas
- Tela de conversas estilo WhatsApp Web
- Gestão de leads com funil e resumo
- Automações de follow-up
- Prompt master editável
- Configurações de Evolution/OpenRouter
- Módulo de prospecção Google Maps com importação para CRM
- Webhook funcional para mensagens inbound
- IA com fallback e logs

## Stack

- Next.js 14 + TypeScript
- Tailwind CSS + componentes estilo shadcn/ui
- Prisma ORM + PostgreSQL
- Supabase client preparado
- Evolution API (conexão, status, envio, reconexão, webhook)
- OpenRouter API (modelos, temperatura, fallback, logs)
- Zustand, React Query, Framer Motion

## Estrutura

```txt
atendente-ia/
  app/
    dashboard/
    conversas/
    leads/
    automacoes/
    prompt/
    configuracoes/
    api/
  components/
  lib/
  services/
  hooks/
  store/
  prisma/
  types/
  scripts/
```

## Como instalar

1. Instale dependências:

```bash
npm install
```

2. Copie variáveis:

```bash
cp .env.example .env
```

3. Configure seu PostgreSQL em `DATABASE_URL`.

4. Gere e aplique Prisma:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Rode o projeto:

```bash
npm run dev
```

App em: [http://localhost:3000](http://localhost:3000)

## Setup rápido (script único)

```bash
npm run setup
```

Esse script executa:

1. `npm install`
2. `npx prisma generate`
3. `npx prisma migrate dev --name init`
4. `npm run db:seed`
5. `npm run dev`

## Configuração de ambiente (.env)

A lista completa e comentada está em `.env.example`. Campos essenciais:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Autenticação do painel (OBRIGATÓRIO em produção — sem isso o JWT usa "dev-secret")
ADMIN_SESSION_SECRET=
ADMIN_SETUP_TOKEN=
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=
OPENROUTER_API_KEY=
OPENROUTER_DEFAULT_MODEL=deepseek/deepseek-chat
APIFY_API_TOKEN=
PROSPECTOR_MAPS_ACTOR_ID=compass/crawler-google-places
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Variáveis adicionais (modelos de fallback/visão, timeouts da IA e ajuste fino
> do "digitando") estão documentadas no `.env.example`.

## Evolution API (WhatsApp)

No painel `/configuracoes`:

1. Defina `Evolution API URL`, `API Key` e `Instance Name`
2. Clique em `Conectar / QR Code`
3. Escaneie o QR quando retornado pela API
4. Clique em `Atualizar status`
5. Use `Testar envio` para validar mensagem outbound

Webhook esperado:

`POST /api/webhooks/evolution`

### Modo sem custo com Baileys (bridge local)

Este projeto inclui um bridge compatível com os endpoints da Evolution:

```bash
npm run bridge:baileys
```

Variáveis opcionais:

```env
BAILEYS_BRIDGE_PORT=8080
BAILEYS_BRIDGE_API_KEY=troque-essa-chave
BAILEYS_BRIDGE_INSTANCE_NAME=atendente-ia
BAILEYS_BRIDGE_WEBHOOK_URL=
```

Depois, no painel `/configuracoes`, informe:

1. `Evolution API URL`: URL pública do bridge (ex: túnel Cloudflare)
2. `Evolution API Key`: mesma `BAILEYS_BRIDGE_API_KEY`
3. `Instance Name`: mesma `BAILEYS_BRIDGE_INSTANCE_NAME`

## OpenRouter

No painel `/configuracoes`:

1. Informe `OpenRouter API Key`
2. Selecione modelo padrão
3. Ajuste temperatura e salve

Endpoint usado:

`https://openrouter.ai/api/v1/chat/completions`

Se a chave não estiver configurada, o sistema usa fallback local (mock) para continuar o fluxo.

## Endpoints principais

- `POST /api/webhooks/evolution`
- `POST /api/ai/respond`
- `GET|POST /api/prospector/jobs`
- `GET /api/prospector/jobs/[id]`
- `POST /api/prospector/jobs/[id]/import`
- `GET /api/evolution/status`
- `POST /api/evolution/connect`
- `POST /api/evolution/reconnect`
- `POST /api/evolution/send`
- `GET|POST /api/leads`
- `GET|PATCH /api/leads/[id]`
- `GET|POST /api/conversations`
- `GET|PATCH /api/conversations/[id]`
- `GET|PATCH /api/settings`
- `GET|PATCH /api/prompt`
- `GET|POST /api/automations`
- `PATCH|DELETE /api/automations/[id]`

## Prospecção Google Maps

Na rota `/prospeccao` você pode:

1. Informar nicho + cidade (ex: `dentista em Porto Alegre`)
2. Definir quantidade de resultados
3. Executar varredura via Apify
4. Selecionar os registros retornados
5. Importar para o CRM (`/leads`) com tags automáticas:
   - `Prospectado`
   - `Google Maps`

## Como testar webhook

Exemplo cURL local:

```bash
curl -X POST http://localhost:3000/api/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "MESSAGES_UPSERT",
    "data": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
      "message": { "conversation": "Oi, qual o valor?" },
      "pushName": "Lead Teste"
    }
  }'
```

## Prompt padrão inicial

O seed cria a atendente `Camila` com:

- comunicação curta e humana em PT-BR
- uma pergunta por vez
- foco em qualificação e checkout
- pausa de IA ao pedir humano
- sem invenções e sem tom robótico

## Scripts e validação

```bash
npm run lint              # ESLint
npm run build             # Prisma generate + build de produção
npm run check             # lint + build
npm run test:ai-safety    # cenários de segurança da IA (sem custo de API)
npm run test:typing-delay # valida os ranges do "digitando"
npm run start:local       # app + bridge Baileys juntos (concurrently)
```

## Próximos passos sugeridos

1. Criar jobs para follow-up automático por cron/queue
2. Implementar parser robusto de eventos por versão da Evolution
3. Acrescentar observabilidade (Sentry + métricas)
4. Incluir testes e2e para webhook e funil de conversão
5. Expor o bridge local com URL pública estável (túnel) para envio manual/disparos e status server-side
