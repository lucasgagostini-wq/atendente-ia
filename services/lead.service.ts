import { FunnelStage, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const LEADS_DEFAULT_LIMIT = 500;
const LEADS_MAX_LIMIT = 2000;

type LeadFilters = {
  profileId?: string;
  search?: string;
  stage?: FunnelStage;
  status?: LeadStatus;
  tagId?: string;
  onlyDialable?: boolean;
  /** Número máximo de leads a retornar. Padrão: 500. Máx: 2000. */
  limit?: number;
  /** Offset para paginação (skip). */
  skip?: number;
};

type BulkLeadActionInput = {
  profileId?: string;
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

    if (filters.profileId) {
      where.profileId = filters.profileId;
    }

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

    const limit = Math.min(filters.limit ?? LEADS_DEFAULT_LIMIT, LEADS_MAX_LIMIT);
    const skip = filters.skip ?? 0;

    return prisma.lead.findMany({
      where,
      include: {
        leadTags: {
          include: { tag: true },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip,
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

  async getLeadById(id: string, profileId?: string) {
    return prisma.lead.findFirst({
      where: {
        id,
        ...(profileId ? { profileId } : {}),
      },
      include: {
        profile: true,
        leadTags: { include: { tag: true } },
        conversations: {
          orderBy: { updatedAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async upsertByPhone(
    phone: string,
    payload?: Partial<Prisma.LeadCreateInput>,
    profileId?: string,
  ) {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!profileId) {
      throw new Error("profileId é obrigatório para upsert do lead");
    }

    return prisma.lead.upsert({
      where: {
        profileId_phone: {
          profileId,
          phone: cleanPhone,
        },
      },
      create: {
        profileId,
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

    const scopedWhere = {
      id: { in: uniqueLeadIds },
      ...(input.profileId ? { profileId: input.profileId } : {}),
    } satisfies Prisma.LeadWhereInput;
    const scopedLeadIds = (
      await prisma.lead.findMany({
        where: scopedWhere,
        select: { id: true },
      })
    ).map((lead) => lead.id);

    if (scopedLeadIds.length === 0) {
      return { affected: 0 };
    }

    if (input.action === "DELETE") {
      const result = await prisma.lead.deleteMany({
        where: {
          id: { in: scopedLeadIds },
        },
      });
      return { affected: result.count };
    }

    if (input.action === "ADD_TAGS") {
      const uniqueTagIds = Array.from(new Set(input.tagIds ?? []));
      if (uniqueTagIds.length === 0) return { affected: 0 };

      const rows = scopedLeadIds.flatMap((leadId) =>
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
          leadId: { in: scopedLeadIds },
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
      where: { id: { in: scopedLeadIds } },
      data: updateData,
    });

    return { affected: result.count };
  }
}

export const leadService = new LeadService();

