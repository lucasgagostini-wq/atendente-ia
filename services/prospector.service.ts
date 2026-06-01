import { ApifyClient } from "apify-client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type CreateProspectingJobInput = {
  query: string;
  maxResults: number;
};

type ImportProspectingLeadsInput = {
  jobId: string;
  leadIds: string[];
};

type RawMapsItem = Record<string, unknown>;

class ProspectorService {
  private async getSettings() {
    return prisma.settings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
  }

  private normalizePhone(phone: string | null | undefined) {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    return clean.length >= 8 ? clean : null;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toInteger(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapGoogleMapsItem(jobId: string, item: RawMapsItem) {
    const companyName = String(item.title || item.name || "").trim();
    if (!companyName) return null;

    const payload = JSON.parse(JSON.stringify(item)) as Prisma.InputJsonValue;

    return {
      jobId,
      source: "google_maps",
      companyName,
      phone: this.normalizePhone(
        String(item.phoneUnformatted || item.phone || "") || null,
      ),
      rating: this.toNumber(item.totalScore || item.rating),
      reviewsCount: this.toInteger(item.reviewsCount || item.reviews),
      address: String(item.address || item.street || "").trim() || null,
      website: String(item.website || item.site || "").trim() || null,
      mapsUrl:
        String(
          item.url || item.googleMapsUrl || item.placeUrl || item.googleMapsUri || "",
        ).trim() || null,
      placeId: String(item.placeId || item.cid || "").trim() || null,
      businessCategory: String(item.categoryName || item.category || "").trim() || null,
      rawPayload: payload,
    };
  }

  async listJobs() {
    return prisma.prospectingJob.findMany({
      include: {
        _count: {
          select: { leads: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async getJobById(id: string) {
    return prisma.prospectingJob.findUnique({
      where: { id },
      include: {
        leads: {
          orderBy: [{ imported: "asc" }, { createdAt: "desc" }],
        },
      },
    });
  }

  async createAndRunGoogleMapsJob(input: CreateProspectingJobInput) {
    const job = await prisma.prospectingJob.create({
      data: {
        query: input.query,
        maxResults: input.maxResults,
        source: "google_maps",
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    try {
      const settings = await this.getSettings();
      const apifyApiToken = settings.apifyApiToken || process.env.APIFY_API_TOKEN;
      const actorId =
        settings.prospectorMapsActorId ||
        process.env.PROSPECTOR_MAPS_ACTOR_ID ||
        "compass/crawler-google-places";

      if (!apifyApiToken) {
        throw new Error(
          "APIFY_API_TOKEN não configurado. Defina em Configurações para executar a prospecção.",
        );
      }

      const client = new ApifyClient({ token: apifyApiToken });
      const runInput = {
        searchStringsArray: [input.query],
        searchStrings: [input.query],
        maxCrawledPlaces: input.maxResults,
        maxCrawledPlacesPerSearch: input.maxResults,
        language: "pt",
        countryCode: "br",
      };

      const run = await client.actor(actorId).call(runInput, {
        waitSecs: 240,
      });

      if (!run.defaultDatasetId) {
        throw new Error("A execução na Apify não retornou dataset de resultados.");
      }

      const { items } = await client.dataset(run.defaultDatasetId).listItems({
        limit: input.maxResults,
      });

      const seen = new Set<string>();
      const mapped = items
        .map((item) => this.mapGoogleMapsItem(job.id, item as RawMapsItem))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => {
          const dedupeKey =
            item.placeId ||
            `${item.companyName.toLowerCase()}-${item.phone ?? "sem-telefone"}`;
          if (seen.has(dedupeKey)) return false;
          seen.add(dedupeKey);
          return true;
        })
        .slice(0, input.maxResults);

      await prisma.$transaction(async (tx) => {
        if (mapped.length > 0) {
          await tx.prospectingLead.createMany({
            data: mapped as Prisma.ProspectingLeadCreateManyInput[],
          });
        }

        await tx.prospectingJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            resultsCount: mapped.length,
          },
        });
      });

      return this.getJobById(job.id);
    } catch (error) {
      await prisma.prospectingJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        },
      });
      throw error;
    }
  }

  private buildSummaryFromProspectingLead(
    query: string,
    prospectingLead: {
      source: string;
      address: string | null;
      website: string | null;
      rating: number | null;
      reviewsCount: number | null;
      businessCategory: string | null;
    },
  ) {
    return [
      `Lead importado via prospecção (${prospectingLead.source}).`,
      `Busca original: ${query}`,
      prospectingLead.businessCategory
        ? `Categoria: ${prospectingLead.businessCategory}`
        : null,
      prospectingLead.rating !== null
        ? `Avaliação Google: ${prospectingLead.rating} (${prospectingLead.reviewsCount ?? 0} reviews)`
        : null,
      prospectingLead.address ? `Endereço: ${prospectingLead.address}` : null,
      prospectingLead.website ? `Website: ${prospectingLead.website}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async importProspectingLeadsToCrm(input: ImportProspectingLeadsInput) {
    const job = await prisma.prospectingJob.findUnique({
      where: { id: input.jobId },
    });

    if (!job) {
      throw new Error("Job de prospecção não encontrado.");
    }

    const prospects = await prisma.prospectingLead.findMany({
      where: {
        jobId: input.jobId,
        id: { in: input.leadIds },
      },
      orderBy: { createdAt: "asc" },
    });

    if (prospects.length === 0) {
      return {
        importedCount: 0,
        leads: [],
      };
    }

    const prospectTag = await prisma.tag.upsert({
      where: { name: "Prospectado" },
      update: { color: "#06b6d4" },
      create: { name: "Prospectado", color: "#06b6d4" },
    });

    const mapsTag = await prisma.tag.upsert({
      where: { name: "Google Maps" },
      update: { color: "#14b8a6" },
      create: { name: "Google Maps", color: "#14b8a6" },
    });

    const importedLeadIds: string[] = [];
    let importedCount = 0;

    for (const prospect of prospects) {
      if (prospect.imported && prospect.importedLeadId) {
        importedLeadIds.push(prospect.importedLeadId);
        continue;
      }

      const normalizedPhone = this.normalizePhone(prospect.phone);
      const summary = this.buildSummaryFromProspectingLead(job.query, prospect);

      let lead;
      if (normalizedPhone) {
        lead = await prisma.lead.upsert({
          where: { phone: normalizedPhone },
          create: {
            name: prospect.companyName,
            phone: normalizedPhone,
            source: "google_maps_prospector",
            status: "NEW",
            funnelStage: "COLD",
            aiEnabled: false,
            humanTakeover: true,
            summary,
            interest: job.query,
            lastMessageAt: new Date(),
            lastMessage: "Lead importado via prospecção Google Maps.",
          },
          update: {
            name: prospect.companyName,
            source: "google_maps_prospector",
            summary,
            interest: job.query,
            lastMessageAt: new Date(),
            lastMessage: "Lead atualizado por prospecção Google Maps.",
          },
        });
      } else {
        lead = await prisma.lead.create({
          data: {
            name: prospect.companyName,
            phone: `semfone-${prospect.id}`,
            source: "google_maps_prospector",
            status: "NEW",
            funnelStage: "COLD",
            aiEnabled: false,
            humanTakeover: true,
            summary,
            interest: job.query,
            lastMessageAt: new Date(),
            lastMessage: "Lead importado sem telefone (Google Maps).",
          },
        });
      }

      await prisma.leadTag.createMany({
        data: [
          { leadId: lead.id, tagId: prospectTag.id },
          { leadId: lead.id, tagId: mapsTag.id },
        ],
        skipDuplicates: true,
      });

      await prisma.prospectingLead.update({
        where: { id: prospect.id },
        data: {
          imported: true,
          importedLeadId: lead.id,
        },
      });

      importedLeadIds.push(lead.id);
      importedCount += 1;
    }

    const importedTotal = await prisma.prospectingLead.count({
      where: {
        jobId: input.jobId,
        imported: true,
      },
    });

    await prisma.prospectingJob.update({
      where: { id: input.jobId },
      data: {
        importedCount: importedTotal,
      },
    });

    const leads = await prisma.lead.findMany({
      where: { id: { in: importedLeadIds } },
      orderBy: { updatedAt: "desc" },
    });

    return {
      importedCount,
      leads,
    };
  }
}

export const prospectorService = new ProspectorService();
