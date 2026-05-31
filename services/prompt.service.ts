import { Lead, Prompt } from "@prisma/client";
import { prisma } from "@/lib/prisma";

class PromptService {
  async getPrompt() {
    const prompt = await prisma.prompt.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!prompt) {
      return prisma.prompt.create({
        data: {
          name: "Prompt Principal",
          personality: "Atendente virtual Camila",
          tone: "natural e objetivo",
          goal: "Levar o lead para o checkout",
          rules: "Sempre responder em português brasileiro.",
          faq: "FAQ ainda não preenchido.",
          objections: "Sem objeções cadastradas.",
          offer: "Oferta digital não configurada.",
          transferTriggers: "Pedido explícito por humano.",
          cta: "Quer que eu envie o checkout agora?",
          isActive: true,
        },
      });
    }

    return prompt;
  }

  async getActivePrompt() {
    const activePrompt = await prisma.prompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    if (activePrompt) return activePrompt;
    return this.getPrompt();
  }

  async updatePrompt(data: Partial<Prompt>) {
    const current = await this.getPrompt();

    return prisma.prompt.update({
      where: { id: current.id },
      data,
    });
  }

  composeSystemPrompt(args: {
    prompt: Prompt;
    lead: Lead;
    recentHistory: string[];
  }) {
    const { prompt, lead, recentHistory } = args;

    return `
${prompt.personality}

Objetivo principal:
${prompt.goal}

Tom de voz:
${prompt.tone}

Regras de atendimento:
${prompt.rules}

FAQ:
${prompt.faq}

Quebra de objeções:
${prompt.objections}

Informações da oferta:
${prompt.offer}

CTA padrão:
${prompt.cta}

Gatilhos para transferência para humano:
${prompt.transferTriggers}

Link de checkout:
${prompt.checkoutUrl || "Não configurado"}

Contexto do lead:
- Nome: ${lead.name ?? "Não informado"}
- Telefone: ${lead.phone}
- Estágio: ${lead.funnelStage}
- Resumo: ${lead.summary ?? "Sem resumo"}
- Última mensagem: ${lead.lastMessage ?? "Sem mensagem anterior"}

Histórico recente:
${recentHistory.length ? recentHistory.join("\n") : "Sem histórico recente"}

Comportamento obrigatório:
- Respostas curtas em português brasileiro informal.
- Uma pergunta por vez.
- Não diga que você é IA.
- Não invente informações.
- Não insista após negativa clara.
- Quando houver intenção real de compra, envie checkout de forma natural.
`.trim();
  }
}

export const promptService = new PromptService();

