# Testando o comportamento da IA sem WhatsApp

> Como diagnosticar e validar o que a Camila responde **sem depender de teste
> manual no WhatsApp**. Leia antes de mexer em `services/ai-safety.service.ts`,
> `services/prompt.service.ts` ou no fluxo do webhook.

---

## 1. Visão geral

Há três camadas de teste, da mais rápida à mais cara:

| Camada | Comando | Rede/DB? | Quando usar |
|---|---|---|---|
| Regras puras de segurança | `npm run test:ai-safety` | Não | Mudou guardrail/estado em `ai-safety.service.ts` |
| Orquestração do webhook | `npm run test:webhook-logic` | Não | Mudou parsing/batch/gates do webhook |
| **Conversas reais (regressão)** | `npm run test:ai-conversations` | Não | **Mudou qualquer coisa que afete a resposta** |
| Eval com IA real (opcional) | `npm run eval:ai-live` | Sim (OpenRouter) | Suspeita de modelo fraco / prompt ruim |

As três primeiras são determinísticas e entram no CI. A `eval:ai-live` é manual.

---

## 2. `npm run test:ai-conversations`

Roda cenários reais de conversa por um **simulador puro** que replica, passo a
passo, a árvore de decisão de `app/api/webhooks/evolution/route.ts`:

```
batch consolidado → gate de comprovante → gate de Pix → resposta IA + guardrails
```

Sem WhatsApp, sem banco, sem chamar o modelo. O texto criativo do modelo é
**injetado** pelo fixture (`mockModelResponse`); o que testamos é a
**orquestração** e os **guardrails determinísticos** em cima dele.

Saída de exemplo:

```
✅ real_case_sim_after_pix — CASO REAL: 'Sim' após CTA de Pix não pode pedir foto de novo
   causa coberta: estado + guardrail (bug de código) | rota: payment_intent | msgs: 4
```

Arquivos:

| Arquivo | Papel |
|---|---|
| `tests/ai-conversations/fixtures.ts` | Os cenários (estado da conversa + expectativas) |
| `tests/ai-conversations/simulate.ts` | Simulador puro da árvore de decisão do webhook |
| `tests/ai-conversations/asserts.ts` | Listas de frases proibidas/obrigatórias |
| `tests/ai-conversations/run.ts` | Runner que roda tudo e falha o processo em violação |
| `tests/ai-conversations/eval-live.ts` | Modo opcional com IA real |

---

## 3. Adicionar um caso real novo

1. Abra `tests/ai-conversations/fixtures.ts` e adicione um objeto ao array `fixtures`.
2. Descreva o **estado** no momento da resposta:
   - `recentHistory`: linhas `"Lead: ..."` e `"Atendente: ..."` (a foto entra como `"Lead: Cliente enviou uma foto para restaurar."`).
   - `summary`: marcas persistentes, ex. `"[FOTO_RECEBIDA]"`, `"[PAGAMENTO: WAITING_PAYMENT_RECEIPT]"`.
   - `batch`: as mensagens que acabaram de chegar. Imagem = `{ content: "...", type: "IMAGE" }`.
   - `mockModelResponse`: o que o modelo "diria" (só usado se cair na rota `ai_response`). Capriche em colocar o **pior caso** que o modelo poderia gerar — o teste prova que o guardrail conserta.
   - `mockReceiptAnalysis`: para imagens pós-Pix, simula a análise de visão (ex. `{ isRandomImage: true }`).
3. Defina `expect`:
   - `route`: `"payment_intent" | "payment_receipt" | "ai_response"`.
   - `required` / `forbidden`: use os grupos de `asserts.ts` (`REQUIRED_IN_PIX`, `POST_PHOTO_FORBIDDEN`, `ALWAYS_FORBIDDEN`, …) ou regex próprios.
   - `maxMessages`: garante mensagens curtas.
