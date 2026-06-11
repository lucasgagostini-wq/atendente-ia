import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROFILE_SLUG, MUSIC_PROFILE_SLUG } from "@/lib/profile-defaults";
import { buildProfileHref } from "@/lib/profile-utils";
import { conversationService } from "@/services/conversation.service";
import { leadService } from "@/services/lead.service";
import { outboundMessageService } from "@/services/outbound-message.service";
import { profileService } from "@/services/profile.service";
import { promptService } from "@/services/prompt.service";

async function main() {
  const { restoration, music } = await profileService.ensureDefaultProfiles(true);
  const now = Date.now();
  const musicPhone = `55119123${String(now).slice(-4)}`;
  const restorationPhone = `55118123${String(now).slice(-4)}`;
  const cleanupLeadIds: string[] = [];

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

  try {
    const musicLead = await leadService.upsertByPhone(
      musicPhone,
      { name: "Cliente Teste Musica", source: "webhook_test" },
      music.id,
      { profileSlug: music.slug },
    );
    cleanupLeadIds.push(musicLead.id);
    await leadService.ensureDefaultOfferTagForProfile(musicLead.id, music.slug);
    const musicConversation = await conversationService.getOrCreateOpenConversation(musicLead.id);
    await conversationService.saveMessage({
      conversationId: musicConversation.id,
      leadId: musicLead.id,
      direction: "INBOUND",
      role: "LEAD",
      type: "TEXT",
      content: "Teste de última interação música",
    });

    const restoredMusicLead = await leadService.getLeadById(musicLead.id, music.id);
    assert.equal(restoredMusicLead?.funnelStage, "CUSTOMER");
    assert.equal(restoredMusicLead?.status, "CONVERTED");
    assert.equal(restoredMusicLead?.operationStage, "PAID_ORDER");
    assert.equal(restoredMusicLead?.name, "Cliente Teste Musica");
    assert.equal(restoredMusicLead?.lastMessage, "Teste de última interação música");
    assert.ok(restoredMusicLead?.lastMessageAt, "lead de música deve ter última interação");
    assert.ok(
      restoredMusicLead?.leadTags.some((item) => item.tag.name === "Música Personalizada"),
      "lead de música deve receber tag automática",
    );

    const fallbackMusicLead = await leadService.upsertByPhone(
      `55117123${String(now).slice(-4)}`,
      { source: "webhook_test" },
      music.id,
      { profileSlug: music.slug },
    );
    cleanupLeadIds.push(fallbackMusicLead.id);
    assert.notEqual(fallbackMusicLead.name, null);
    assert.notEqual(fallbackMusicLead.name, "");
    assert.equal(fallbackMusicLead.operationStage, "PAID_ORDER");

    const movedMusicLead = await leadService.updateOperationStage({
      leadId: musicLead.id,
      profileId: music.id,
      operationStage: "PRODUCTION",
    });
    assert.equal(movedMusicLead.operationStage, "PRODUCTION");

    const manualConversation = await conversationService.getOrCreateOpenConversation(musicLead.id);
    const queuedJob = await outboundMessageService.enqueueManualMessage({
      profileId: music.id,
      leadId: musicLead.id,
      conversationId: manualConversation.id,
      phone: musicLead.phone,
      text: "Mensagem manual operacional",
    });
    assert.equal(queuedJob.status, "PENDING");

    const claimedForMusic = await outboundMessageService.claimPendingJobs({
      profileId: music.id,
      limit: 5,
    });
    assert.ok(
      claimedForMusic.some((job) => job.id === queuedJob.id),
      "job da música deve ser reivindicado pela bridge do perfil música",
    );

    const claimedForRestoration = await outboundMessageService.claimPendingJobs({
      profileId: restoration.id,
      limit: 5,
    });
    assert.equal(
      claimedForRestoration.some((job) => job.id === queuedJob.id),
      false,
      "job da música não pode aparecer no perfil restauração",
    );

    await outboundMessageService.markJobSent({
      jobId: queuedJob.id,
      whatsappMessageId: `wamid-${now}`,
      providerPayload: { transport: "test" },
    });

    const manualConversationAfterSend = await conversationService.getConversationById(
      manualConversation.id,
      music.id,
    );
    const sentManualMessage = manualConversationAfterSend?.messages.find(
      (message) => message.whatsappMessageId === `wamid-${now}`,
    );
    assert.ok(sentManualMessage, "mensagem manual enviada deve ser salva na conversa");
    assert.equal(sentManualMessage?.role, "HUMAN");
    assert.equal(sentManualMessage?.direction, "OUTBOUND");

    const updatedManualLead = await leadService.getLeadById(musicLead.id, music.id);
    assert.equal(updatedManualLead?.lastMessage, "Mensagem manual operacional");
    assert.ok(updatedManualLead?.lastMessageAt, "última interação deve ser atualizada após envio manual");
    assert.equal(updatedManualLead?.aiEnabled, false, "envio manual não deve ativar IA");
    assert.equal(updatedManualLead?.operationStage, "PRODUCTION", "envio manual não deve alterar estágio operacional");

    const failedJob = await outboundMessageService.enqueueManualMessage({
      profileId: music.id,
      leadId: musicLead.id,
      conversationId: manualConversation.id,
      phone: musicLead.phone,
      text: "Mensagem com falha controlada",
    });
    await outboundMessageService.claimPendingJobs({
      profileId: music.id,
      limit: 5,
    });
    const failedJobResult = await outboundMessageService.markJobError({
      jobId: failedJob.id,
      errorMessage: "bridge offline",
    });
    assert.equal(failedJobResult.status, "ERROR");
    assert.equal(failedJobResult.errorMessage, "bridge offline");

    await assert.rejects(
      () =>
        leadService.updateOperationStage({
          leadId: musicLead.id,
          profileId: restoration.id,
          operationStage: "SENT",
        }),
      /Lead não encontrado para este perfil/i,
    );

    const restorationLead = await leadService.upsertByPhone(
      restorationPhone,
      { source: "webhook_test" },
      restoration.id,
      { profileSlug: restoration.slug },
    );
    cleanupLeadIds.push(restorationLead.id);
    await leadService.ensureDefaultOfferTagForProfile(restorationLead.id, restoration.slug);
    const restoredRestorationLead = await leadService.getLeadById(restorationLead.id, restoration.id);
    assert.equal(restoredRestorationLead?.funnelStage, "COLD");
    assert.equal(restoredRestorationLead?.status, "NEW");
    assert.equal(restoredRestorationLead?.operationStage, null);
    assert.equal(
      restoredRestorationLead?.leadTags.some((item) => item.tag.name === "Música Personalizada"),
      false,
      "restauração não deve receber tag da música",
    );

    const nullStageLead = await leadService.upsertByPhone(
      `55116123${String(now).slice(-4)}`,
      { source: "webhook_test" },
      music.id,
    );
    cleanupLeadIds.push(nullStageLead.id);
    await prisma.lead.update({
      where: { id: nullStageLead.id },
      data: { operationStage: null },
    });
    const backfillResult = await leadService.backfillOperationStageForProfile(music.id, "PAID_ORDER");
    assert.ok(backfillResult.affected >= 1, "backfill do Kanban deve preencher estágio operacional");
    const restoredNullStageLead = await leadService.getLeadById(nullStageLead.id, music.id);
    assert.equal(restoredNullStageLead?.operationStage, "PAID_ORDER");
  } finally {
    if (cleanupLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: {
          id: {
            in: cleanupLeadIds,
          },
        },
      });
    }
  }

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
