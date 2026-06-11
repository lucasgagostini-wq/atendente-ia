import { prisma } from "@/lib/prisma";
import {
  formatLeadPhoneFallback,
  getOperationalDefaultsForProfile,
} from "@/lib/lead-profile";
import { MUSIC_PROFILE_SLUG } from "@/lib/profile-defaults";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

async function main() {
  const profile = await profileService.getProfileBySlug(MUSIC_PROFILE_SLUG);
  const profileDefaults = getOperationalDefaultsForProfile(profile.slug);
  await leadService.backfillOperationStageForProfile(profile.id, profileDefaults.operationStage);

  const leads = await prisma.lead.findMany({
    where: { profileId: profile.id },
    include: {
      conversations: {
        select: { id: true, updatedAt: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      leadTags: {
        include: { tag: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let corrected = 0;

  for (const lead of leads) {
    const latestMessage = lead.messages[0] ?? null;
    const latestMessageContact = latestMessage?.metadata as
      | {
          contact?: {
            name?: string | null;
            pushName?: string | null;
            notifyName?: string | null;
            verifiedName?: string | null;
            profileName?: string | null;
            senderName?: string | null;
          } | null;
        }
      | null
      | undefined;
    const fallbackTimestamp =
      latestMessage?.createdAt ||
      lead.lastMessageAt ||
      lead.updatedAt ||
      lead.createdAt;

    const fallbackMessage =
      latestMessage?.content?.trim() ||
      lead.lastMessage?.trim() ||
      "Contato importado do WhatsApp";

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        name:
          lead.name?.trim() ||
          latestMessageContact?.contact?.name ||
          latestMessageContact?.contact?.verifiedName ||
          latestMessageContact?.contact?.profileName ||
          latestMessageContact?.contact?.pushName ||
          latestMessageContact?.contact?.notifyName ||
          latestMessageContact?.contact?.senderName ||
          formatLeadPhoneFallback(lead.phone),
        status: profileDefaults.status ?? lead.status,
        funnelStage: profileDefaults.funnelStage ?? lead.funnelStage,
        operationStage: profileDefaults.operationStage ?? lead.operationStage,
        aiEnabled: profileDefaults.aiEnabled ?? lead.aiEnabled,
        humanTakeover: profileDefaults.humanTakeover ?? lead.humanTakeover,
        lastMessage: fallbackMessage,
        lastMessageAt: fallbackTimestamp,
      },
    });

    if (lead.conversations.length > 0) {
      await prisma.conversation.updateMany({
        where: {
          id: { in: lead.conversations.map((conversation) => conversation.id) },
        },
        data: {
          updatedAt: fallbackTimestamp,
        },
      });
    }

    await leadService.ensureDefaultOfferTagForProfile(lead.id, profile.slug);
    corrected += 1;
  }

  console.log(`Perfil: ${profile.slug}`);
  console.log(`Leads corrigidos: ${corrected}`);
}

main()
  .catch((error) => {
    console.error("Falha no backfill do CRM de musica:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
