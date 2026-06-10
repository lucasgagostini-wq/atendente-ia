import {
  ConversationStatus,
  MessageDirection,
  MessageRole,
  MessageType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leadService } from "@/services/lead.service";

type ConversationFilters = {
  profileId?: string;
  search?: string;
  status?: ConversationStatus;
  stage?: string;
  limit?: number;
  cursor?: string;
};

class ConversationService {
  async getConversations(filters: ConversationFilters = {}) {
    const and: Prisma.ConversationWhereInput[] = [];

    if (filters.status) and.push({ status: filters.status });
    if (filters.profileId) {
      and.push({
        lead: {
          is: {
            profileId: filters.profileId,
          },
        },
      });
    }
    if (filters.stage) {
      and.push({
        lead: {
          is: {
            funnelStage: filters.stage as never,
          },
        },
      });
    }
    if (filters.search) {
      and.push({
        lead: {
          is: {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { phone: { contains: filters.search, mode: "insensitive" } },
            ],
          },
        },
      });
    }

    const where: Prisma.ConversationWhereInput = and.length ? { AND: and } : {};

    return prisma.conversation.findMany({
      where,
      include: {
        lead: {
          include: {
            leadTags: { include: { tag: true } },
            profile: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: filters.limit ?? 50,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
  }

  async getConversationById(id: string, profileId?: string) {
    return prisma.conversation.findFirst({
      where: {
        id,
        ...(profileId
          ? {
              lead: {
                is: {
                  profileId,
                },
              },
            }
          : {}),
      },
      include: {
        lead: {
          include: {
            leadTags: { include: { tag: true } },
            profile: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async createConversation(leadId: string) {
    return prisma.conversation.create({
      data: {
        leadId,
        status: "OPEN",
      },
    });
  }

  async getOrCreateOpenConversation(leadId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leadId}))`;

      const openConversation = await tx.conversation.findFirst({
        where: { leadId, status: "OPEN" },
        orderBy: { updatedAt: "desc" },
      });

      if (openConversation) return openConversation;

      return tx.conversation.create({
        data: {
          leadId,
          status: "OPEN",
        },
      });
    });
  }

  async updateConversation(id: string, data: Prisma.ConversationUpdateInput) {
    return prisma.conversation.update({
      where: { id },
      data,
    });
  }

  async saveMessage(data: {
    conversationId: string;
    leadId: string;
    direction: MessageDirection;
    role: MessageRole;
    type: MessageType;
    content: string;
    whatsappMessageId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const message = await prisma.message.create({
      data,
    });

    await Promise.all([
      prisma.conversation.update({
        where: { id: data.conversationId },
        data: { updatedAt: new Date() },
      }),
      leadService.updateLastInteraction(data.leadId, data.content),
    ]);

    return message;
  }

  /**
   * Histórico recente da conversa, em ordem cronológica, no formato
   * "Lead: ..." / "Atendente: ...".
   *
   * `options.beforeCreatedAt`: quando informado, retorna SÓ mensagens anteriores
   * a esse instante. Usado para EXCLUIR o batch atual do histórico — a mensagem
   * que está sendo respondida já vai como turno `user` da IA; sem isso ela
   * apareceria duplicada (no HISTORICO e na pergunta), confundindo o modelo.
   */
  async getRecentHistory(
    conversationId: string,
    take = 15,
    options: { beforeCreatedAt?: Date } = {},
  ) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(options.beforeCreatedAt
          ? { createdAt: { lt: options.beforeCreatedAt } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return messages
      .reverse()
      .map((item) => `${item.role === "LEAD" ? "Lead" : "Atendente"}: ${item.content}`);
  }
}

export const conversationService = new ConversationService();
