/**
 * Wrapper que inicia o Baileys Bridge apontando o webhook para localhost:3000.
 * Usar com: npm run bridge:local  (ou npm run start:local)
 *
 * Para produção (bridge → Vercel), usar: npm run bridge
 */
process.env.BAILEYS_BRIDGE_WEBHOOK_URL = "http://localhost:3000/api/webhooks/evolution";
await import("./baileys-bridge.mjs");