4. `classification`: a causa-raiz que o cenário protege (prompt/contexto/estado/guardrail/modelo/bug).
5. Rode `npm run test:ai-conversations`.

---

## 4. Eval com IA real (opcional)

```bash
# Usando a chave do .env (tsx não carrega .env sozinho — passe --env-file):
npx tsx --env-file=.env tests/ai-conversations/eval-live.ts
# ou, com a chave no ambiente:
OPENROUTER_API_KEY=sk-or-... npm run eval:ai-live
```

Chama o modelo de verdade para os cenários de resposta livre (os 5 que passam
pela rota `ai_response`), aplica os guardrails e verifica se **a saída final
ainda viola alguma regra dura**. Útil para responder "o modelo gratuito está bom
o suficiente?".

Detalhes importantes:

- **Cadeia de modelos = produção.** O primário (`OPENROUTER_DEFAULT_MODEL`,
  hoje `deepseek/deepseek-chat`) é **pago**: sem créditos retorna **HTTP 402**.
  O eval então cai nos modelos gratuitos (`openai/gpt-oss-20b:free`, …), igual ao
  `services/openrouter.service.ts`. O log mostra `Modelo usado: ...`.
- Os cenários **Sim→Pix** e **imagem→comprovante** NÃO entram aqui: são
  determinísticos (não passam pelo modelo) e já são cobertos por
  `test:ai-conversations`.
- Sem `OPENROUTER_API_KEY`, ele explica e sai com código 0 (não quebra o CI).
- Se **todos** os modelos falharem (ex.: 402 sem fallback), ele NÃO reporta passe
  — sai com código 1 deixando claro que nada foi avaliado.
- Não toca no banco (usa um backbone de prompt embutido).

### Teste real no WhatsApp ANTES do deploy

O bridge local aponta o webhook para a **Vercel de produção**. Se o fix ainda
não está em produção, um teste no WhatsApp seria processado pelo código **antigo**.
Para validar a correção no fluxo real **antes** de deployar:

1. Pare o bridge de produção (o que aponta pra Vercel).
2. Rode `npm run start:local` — sobe o Next em `localhost:3000` + bridge apontando
   pro webhook local (`scripts/bridge-local.mjs`). Agora o WhatsApp é processado
   pelo código **com o fix**.
3. Faça o roteiro manual (foto → edição → "?" → "Sim" → imagem como comprovante).
4. Para voltar ao normal (bridge → produção), use `npm run bridge`.

> Reset do lead de teste (`5519998266669`): **não há** `npm run reset-lead`. Use
> o Admin Command Palette no app: **Ctrl+K → "Resetar número admin"**.

---

## 5. Diagnóstico ao vivo: `AI_DEBUG=true`

Para entender **por que** a IA respondeu algo numa conversa real, ligue:

```env
AI_DEBUG=true
```

A cada resposta, o webhook emite um snapshot (no console e como log
`AI_DEBUG_SNAPSHOT`) com:

- `leadIdMasked`, `phoneMasked` (telefone mascarado: `55*********44`)
- `funnelStageBefore` / `funnelStageAfter`
- `flags`: `hasServiceImage`, `askedForPix`, `pixAlreadySent`, `awaitingReceipt`, `isReceiptCandidate`, `serviceType`
- `batchSize` (quantas mensagens no bloco consolidado)
- `consolidatedText` (texto enviado ao modelo)
- `rawResponse` (resposta bruta do modelo) e `finalResponse` (após guardrails)
- `route`: `ai_response` | `payment_intent` | `payment_receipt:<decisão>`

**Nunca** loga: chave OpenRouter, token, `DATABASE_URL` nem base64 de imagem
(tudo passa por `redactText` em `lib/ai-debug.ts`).

---

## 6. Interpretando falhas

Quando um cenário falha, o runner imprime a causa e a saída final:

