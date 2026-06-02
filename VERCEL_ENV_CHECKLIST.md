# Vercel — Variáveis de Ambiente Obrigatórias

Acesse: https://vercel.com/dashboard → atendente-ia → Settings → Environment Variables

## ✅ Checklist

- [ ] `DATABASE_URL`
  - Banco externo PostgreSQL (não localhost)
  - Obter grátis: https://neon.tech → criar projeto → copiar "Connection string"
  - Formato: `postgresql://user:pass@host/dbname?sslmode=require`

- [ ] `JWT_SECRET`
  - Qualquer string longa e aleatória (min. 32 chars)
  - Exemplo: `minha-chave-super-secreta-aleatoria-2024`

- [ ] `ADMIN_SETUP_TOKEN`
  - Token para criar o primeiro admin em `/setup-admin`
  - Exemplo: `atendente-setup-2024`

- [ ] `OPENROUTER_API_KEY`
  - Chave da IA (modelos gratuitos disponíveis)
  - Obter grátis: https://openrouter.ai/keys → Create Key
  - Formato: `sk-or-v1-...`

- [ ] `NEXT_PUBLIC_APP_URL`
  - URL pública do seu projeto na Vercel
  - Exemplo: `https://atendente-ia.vercel.app`

## ⚠️ Opcional (só para WhatsApp real)

- [ ] `EVOLUTION_API_URL` — URL da instância Evolution API
- [ ] `EVOLUTION_API_KEY` — Chave da instância
- [ ] `EVOLUTION_INSTANCE_NAME` — Nome da instância

## Após configurar

1. Acesse `https://seu-dominio.vercel.app/setup-admin`
2. Use o `ADMIN_SETUP_TOKEN` para criar sua conta admin
3. Faça login em `/login`
