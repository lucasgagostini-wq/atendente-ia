/**
 * start-whatsapp.mjs
 * Inicia Baileys bridge + Cloudflare Tunnel, captura a URL pública,
 * atualiza Vercel e banco automaticamente.
 *
 * Uso: node scripts/start-whatsapp.mjs
 */

import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const BRIDGE_PORT = 8080;
const BRIDGE_API_KEY = "local-bridge-key";
const INSTANCE = "atendente-ia";
const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL?.replace("localhost:3000", "")
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution`
  : "https://atendente-ia-eight.vercel.app/api/webhooks/evolution";

function log(tag, msg) {
  console.log(`\x1b[36m[${tag}]\x1b[0m ${msg}`);
}
function ok(msg)  { console.log(`\x1b[32m✅ ${msg}\x1b[0m`); }
function err(msg) { console.log(`\x1b[31m❌ ${msg}\x1b[0m`); }
function warn(msg){ console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`); }

// ── 1. Iniciar Baileys bridge ───────────────────────────────
log("BRIDGE", `Iniciando na porta ${BRIDGE_PORT}...`);

const bridgeEnv = {
  ...process.env,
  BAILEYS_BRIDGE_PORT: String(BRIDGE_PORT),
  BAILEYS_BRIDGE_API_KEY: BRIDGE_API_KEY,
  BAILEYS_BRIDGE_INSTANCE_NAME: INSTANCE,
  BAILEYS_BRIDGE_WEBHOOK_URL: WEBHOOK_URL,
  BAILEYS_BRIDGE_AUTOSTART: "true",
  BAILEYS_AUTO_RECONNECT: "true",
};

const bridge = spawn("node", ["scripts/baileys-bridge.mjs"], {
  cwd: root,
  env: bridgeEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

bridge.stdout.on("data", (d) => {
  const line = d.toString().trim();
  if (line.includes("listening on port")) ok(`Bridge rodando: ${line}`);
  if (line.includes("connected to WA")) ok("WhatsApp Web conectado!");
});
bridge.stderr.on("data", (d) => {
  const line = d.toString().trim();
  if (line.includes('"msg":"connected to WA"')) ok("WhatsApp Web conectado!");
});

// Aguardar bridge subir
await new Promise((r) => setTimeout(r, 3000));

// ── 2. Verificar conexão existente ──────────────────────────
let alreadyConnected = false;
try {
  const res = await fetch(`http://localhost:${BRIDGE_PORT}/health`);
  const data = await res.json();
  if (data.connected) {
    ok(`WhatsApp já conectado: ${data.ownerJid}`);
    alreadyConnected = true;
  } else {
    log("BRIDGE", `Estado: ${data.state} | Última erro: ${data.lastError?.message ?? "nenhum"}`);
  }
} catch {
  err("Bridge não respondeu — aguardando mais 3s...");
  await new Promise((r) => setTimeout(r, 3000));
}

// ── 3. Iniciar Cloudflare Tunnel ────────────────────────────
log("TUNNEL", "Iniciando Cloudflare Tunnel...");

const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${BRIDGE_PORT}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

let tunnelUrl = null;

const urlPromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timeout aguardando URL do tunnel")), 30000);

  function check(data) {
    const text = data.toString();
    // Cloudflare imprime a URL no formato: https://xxx.trycloudflare.com
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[0]);
    }
  }

  tunnel.stdout.on("data", check);
  tunnel.stderr.on("data", check);
});

try {
  tunnelUrl = await urlPromise;
  ok(`Tunnel público: ${tunnelUrl}`);
} catch (e) {
  err(`Falha no tunnel: ${e.message}`);
  warn("Continuando sem tunnel — WhatsApp só funcionará localmente.");
}

// ── 4. Atualizar Vercel e banco ─────────────────────────────
if (tunnelUrl) {
  log("VERCEL", "Atualizando EVOLUTION_API_URL na Vercel...");

  try {
    // Remove e recria
    try { execSync(`npx vercel env rm EVOLUTION_API_URL production --yes`, { cwd: root, stdio: "pipe" }); } catch {}
    execSync(`printf "${tunnelUrl}" | npx vercel env add EVOLUTION_API_URL production`, { cwd: root, stdio: "pipe" });

    try { execSync(`npx vercel env rm EVOLUTION_API_KEY production --yes`, { cwd: root, stdio: "pipe" }); } catch {}
    execSync(`printf "${BRIDGE_API_KEY}" | npx vercel env add EVOLUTION_API_KEY production`, { cwd: root, stdio: "pipe" });

    try { execSync(`npx vercel env rm EVOLUTION_INSTANCE_NAME production --yes`, { cwd: root, stdio: "pipe" }); } catch {}
    execSync(`printf "${INSTANCE}" | npx vercel env add EVOLUTION_INSTANCE_NAME production`, { cwd: root, stdio: "pipe" });

    ok("Vercel atualizado!");
  } catch (e) {
    warn(`Erro ao atualizar Vercel: ${e.message}`);
  }

  // Atualizar também o webhook no bridge
  try {
    await fetch(`http://localhost:${BRIDGE_PORT}/webhook/set/${INSTANCE}`, {
      method: "POST",
      headers: { "apikey": BRIDGE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url: WEBHOOK_URL }),
    });
    ok(`Webhook configurado: ${WEBHOOK_URL}`);
  } catch {}

  // Trigger redeploy
  log("VERCEL", "Disparando redeploy...");
  try {
    execSync(`git commit --allow-empty -m "chore: update Evolution API URL to tunnel ${tunnelUrl.split("//")[1]}" && git push origin main`, {
      cwd: root, stdio: "pipe",
    });
    ok("Redeploy disparado!");
  } catch (e) {
    warn(`Git push falhou: ${e.message}`);
  }
}

// ── 5. Status final ─────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log("\x1b[32m🚀 SISTEMA ATIVO\x1b[0m");
console.log("─".repeat(60));
console.log(`Bridge local:    http://localhost:${BRIDGE_PORT}`);
if (tunnelUrl) {
  console.log(`Bridge público:  ${tunnelUrl}`);
  console.log(`App (Vercel):    https://atendente-ia-eight.vercel.app`);
}
console.log(`Webhook:         ${WEBHOOK_URL}`);
console.log("─".repeat(60));
console.log("\x1b[33mCTRL+C para encerrar\x1b[0m\n");

// Manter processos vivos
process.on("SIGINT", () => {
  log("SHUTDOWN", "Encerrando...");
  bridge.kill();
  tunnel.kill();
  process.exit(0);
});

// Manter vivo
await new Promise(() => {});
