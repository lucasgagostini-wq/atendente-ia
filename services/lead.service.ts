import { FunnelStage, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LeadFilters = {
  search?: string;
  stage?: FunnelStage;
  status?: LeadStatus;
  tagId?: string;
  onlyDialable?: boolean;
};

type BulkLeadActionInput = {
  leadIds: string[];
  action: "DELETE" | "ADD_TAGS" | "REMOVE_TAGS" | "UPDATE_FIELDS";
  tagIds?: string[];
  data?: {
    status?: LeadStatus;
    funnelStage?: FunnelStage;
    source?: string | null;
    aiEnabled?: boolean;
    humanTakeover?: boolean;
  };
};

class LeadService {
  async getLeads(filters: LeadFilters = {}) {
    const where: Prisma.LeadWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.stage) where.funnelStage = filters.stage;
    if (filters.status) where.status = filters.status;
    if (filters.tagId) {
      where.leadTags = {
        some: { tagId: filters.tagId },
      };
    }
    if (filters.onlyDialable) {
      where.phone = {
        not: { startsWith: "semfone-" },
      };
    }

    return prisma.lead.findMany({
      where,
      include: {
        leadTags: {
          include: { tag: true },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async listTags() {
    return prisma.tag.findMany({
      orderBy: { name: "asc" },
    });
  }

  async createTag(data: { name: string; color: string }) {
    return prisma.tag.upsert({
      where: { name: data.name },
      create: data,
      update: { color: data.color },
    });
  }

  async getLeadById(id: string) {
    return prisma.lead.findUnique({
      where: { id },
      include: {
        leadTags: { include: { tag: true } },
        conversations: {
          orderBy: { updatedAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async upsertByPhone(phone: string, payload?: Partial<Prisma.LeadCreateInput>) {
    const cleanPhone = phone.replace(/\D/g, "");

    return prisma.lead.upsert({
      where: { phone: cleanPhone },
      create: {
        phone: cleanPhone,
        name: payload?.name,
        source: payload?.source ?? "whatsapp",
        summary: payload?.summary,
      },
      update: {
        name: payload?.name ?? undefined,
        source: payload?.source ?? undefined,
      },
    });
  }

  async createLead(data: Prisma.LeadCreateInput) {
    return prisma.lead.create({ data });
  }

  async updateLead(
    id: string,
    data: Prisma.LeadUpdateInput,
    tagIds?: string[],
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data,
      });

      if (tagIds) {
        const uniqueTagIds = Array.from(new Set(tagIds));

        if (uniqueTagIds.length === 0) {
          await tx.leadTag.deleteMany({
            where: { leadId: id },
          });
        } else {
          await tx.leadTag.deleteMany({
            where: {
              leadId: id,
              tagId: { notIn: uniqueTagIds },
            },
          });

          await tx.leadTag.createMany({
            data: uniqueTagIds.map((tagId) => ({ leadId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.lead.findUniqueOrThrow({
        where: { id },
        include: {
          leadTags: { include: { tag: true } },
        },
      });
    });
  }

  async updateLastInteraction(leadId: string, message: string) {
    return prisma.lead.update({
      where: { id: leadId },
      data: {
        lastMessage: message,
        lastMessageAt: new Date(),
      },
    });
  }

  async setAiState(leadId: string, enabled: boolean) {
    return prisma.lead.update({
      where: { id: leadId },
      data: {
        aiEnabled: enabled,
        humanTakeover: !enabled,
      },
    });
  }

  async runBulkAction(input: BulkLeadActionInput) {
    const uniqueLeadIds = Array.from(new Set(input.leadIds));
    if (uniqueLeadIds.length === 0) {
      return { affected: 0 };
    }

    if (input.action === "DELETE") {
      const result = await prisma.lead.deleteMany({
        where: { id: { in: uniqueLeadIds } },
      });
      return { affected: result.count };
    }

    if (input.action === "ADD_TAGS") {
      const uniqueTagIds = Array.from(new Set(input.tagIds ?? []));
      if (uniqueTagIds.length === 0) return { affected: 0 };

      const rows = uniqueLeadIds.flatMap((leadId) =>
        uniqueTagIds.map((tagId) => ({ leadId, tagId })),
      );

      const result = await prisma.leadTag.createMany({
        data: rows,
        skipDuplicates: true,
      });
      return { affected: result.count };
    }

    if (input.action === "REMOVE_TAGS") {
      const uniqueTagIds = Array.from(new Set(input.tagIds ?? []));
      if (uniqueTagIds.length === 0) return { affected: 0 };

      const result = await prisma.leadTag.deleteMany({
        where: {
          leadId: { in: uniqueLeadIds },
          tagId: { in: uniqueTagIds },
        },
      });
      return { affected: result.count };
    }

    const data = input.data;
    if (!data) return { affected: 0 };

    const updateData: Prisma.LeadUpdateManyMutationInput = {};
    if (data.status) updateData.status = data.status;
    if (data.funnelStage) updateData.funnelStage = data.funnelStage;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.aiEnabled !== undefined) updateData.aiEnabled = data.aiEnabled;
    if (data.humanTakeover !== undefined) {
      updateData.humanTakeover = data.humanTakeover;
    }

    const result = await prisma.lead.updateMany({
      where: { id: { in: uniqueLeadIds } },
      data: updateData,
    });

    return { affected: result.count };
  }
}

export const leadService = new LeadService();

