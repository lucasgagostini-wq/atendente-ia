import { prisma } from "@/lib/prisma";
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
    );

    await Promise.all([
      leadService.ensureDefaultOfferTagForProfile(lead.id, profile.slug),
      conversationService.getOrCreateOpenConversation(lead.id),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          aiEnabled: false,
          humanTakeover: true,
          source: "whatsapp_import",
        },
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
