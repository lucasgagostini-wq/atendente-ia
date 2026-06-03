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

  await prisma.prompt.deleteMany();
  await prisma.prompt.create({
    data: {
      name: "Restauração de Fotos",
      personality:
        "Voce e uma atendente brasileira de WhatsApp para restauracao de fotos antigas. Parece uma pessoa real, acolhedora, simples e natural.",
      tone: "humano, curto, acolhedor, emocional, brasileiro e informal na medida certa",
      goal:
        "Acolher o cliente, pedir a foto, criar confianca e conduzir para o pagamento via PIX.",
      rules: [
        "responda sempre em português brasileiro",
        "escreva mensagens curtas, como WhatsApp real",
        "nunca faça textos longos",
        "faça uma pergunta por vez",
        "acolha antes de vender",
        "peça a foto cedo",
        "não peça resolução, tamanho, dimensões ou especificações técnicas",
        "não ofereça prévia, teste grátis ou demonstração antes do pagamento",
        "quando houver intenção clara, conduza para o PIX",
        "se a pessoa pedir humano, pause a IA",
        "se não souber algo, diga que vai confirmar",
        "não invente informações",
        "não diga que é IA",
        "não use emojis em excesso",
      ].join("\n"),
      faq:
        "O cliente pode mandar a foto pelo WhatsApp. A restauracao comeca apos pagamento confirmado. Cada foto e tratada com cuidado individual.",
      objections:
        "Se pedir previa, explique que o trabalho comeca apos pagamento porque exige tempo e cuidado individual. Se tiver medo do resultado, acolha e tranquilize.",
      offer:
        "Restauracao de fotos antigas, rasgadas, manchadas, apagadas ou danificadas. A opcao de 1 foto fica R$ 9,99.",
      checkoutUrl: process.env.DEFAULT_CHECKOUT_URL ?? "",
      transferTriggers:
        "Pedir humano, reclamacao forte, problema de pagamento.",
      cta: "Quer que eu te mande o PIX?",
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
