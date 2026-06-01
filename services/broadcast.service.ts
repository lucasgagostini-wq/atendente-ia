import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomBetween, sleep } from "@/lib/utils";
import { conversationService } from "@/services/conversation.service";
import { evolutionService } from "@/services/evolution.service";
import { openRouterService } from "@/services/openrouter.service";

type BroadcastSuggestionArgs = {
  tagName: string;
  objective?: string;
  baseMessage?: string;
};

type RunBroadcastArgs = {
  tagId: string;
  campaignName?: string;
  baseMessage: string;
  variations: string[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  maxLeads: number;
};

type BroadcastFailure = {
  leadId: string;
  phone: string;
  reason: string;
};

function pickUniqueNonEmpty(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function parseJsonObjectFromText(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

class BroadcastService {
  private isDialablePhone(phone: string) {
    return /^\d{10,15}$/.test(phone);
  }

  private personalizeMessage(
    template: string,
    lead: { name: string | null; phone: string; interest: string | null },
    tagName: string,
  ) {
    const firstName = (lead.name || "").trim().split(/\s+/).filter(Boolean)[0] || "tudo bem";

    return template
      .replaceAll("{nome}", lead.name?.trim() || "Tudo bem")
      .replaceAll("{primeiro_nome}", firstName)
      .replaceAll("{telefone}", lead.phone)
      .replaceAll("{interesse}", lead.interest || tagName)
      .replaceAll("{tag}", tagName);
  }

  async generateSuggestion(args: BroadcastSuggestionArgs) {
    const generated = await openRouterService.generateResponse({
      maxTokens: 550,
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content:
            "Você é estrategista de copy para outreach B2B por WhatsApp. Responda APENAS em JSON válido.",
        },
        {
          role: "user",
          content: [
            `Nicho/Tag: ${args.tagName}`,
            `Objetivo: ${args.objective || "Iniciar conversa com potencial cliente"}`,
            args.baseMessage ? `Mensagem base: ${args.baseMessage}` : null,
            "Retorne JSON com formato:",
            '{"suggestedMessage":"...", "variations":["...", "...", "..."], "tips":["...", "..."]}',
            "Regras:",
            "- texto curto e natural em português do Brasil",
            "- sem linguagem robótica",
            "- não usar promessas irreais",
            "- máximo de 3 variações",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const parsed = parseJsonObjectFromText(generated.output);
    const suggestedMessage =
      (typeof parsed?.suggestedMessage === "string" && parsed.suggestedMessage.trim()) ||
      args.baseMessage ||
      generated.output.trim();

    const parsedVariations = Array.isArray(parsed?.variations)
      ? parsed?.variations.filter((item): item is string => typeof item === "string")
      : [];

    const variations = pickUniqueNonEmpty(parsedVariations).slice(0, 3);

    return {
      suggestedMessage,
      variations,
      model: generated.model,
      raw: generated.output,
    };
  }

  async runTagBroadcast(args: RunBroadcastArgs) {
    if (args.minIntervalSeconds > args.maxIntervalSeconds) {
      throw new Error("Intervalo mínimo não pode ser maior que o máximo.");
    }

    const tag = await prisma.tag.findUnique({
      where: { id: args.tagId },
    });

    if (!tag) {
      throw new Error("Tag não encontrada.");
    }

    const leadsWithTag = await prisma.lead.findMany({
      where: {
        leadTags: {
          some: { tagId: args.tagId },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    const dialableLeads = leadsWithTag.filter((lead) => this.isDialablePhone(lead.phone));
    const recipients = dialableLeads.slice(0, args.maxLeads);

    if (recipients.length === 0) {
      throw new Error("Nenhum lead com telefone válido para esta tag.");
    }

    const baseTemplates = pickUniqueNonEmpty([args.baseMessage, ...args.variations]);
    if (baseTemplates.length === 0) {
      throw new Error("Mensagem de disparo vazia.");
    }

    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const failures: BroadcastFailure[] = [];
    let sent = 0;

    for (let index = 0; index < recipients.length; index += 1) {
      const lead = recipients[index];
      const template = baseTemplates[index % baseTemplates.length];
      const text = this.personalizeMessage(template, lead, tag.name);

      try {
        const conversation = await conversationService.getOrCreateOpenConversation(lead.id);
        const sentPayload = await evolutionService.sendText(lead.phone, text);
        const safeSentPayload = JSON.parse(
          JSON.stringify(sentPayload ?? null),
        ) as Prisma.InputJsonValue;

        await conversationService.saveMessage({
          conversationId: conversation.id,
          leadId: lead.id,
          direction: "OUTBOUND",
          role: "HUMAN",
          type: "TEXT",
          content: text,
          metadata: {
            source: "broadcast",
            runId,
            campaignName: args.campaignName || "Disparo manual",
            tagId: tag.id,
            tagName: tag.name,
            sentPayload: safeSentPayload,
          } as Prisma.InputJsonValue,
        });

        sent += 1;
      } catch (error) {
        failures.push({
          leadId: lead.id,
          phone: lead.phone,
          reason: error instanceof Error ? error.message : "erro desconhecido",
        });
      }

      if (index < recipients.length - 1) {
        await sleep(randomBetween(args.minIntervalSeconds, args.maxIntervalSeconds) * 1000);
      }
    }

    const attempted = recipients.length;
    const failed = failures.length;
    const skipped = leadsWithTag.length - attempted;

    await prisma.log.create({
      data: {
        type: "BROADCAST_RUN",
        message: `${args.campaignName || "Disparo manual"} | tag=${tag.name} | enviados=${sent}/${attempted}`,
        payload: {
          runId,
          tagId: tag.id,
          tagName: tag.name,
          campaignName: args.campaignName || "Disparo manual",
          totalLeadsWithTag: leadsWithTag.length,
          totalEligible: dialableLeads.length,
          attempted,
          sent,
          failed,
          skipped,
          failures,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      runId,
      tagId: tag.id,
      tagName: tag.name,
      totalEligible: dialableLeads.length,
      attempted,
      sent,
      failed,
      skipped,
      failures,
    };
  }
}

export const broadcastService = new BroadcastService();
