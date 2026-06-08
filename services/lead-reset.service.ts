import { FunnelStage, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ResetLeadByPhoneResult = {
  phone: string;
  leadId: string;
  deletedConversations: number;
  deletedMessagesViaCascade: number;
  deletedRelatedLogs: number;
  preservedTags: number;
};

function normalizePhone(phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");

  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    throw new Error("Telefone invalido para reset.");
  }

  return cleanPhone;
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function logMatchesTerms(
  log: { message: string; payload: Prisma.JsonValue | null },
  terms: string[],
) {
  const haystack = `${log.message}\n${stringifyValue(log.payload)}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

class LeadResetService {
  async resetLeadByPhone(phone: string): Promise<ResetLeadByPhoneResult> {
    const cleanPhone = normalizePhone(phone);

    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { phone: cleanPhone },
        include: {
          conversations: {
            select: { id: true },
          },
          leadTags: {
            select: { tagId: true },
          },
        },
      });

      if (!lead) {
        throw new Error("Lead nao encontrado para o telefone informado.");
      }

      const conversationIds = lead.conversations.map((conversation) => conversation.id);
      const messageCount = await tx.message.count({
        where: {
          leadId: lead.id,
        },
      });

      const searchTerms = [cleanPhone, lead.id, ...conversationIds];
      const candidateLogs = await tx.log.findMany({
        select: {
          id: true,
          message: true,
          payload: true,
        },
      });

      const relatedLogIds = candidateLogs
        .filter((log) => logMatchesTerms(log, searchTerms))
        .map((log) => log.id);

      if (relatedLogIds.length > 0) {
        await tx.log.deleteMany({
          where: {
            id: { in: relatedLogIds },
          },
        });
      }

      if (conversationIds.length > 0) {
        await tx.conversation.deleteMany({
          where: {
            id: { in: conversationIds },
          },
        });
      }

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          summary: null,
          funnelStage: FunnelStage.COLD,
          status: LeadStatus.NEW,
          interest: null,
          objections: Prisma.DbNull,
          lastMessage: null,
          lastMessageAt: null,
          aiEnabled: true,
          humanTakeover: false,
        },
      });

      return {
        phone: cleanPhone,
        leadId: lead.id,
        deletedConversations: conversationIds.length,
        deletedMessagesViaCascade: messageCount,
        deletedRelatedLogs: relatedLogIds.length,
        preservedTags: lead.leadTags.length,
      };
    });
  }
}

export const leadResetService = new LeadResetService();
export type { ResetLeadByPhoneResult };