```
❌ x_meu_caso — ...
   causa: guardrail
   · proibido encontrado: /me manda a foto/
   · obrigatório ausente: /r\$\s*10\b/
   saída final:
     ...
```

Classifique o problema antes de "só mexer no prompt":

| Sintoma | Causa provável | Onde corrigir |
|---|---|---|
| Pede a foto de novo | **estado** (foto saiu da janela de histórico) | `conversationHasServiceImage` / marca `[FOTO_RECEBIDA]` |
| Manda Pix e ainda vende | **guardrail** ausente pós-Pix | `pixDataAlreadySent` + `removePostPixSaleRestart` |
| "Sim" não fecha o Pix | **estado** (confirmação não detectada) | `detectPaymentIntent` + `lastAssistantOfferedPix` |
| Repete o bloco inteiro no "?" | **contexto/modelo** | `removeEchoedAssistantLines` |
| Usa "avó/lembrança" sem o cliente trazer | **prompt** | bloco `SERVICOS`/`FOTOS DE FAMILIA` em `prompt.service.ts` |
| Palavra proibida ("créditos", "prévia grátis" oferecida) | **guardrail** | `FORBIDDEN_PATTERNS` / `normalizeCommercialResponse` |
| Modelo ignora regra mesmo com prompt bom | **modelo fraco** | trocar modelo (OpenRouter) — confirmar com `eval:ai-live` |

---

## 7. Regras críticas antes de mandar tráfego

Estas precisam estar **verdes** em `test:ai-conversations` antes de qualquer campanha:

1. Foto já recebida → **nunca** pedir a foto de novo.
2. Pix enviado → **nunca** reabrir venda nem re-ofertar Pix; conduzir só pro comprovante.
3. "Sim" após "Quer que eu te mande o Pix?" → enviar Pix correto + pedir comprovante.
4. Imagem depois do Pix → tratar como comprovante (válido ou pedir comprovante válido), nunca nova venda.
5. Edição simples (ex. "tirar a pessoa do meio") → reconhecer como serviço, R$10, sem linguagem emocional.
6. Restauração emocional (avó/falecido) → acolher, R$10, sem perguntar quantidade.
7. Prévia grátis → negar com educação; **nunca oferecer** prévia.
8. Preço/concorrente barato → sem desconto, manter R$10, reforçar cuidado.
9. Mensagens curtas (≤180 chars, no máx. 3 partes).

---

## 8. Caso real que originou esta suíte

Conversa: `Oi` → foto → `Tirar a pessoa do meio` → `?` → `Sim`. A IA mandava o
Pix **e** pedia a foto de novo, e podia reabrir a venda depois do Pix.

**Causa-raiz (não era só prompt):**

| Falha | Classificação | Correção |
|---|---|---|
| Pediu a foto de novo | **bug de código / estado** — `hasPhoto` vinha só do burst + `slice(-6)`; a foto saía da janela | Estado persistente: `[FOTO_RECEBIDA]` no summary + `conversationHasServiceImage` lendo histórico completo |
| "Sim" não disparou o Pix determinístico | **estado / guardrail ausente** | `detectPaymentIntent` passou a tratar confirmação afirmativa após oferta de Pix (`lastAssistantOfferedPix`) |
| Pix + pedido de foto na mesma resposta | **guardrail ausente** | "Sim" agora cai no Pix determinístico (`sendPixAsSeparateMessage`), que nunca pede foto |
| Reabertura de venda pós-Pix | **guardrail ausente** | `pixDataAlreadySent` + `removePostPixSaleRestart` em `ensureSalesCTA`/`normalizeCommercialResponse` |
| Repetição do bloco no "?" | **contexto/modelo** | `removeEchoedAssistantLines` |
| Edição simples não reconhecida | **prompt** | bloco `SERVICOS ALEM DE RESTAURAR` em `prompt.service.ts` |

Cada uma virou um cenário em `fixtures.ts` (`real_case_sim_after_pix`, `a_`–`g_`).
