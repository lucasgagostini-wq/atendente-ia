import { PrismaClient } from "@prisma/client";
import { PROFILE_DEFAULTS, buildDefaultPromptForProfile } from "../lib/profile-defaults";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      evolutionApiUrl: process.env.EVOLUTION_API_URL,
      evolutionApiKey: process.env.EVOLUTION_API_KEY,
      evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME,
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      openRouterModel:
        process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-oss-20b:free",
      apifyApiToken: process.env.APIFY_API_TOKEN,
      prospectorMapsActorId:
        process.env.PROSPECTOR_MAPS_ACTOR_ID ?? "compass/crawler-google-places",
      webhookUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution`
        : null,
    },
    create: {
      id: "default",
      evolutionApiUrl: process.env.EVOLUTION_API_URL,
      evolutionApiKey: process.env.EVOLUTION_API_KEY,
      evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME,
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      openRouterModel:
        process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-oss-20b:free",
      apifyApiToken: process.env.APIFY_API_TOKEN,
      prospectorMapsActorId:
        process.env.PROSPECTOR_MAPS_ACTOR_ID ?? "compass/crawler-google-places",
      webhookUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution`
        : null,
      temperature: 0.6,
      minDelaySeconds: 2,
      maxDelaySeconds: 8,
      safeMode: true,
    },
  });

  const restorationProfile = await prisma.profile.upsert({
    where: { slug: PROFILE_DEFAULTS.restoration.slug },
    update: {
      name: PROFILE_DEFAULTS.restoration.name,
      description: PROFILE_DEFAULTS.restoration.description,
      status: PROFILE_DEFAULTS.restoration.status,
      aiEnabled: PROFILE_DEFAULTS.restoration.aiEnabled,
      pixKey: PROFILE_DEFAULTS.restoration.pixKey,
      pixName: PROFILE_DEFAULTS.restoration.pixName,
      pixBank: PROFILE_DEFAULTS.restoration.pixBank,
      whatsappSessionName: process.env.EVOLUTION_INSTANCE_NAME ?? undefined,
    },
    create: {
      name: PROFILE_DEFAULTS.restoration.name,
      slug: PROFILE_DEFAULTS.restoration.slug,
      description: PROFILE_DEFAULTS.restoration.description,
      status: PROFILE_DEFAULTS.restoration.status,
      aiEnabled: PROFILE_DEFAULTS.restoration.aiEnabled,
      pixKey: PROFILE_DEFAULTS.restoration.pixKey,
      pixName: PROFILE_DEFAULTS.restoration.pixName,
      pixBank: PROFILE_DEFAULTS.restoration.pixBank,
      whatsappSessionName: process.env.EVOLUTION_INSTANCE_NAME ?? undefined,
    },
  });

  const musicProfile = await prisma.profile.upsert({
    where: { slug: PROFILE_DEFAULTS.music.slug },
    update: {
      name: PROFILE_DEFAULTS.music.name,
      description: PROFILE_DEFAULTS.music.description,
      status: PROFILE_DEFAULTS.music.status,
      aiEnabled: PROFILE_DEFAULTS.music.aiEnabled,
    },
    create: {
      name: PROFILE_DEFAULTS.music.name,
      slug: PROFILE_DEFAULTS.music.slug,
      description: PROFILE_DEFAULTS.music.description,
      status: PROFILE_DEFAULTS.music.status,
      aiEnabled: PROFILE_DEFAULTS.music.aiEnabled,
    },
  });

  await prisma.prompt.deleteMany();
  await prisma.prompt.create({
    data: {
      profileId: restorationProfile.id,
      ...buildDefaultPromptForProfile(PROFILE_DEFAULTS.restoration.slug),
      checkoutUrl: process.env.DEFAULT_CHECKOUT_URL ?? "",
    },
  });
  await prisma.prompt.create({
    data: {
      profileId: musicProfile.id,
      ...buildDefaultPromptForProfile(PROFILE_DEFAULTS.music.slug),
    },
  });

  await prisma.automation.deleteMany();
  await prisma.automation.createMany({
    data: [
      {
        name: "Lead sumiu 30 min",
        trigger: "lead sem responder por 30 minutos",
        message: "Oi! Passando aqui pra te ajudar com qualquer dúvida.",
        delayMinutes: 30,
        active: true,
      },
      {
        name: "Pediu preço",
        trigger: "lead perguntou valor",
        message:
          "Posso te explicar o que está incluso e te enviar o checkout em seguida.",
        delayMinutes: 2,
        active: true,
      },
      {
        name: "Recebeu checkout e não comprou",
        trigger: "checkout enviado sem conversão",
        message:
          "Quer que eu te ajude a finalizar? Se preferir, te guio passo a passo.",
        delayMinutes: 60,
        active: true,
      },
      {
        name: "Lead parado 24h",
        trigger: "sem interação por 24 horas",
        message:
          "Abrimos algumas vagas agora. Se fizer sentido, te explico rapidinho.",
        delayMinutes: 60 * 24,
        active: true,
      },
      {
        name: "Reativação manual",
        trigger: "reativação acionada por operador",
        message:
          "Oi! Voltei pra te ajudar no que precisar sobre a oferta. Quer continuar?",
        delayMinutes: 0,
        active: true,
      },
    ],
  });

  await prisma.tag.deleteMany();
  await prisma.tag.createMany({
    data: [
      { name: "Quente", color: "#f97316" },
      { name: "Novo", color: "#3b82f6" },
      { name: "Objeção Preço", color: "#eab308" },
      { name: "Checkout Enviado", color: "#22c55e" },
      { name: "Prospectado", color: "#06b6d4" },
      { name: "Google Maps", color: "#14b8a6" },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
