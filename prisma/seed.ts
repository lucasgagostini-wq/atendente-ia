import { PrismaClient } from "@prisma/client";

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
        process.env.OPENROUTER_DEFAULT_MODEL ?? "deepseek/deepseek-chat",
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
        process.env.OPENROUTER_DEFAULT_MODEL ?? "deepseek/deepseek-chat",
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

  await prisma.prompt.deleteMany();
  await prisma.prompt.create({
    data: {
      name: "Prompt Principal",
      personality: "Você é uma atendente virtual brasileira chamada Camila.",
      tone: "natural, educado, direto, levemente informal, humano",
      goal: "Levar o lead até o checkout de forma natural, sem parecer forçado.",
      rules: [
        "responda sempre em português brasileiro",
        "escreva mensagens curtas",
        "nunca faça textos longos",
        "faça uma pergunta por vez",
        "conduza a conversa com calma",
        "entenda primeiro o interesse da pessoa",
        "depois explique a oferta",
        "depois quebre objeções",
        "quando houver intenção clara, envie o link de pagamento",
        "se a pessoa pedir humano, pause a IA",
        "se não souber algo, diga que vai confirmar",
        "não invente informações",
        "não diga que é IA",
        "não use emojis em excesso",
      ].join("\n"),
      faq: "FAQ inicial vazio. Preencha com perguntas e respostas reais da oferta.",
      objections:
        "Objeções iniciais: preço, tempo, confiança e resultado. Use respostas curtas e objetivas.",
      offer:
        "Oferta digital com foco em transformação rápida e suporte prático. Ajuste este campo no painel.",
      checkoutUrl: process.env.DEFAULT_CHECKOUT_URL ?? "",
      transferTriggers:
        "Pedir humano, ameaça jurídica, dúvida técnica crítica, reclamação recorrente.",
      cta: "Quer que eu te envie o link de pagamento agora?",
      isActive: true,
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
