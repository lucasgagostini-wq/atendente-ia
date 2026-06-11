import { OutboundMessageJobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const OUTBOUND_JOB_STALE_MS = 90_000;

type EnqueueManualMessageInput = {
  profileId: string;
  leadId: string;
  conversationId: string;
  phone: string;
  text: string;
};

type ClaimPendingJobsInput = {
  profileId: string;
  limit?: number;
};

type MarkJobSentInput = {
  jobId: string;
  whatsappMessageId?: string | null;
  providerPayload?: Prisma.InputJsonValue;
};

type MarkJobErrorInput = {
  jobId: string;
  errorMessage: string;
  providerPayload?: Prisma.InputJsonValue;
};

class OutboundMessageService {
  async enqueueManualMessage(input: EnqueueManualMessageInput) {
    return prisma.outboundMessageJob.create({
      data: {
        profileId: input.profileId,
        leadId: input.leadId,
        conversationId: input.conversationId,
        phone: input.phone.replace(/\D/g, ""),
        text: input.text.trim(),
      },
    });
  }

  async claimPendingJobs(input: ClaimPendingJobsInput) {
    const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
    const claimed = [];

    for (let index = 0; index < limit; index += 1) {
      const nextJob = await prisma.$transaction(async (tx) => {
        const staleBefore = new Date(Date.now() - OUTBOUND_JOB_STALE_MS);
        const candidate = await tx.outboundMessageJob.findFirst({
          where: {
            profileId: input.profileId,
            OR: [
              { status: "PENDING" },
              {
                status: "PROCESSING",
                lastAttemptAt: {
                  lt: staleBefore,
                },
              },
            ],
          },
          orderBy: { createdAt: "asc" },
        });

        if (!candidate) return null;

        return tx.outboundMessageJob.update({
          where: { id: candidate.id },
          data: {
            status: "PROCESSING",
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
            errorMessage: null,
          },
        });
      });

      if (!nextJob) break;
      claimed.push(nextJob);
    }

    return claimed;
  }

  async markJobSent(input: MarkJobSentInput) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.outboundMessageJob.findUnique({
        where: { id: input.jobId },
      });

      if (!job) {
        throw new Error("Job de envio não encontrado");
      }

      if (job.status === "SENT") {
        return job;
      }

      await tx.outboundMessageJob.update({
        where: { id: input.jobId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null,
          whatsappMessageId: input.whatsappMessageId ?? null,
          providerPayload: input.providerPayload ?? undefined,
        },
      });

      await tx.message.create({
        data: {
          conversationId: job.conversationId,
          leadId: job.leadId,
          direction: "OUTBOUND",
          role: "HUMAN",
          type: "TEXT",
          content: job.text,
          whatsappMessageId: input.whatsappMessageId ?? null,
          metadata: input.providerPayload ?? undefined,
        },
      });

      await Promise.all([
        tx.conversation.update({
          where: { id: job.conversationId },
          data: { updatedAt: new Date() },
        }),
        tx.lead.update({
          where: { id: job.leadId },
          data: {
            lastMessage: job.text,
            lastMessageAt: new Date(),
          },
        }),
      ]);

      return tx.outboundMessageJob.findUniqueOrThrow({
        where: { id: input.jobId },
      });
    });
  }

  async markJobError(input: MarkJobErrorInput) {
    return prisma.outboundMessageJob.update({
      where: { id: input.jobId },
      data: {
        status: "ERROR",
        errorMessage: input.errorMessage,
        providerPayload: input.providerPayload ?? undefined,
        lastAttemptAt: new Date(),
      },
    });
  }

  async getVisibleConversationJobs(conversationId: string) {
    return prisma.outboundMessageJob.findMany({
      where: {
        conversationId,
        status: {
          in: ["PENDING", "PROCESSING", "ERROR"] satisfies OutboundMessageJobStatus[],
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const outboundMessageService = new OutboundMessageService();
