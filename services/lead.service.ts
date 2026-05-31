import { FunnelStage, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LeadFilters = {
  search?: string;
  stage?: FunnelStage;
  status?: LeadStatus;
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

  async updateLead(id: string, data: Prisma.LeadUpdateInput) {
    return prisma.lead.update({
      where: { id },
      data,
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
}

export const leadService = new LeadService();

