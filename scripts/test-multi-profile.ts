import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROFILE_SLUG, MUSIC_PROFILE_SLUG } from "@/lib/profile-defaults";
import { buildProfileHref } from "@/lib/profile-utils";
import { conversationService } from "@/services/conversation.service";
import { leadService } from "@/services/lead.service";
import { profileService } from "@/services/profile.service";
import { promptService } from "@/services/prompt.service";

async function main() {
  const { restoration, music } = await profileService.ensureDefaultProfiles(true);

  assert.equal(restoration.slug, DEFAULT_PROFILE_SLUG);
  assert.equal(restoration.aiEnabled, false);
  assert.equal(restoration.status, "PAUSED");

  assert.equal(music.slug, MUSIC_PROFILE_SLUG);
  assert.equal(music.aiEnabled, false);
  assert.ok(
    music.status === "AWAITING_WHATSAPP" || music.status === "ACTIVE",
    `status inesperado para musica-personalizada: ${music.status}`,
  );

  const nullProfileLeads = await prisma.lead.count({
    where: { profileId: null },
  });
  assert.equal(nullProfileLeads, 0, "todos os leads devem estar vinculados a um profile");

  const [restorationPrompt, musicPrompt] = await Promise.all([
    promptService.getPrompt(restoration.id),
    promptService.getPrompt(music.id),
  ]);
  assert.equal(restorationPrompt.profileId, restoration.id);
  assert.equal(musicPrompt.profileId, music.id);

  const [restorationLeads, musicLeads] = await Promise.all([
    leadService.getLeads({ profileId: restoration.id, limit: 10 }),
    leadService.getLeads({ profileId: music.id, limit: 10 }),
  ]);
  assert.ok(restorationLeads.every((lead) => lead.profileId === restoration.id));
  assert.ok(musicLeads.every((lead) => lead.profileId === music.id));

  const restorationConversations = await conversationService.getConversations({
    profileId: restoration.id,
    limit: 10,
  });
  assert.ok(
    restorationConversations.every((conversation) => conversation.lead?.profileId === restoration.id),
  );

  assert.equal(
    buildProfileHref("/conversas", DEFAULT_PROFILE_SLUG),
    "/conversas?profile=restauracao-fotos",
  );
  assert.equal(
    buildProfileHref("/dashboard?foo=1", MUSIC_PROFILE_SLUG),
    "/dashboard?foo=1&profile=musica-personalizada",
  );

  console.log("Multi-profile checks OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
