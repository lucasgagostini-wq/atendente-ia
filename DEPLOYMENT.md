# Deployment — Atendente IA

## 1. Pré-requisitos locais

### PostgreSQL
O projeto usa PostgreSQL local. Instale e inicie antes de rodar:

```bash
# Windows — instalar via Chocolatey
choco install postgresql --version=16

# Iniciar o serviço
pg_ctl start

# Criar banco
createdb atendente_ia
```

Ou use a GUI: https://www.postgresql.org/download/windows/

### Variáveis de ambiente
Copie `.env` e preencha as chaves reais:

| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | PostgreSQL local (já preenchido) |
| `ADMIN_SETUP_TOKEN` | Qualquer string aleatória forte |
| `JWT_SECRET` | Qualquer string aleatória longa |
| `EVOLUTION_API_URL` | Sua instância da Evolution API |
| `EVOLUTION_API_KEY` | Painel da Evolution API |
| `EVOLUTION_INSTANCE_NAME` | Nome da sua instância |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys (gratuito) |
| `APIFY_API_TOKEN` | https://apify.com (opcional) |

---

## 2. Primeiro uso (setup local)

```bash
# 1. Instalar dependências
npm install

# 2. Criar tabelas no banco
npm run db:migrate

# 3. Popular dados iniciais (prompts, automações, tags)
npm run db:seed

# 4. Iniciar em desenvolvimento
npm run dev
```

Acesse: http://localhost:3000

### Criar conta admin (primeira vez)
1. Acesse `/setup-admin`
2. Informe o `ADMIN_SETUP_TOKEN` do `.env`
3. Crie seu e-mail e senha
4. Faça login em `/login`

---

## 3. Deploy na Vercel

### Opção A — Deploy automático via GitHub (recomendado)

1. Crie um repositório no GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit"
   git remote add origin https://github.com/SEU_USUARIO/atendente-ia.git
   git push -u origin main
   ```

2. Acesse https://vercel.com/new e importe o repositório.

3. A Vercel detecta Next.js automaticamente.

4. Configure as **Environment Variables** no painel da Vercel:
   - Todas as variáveis do `.env` (exceto `DATABASE_URL`)
   - Para produção use um banco externo: [Neon](https://neon.tech), [Supabase](https://supabase.com), ou [Railway](https://railway.app)

5. Cada push para `main` faz deploy automático.

### Opção B — Deploy manual via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy de preview
npm run deploy:preview

# Deploy de produção
npm run deploy:prod
```

---

## 4. Banco de dados em produção

Para produção, use um banco PostgreSQL externo. Opções gratuitas:

| Serviço | Gratuito | Link |
|---|---|---|
| Neon | 512 MB | https://neon.tech |
| Supabase | 500 MB | https://supabase.com |
| Railway | $5 free credit | https://railway.app |

Configure `DATABASE_URL` na Vercel com a URL do banco externo.

```bash
# Rodar as migrações no banco de produção
DATABASE_URL="sua-url-externa" npx prisma migrate deploy
```

---

## 5. Verificar se o deploy automático está ativo

No painel da Vercel:
- Settings → Git → Connected Git Repository
- Deve mostrar seu repositório e a branch `main`
- Cada push dispara um novo deploy automaticamente

---

## 6. O que fazer quando o build falhar

```bash
# Verificar localmente antes de fazer push
npm run check   # lint + build

# Se der erro de Prisma
npm run db:generate

# Verificar tipos
npx tsc --noEmit
```

---

## 7. Webhook da Evolution API

Após o deploy, configure o webhook na Evolution API:

```
URL: https://SEU-DOMINIO.vercel.app/api/webhooks/evolution
```

Ou use o campo "Webhook URL" em `/configuracoes` dentro da plataforma — ele preenche automaticamente com a URL correta.
