import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

class AutomationService {
  async getAutomations() {
    return prisma.automation.findMany({
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    });
  }

  async createAutomation(data: Prisma.AutomationCreateInput) {
    return prisma.automation.create({ data });
  }

  async updateAutomation(id: string, data: Prisma.AutomationUpdateInput) {
    return prisma.automation.update({
      where: { id },
      data,
    });
  }

  async deleteAutomation(id: string) {
    return prisma.automation.delete({
      where: { id },
    });
  }
}

export const automationService = new AutomationService();

