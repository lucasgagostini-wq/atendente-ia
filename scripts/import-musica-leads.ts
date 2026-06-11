import { prisma } from "@/lib/prisma";
import { formatLeadPhoneFallback, getOperationalDefaultsForProfile } from "@/lib/lead-profile";
import { MUSIC_PROFILE_SLUG } from "@/lib/profile-defaults";
import { conversationService } from "@/services/conversation.service";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";

const RAW_PHONES = [
  "5519997598962",
  "5511944652969",
  "5511940793490",
  "559884796461",
  "558496819487",
  "554796653339",
  "558398281930",
  "5521987600507",
  "559887476716",
  "5511961993831",
  "5514997684003",
  "558591165435",
  "558197014095",
] as const;

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function main() {
  const profile = await profileService.getProfileBySlug(MUSIC_PROFILE_SLUG);
  const profileDefaults = getOperationalDefaultsForProfile(profile.slug);
  const phones = Array.from(new Set(RAW_PHONES.map(normalizePhone).filter(Boolean)));

  if (phones.length === 0) {
    console.log("Nenhum numero valido para importar.");
    return;
  }

  const imported: string[] = [];

  for (const phone of phones) {
    const lead = await leadService.upsertByPhone(
      phone,
      {
        source: "whatsapp_import",
      },
      profile.id,
      { profileSlug: profile.slug },
    );

    const conversation = await conversationService.getOrCreateOpenConversation(lead.id);

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        name: lead.name || formatLeadPhoneFallback(phone),
        source: "whatsapp_import",
        aiEnabled: profileDefaults.aiEnabled ?? false,
        humanTakeover: profileDefaults.humanTakeover ?? true,
        status: profileDefaults.status ?? undefined,
        funnelStage: profileDefaults.funnelStage ?? undefined,
        operationStage: profileDefaults.operationStage ?? undefined,
        lastMessage: lead.lastMessage || "Contato importado do WhatsApp",
        lastMessageAt: lead.lastMessageAt || new Date(),
      },
    });

    await Promise.all([
      leadService.ensureDefaultOfferTagForProfile(lead.id, profile.slug),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    imported.push(phone);
  }

  const taggedCount = await prisma.lead.count({
    where: {
      profileId: profile.id,
      phone: { in: imported },
      leadTags: {
        some: {
          tag: {
            name: "Música Personalizada",
          },
        },
      },
    },
  });

  console.log(`Perfil: ${profile.slug}`);
  console.log(`Leads importados: ${imported.length}`);
  console.log(`Leads com tag valida: ${taggedCount}`);
  console.log(imported.join("\n"));
}

main()
  .catch((error) => {
    console.error("Falha ao importar leads de musica:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
