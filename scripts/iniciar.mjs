/**
 * iniciar.mjs
 *
 * Inicia o Atendente IA completo (App + WhatsApp) em um único processo.
 * Usado pelo INICIAR-ATENDENTE.bat (duplo clique) e pelo auto-start do Windows.
 *
 * - Inicia o bridge do WhatsApp (Baileys) — conecta sozinho com a sessão salva
 * - Inicia o app Next.js
 * - Abre o navegador automaticamente
 * - Mantém tudo vivo e reinicia se algo cair
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const APP_URL = "https://atendente-ia-eight.vercel.app";
const BRIDGE_PORT = 8080;

// Cores para o terminal
const c = {
  reset: "\x1b[0m", green: "\x1b[32m", cyan: "\x1b[36m",
  yellow: "\x1b[33m", red: "\x1b[31m", bold: "\x1b[1m", dim: "\x1b[2m",
};

function banner() {
  console.clear();
  console.log(`${c.cyan}${c.bold}`);
  console.log("  ╔════════════════════════════════════════╗");
  console.log("  ║          ATENDENTE IA                  ║");
  console.log("  ║      Iniciando o sistema...            ║");
  console.log("  ╚════════════════════════════════════════╝");
  console.log(c.reset);
}

function log(step, msg) {
  console.log(`${c.cyan}  [${step}]${c.reset} ${msg}`);
}
function ok(msg)  { console.log(`${c.green}  ✓ ${msg}${c.reset}`); }
function warn(msg){ console.log(`${c.yellow}  ⚠ ${msg}${c.reset}`); }

const processes = [];

/** Inicia um processo filho com restart automático */
function startProcess(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line.includes("listening on port")) ok("WhatsApp pronto na porta " + BRIDGE_PORT);
    if (line.includes("connected to WA")) ok("WhatsApp conectado!");
    if (line.includes("Ready in") || line.includes("started server")) ok("Aplicativo pronto!");
  });

  child.stderr.on("data", (d) => {
    const line = d.toString();
    if (line.includes('"msg":"connected to WA"')) ok("WhatsApp conectado!");
  });

  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      warn(`${name} caiu (código ${code}) — reiniciando em 3s...`);
      setTimeout(() => startProcess(name, command, args, env), 3000);
    }
  });

  processes.push(child);
  return child;
}

let shuttingDown = false;

async function main() {
  banner();

  // ── 1. Bridge WhatsApp ──────────────────────────────────
  log("1/3", "Iniciando WhatsApp (conexão automática)...");
  startProcess("bridge", "node", ["--env-file=.env", "scripts/baileys-bridge.mjs"], {
    BAILEYS_BRIDGE_PORT: String(BRIDGE_PORT),
    BAILEYS_BRIDGE_API_KEY: "local-bridge-key",
    BAILEYS_BRIDGE_INSTANCE_NAME: "atendente-ia",
    BAILEYS_BRIDGE_WEBHOOK_URL: `${APP_URL}/api/webhooks/evolution`,
    BAILEYS_BRIDGE_AUTOSTART: "true",
    BAILEYS_AUTO_RECONNECT: "true",
  });

  await new Promise((r) => setTimeout(r, 4000));

  // ── 2. App Next.js ──────────────────────────────────────
  log("2/3", "Iniciando o aplicativo...");
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  startProcess("next", "node", [nextBin, "dev"]);

  // ── 3. Abrir navegador ──────────────────────────────────
  log("3/3", "Aguardando o aplicativo carregar...");
  await waitForApp();

  ok("Tudo pronto!");
  console.log(`\n${c.green}${c.bold}  🚀 ATENDENTE IA NO AR${c.reset}`);
  console.log(`${c.dim}  ────────────────────────────────────────${c.reset}`);
  console.log(`  Acesse:  ${c.cyan}${APP_URL}${c.reset}`);
  console.log(`${c.dim}  ────────────────────────────────────────${c.reset}`);
  console.log(`${c.yellow}  Pode minimizar esta janela.`);
  console.log(`  Para DESLIGAR o atendente, feche esta janela.${c.reset}\n`);

  // Abre o navegador
  spawn("cmd", ["/c", "start", "", APP_URL], { detached: true, stdio: "ignore" });
}

/** Aguarda o app responder antes de abrir o navegador */
async function waitForApp(maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(APP_URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 307 || res.status === 200) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ── Encerramento limpo ────────────────────────────────────
function shutdown() {
  shuttingDown = true;
  console.log(`\n${c.yellow}  Encerrando Atendente IA...${c.reset}`);
  processes.forEach((p) => { try { p.kill(); } catch {} });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(`${c.red}  Erro ao iniciar: ${e.message}${c.reset}`);
  process.exit(1);
});
