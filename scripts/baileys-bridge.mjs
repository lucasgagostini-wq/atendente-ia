import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.BAILEYS_BRIDGE_PORT || process.env.PORT || 8080);
const apiKey = process.env.BAILEYS_BRIDGE_API_KEY || process.env.API_KEY || "change-me";
const instanceName =
  process.env.BAILEYS_BRIDGE_INSTANCE_NAME ||
  process.env.INSTANCE_NAME ||
  "atendente-ia";
const authDir =
  process.env.BAILEYS_AUTH_DIR || path.resolve(__dirname, "..", ".baileys", instanceName);
const autoReconnect = process.env.BAILEYS_AUTO_RECONNECT !== "false";
const autoStart = process.env.BAILEYS_BRIDGE_AUTOSTART === "true";

let webhookUrl = process.env.BAILEYS_BRIDGE_WEBHOOK_URL || "";

// Segredo compartilhado opcional para autenticar o bridge no webhook.
// Quando definido, é enviado como header X-Webhook-Secret em cada chamada.
// Para ativar no servidor, defina WEBHOOK_SECRET no painel da Vercel.
// ATENÇÃO: altere também no servidor (ver docs/AI_PROJECT_CONTEXT.md) antes
// de definir aqui em produção — caso contrário o webhook rejeitará as mensagens.
const webhookSecret = process.env.WEBHOOK_SECRET || "";
let socket = null;
let socketState = "close";
let ownerJid = null;
let lastQrDataUrl = null;
let lastError = null;
let starting = null;
let manualStop = false;
let pairingReadyAt = 0;
let pairingReadyWaiters = [];
const typingSessions = new Map();
const leadActivityVersions = new Map();
const TYPING_BUFFER_MS = Number(process.env.TYPING_BUFFER_MS || 1000);
const MIN_VISIBLE_TYPING_MS = Number(process.env.MIN_VISIBLE_TYPING_MS || 1500);
const TEXT_INITIAL_TYPING_MIN_MS = Number(process.env.TEXT_INITIAL_TYPING_MIN_MS || 1500);
const TEXT_INITIAL_TYPING_MAX_MS = Number(process.env.TEXT_INITIAL_TYPING_MAX_MS || 2500);
const MEDIA_INITIAL_TYPING_MIN_MS = Number(process.env.MEDIA_INITIAL_TYPING_MIN_MS || 2000);
const MEDIA_INITIAL_TYPING_MAX_MS = Number(process.env.MEDIA_INITIAL_TYPING_MAX_MS || 3500);

const app = express();
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, apikey");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "1mb" }));

function ensureInstance(instance) {
  if (!instance || instance === instanceName) return null;
  return {
    status: 404,
    payload: {
      status: 404,
      error: "Not Found",
      response: { message: [`The "${instance}" instance does not exist`] },
    },
  };
}

function normalizePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolvePhoneFromJid(jid) {
  const raw = String(jid || "");
  const [id, server] = raw.split("@");
  const digits = normalizePhone(id);

  if (!digits) return "";

  if (server === "lid") {
    const reverseMap = readJsonFile(
      path.join(authDir, `lid-mapping-${digits}_reverse.json`),
    );
    const resolved = normalizePhone(reverseMap);
    return resolved || "";
  }

  return digits;
}

function toJid(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  if (digits.includes("@")) return digits;
  return `${digits}@s.whatsapp.net`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function nextLeadActivityVersion(phone) {
  const digits = normalizePhone(phone);
  const next = (leadActivityVersions.get(digits) || 0) + 1;
  leadActivityVersions.set(digits, next);
  return next;
}

function isCurrentLeadActivity(phone, version) {
  return leadActivityVersions.get(normalizePhone(phone)) === version;
}

function getInitialTypingDelayMs(message) {
  const hasImage = Boolean(message?.message?.imageMessage || message?.message?.documentMessage);
  const text =
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.documentMessage?.caption ||
    "";

  if (hasImage || String(text).trim().length > 80) {
    return randomBetween(MEDIA_INITIAL_TYPING_MIN_MS, MEDIA_INITIAL_TYPING_MAX_MS);
  }

  return randomBetween(TEXT_INITIAL_TYPING_MIN_MS, TEXT_INITIAL_TYPING_MAX_MS);
}

function clearTypingSession(number, options = {}) {
  const digits = normalizePhone(number);
  const session = typingSessions.get(digits);
  if (!session) return;

  clearTimeout(session.timeout);
  typingSessions.delete(digits);

  if (options.pause && socket && socketState === "open" && session.jid) {
    socket.sendPresenceUpdate("paused", session.jid).catch(() => {});
  }
}

async function startTypingPresence(number, durationMs = 3000) {
  if (!socket || socketState !== "open") return false;

  const digits = normalizePhone(number);
  const jid = toJid(number);
  if (!jid) return false;

  clearTypingSession(digits);

  const delayMs = Math.max(0, Math.round(durationMs + TYPING_BUFFER_MS));
  await socket.sendPresenceUpdate("composing", jid);

  const timeout = setTimeout(() => {
    typingSessions.delete(digits);
    socket?.sendPresenceUpdate?.("paused", jid).catch(() => {});
  }, delayMs);
  timeout.unref?.();

  typingSessions.set(digits, { timeout, jid, delayMs, startedAt: Date.now() });

  return true;
}

async function sendTypingPresence(number, delayMs = 3000) {
  return startTypingPresence(number, delayMs);
}

function markPairingReady() {
  pairingReadyAt = Date.now();
  const waiters = pairingReadyWaiters;
  pairingReadyWaiters = [];
  waiters.forEach(({ resolve, timeout }) => {
    clearTimeout(timeout);
    resolve();
  });
}

function waitForPairingReady(timeoutMs = 30_000) {
  if (Date.now() - pairingReadyAt < 30_000) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pairingReadyWaiters = pairingReadyWaiters.filter(
        (waiter) => waiter.resolve !== resolve,
      );
      reject(new Error("Tempo esgotado aguardando canal de pareamento."));
    }, timeoutMs);

    pairingReadyWaiters.push({ resolve, reject, timeout });
  });
}

async function stopSocket(reason = "manual stop") {
  manualStop = true;
  pairingReadyAt = 0;
  pairingReadyWaiters.forEach(({ reject, timeout }) => {
    clearTimeout(timeout);
    reject(new Error(reason));
  });
  pairingReadyWaiters = [];

  if (socket) {
    try {
      socket.end(new Error(reason));
    } catch {
      // noop
    }
  }

  socket = null;
  socketState = "close";
  ownerJid = null;
  lastQrDataUrl = null;
}

function resetAuthFiles() {
  if (!fs.existsSync(authDir)) return;

  for (const entry of fs.readdirSync(authDir, { withFileTypes: true })) {
    if (
      entry.name.endsWith(".log") ||
      entry.name.startsWith("qr-") ||
      entry.name === "qr-live.png"
    ) {
      continue;
    }

    fs.rmSync(path.join(authDir, entry.name), {
      force: true,
      recursive: true,
    });
  }
}

async function emitWebhook(payload) {
  if (!webhookUrl) return null;

  try {
    const headers = { "Content-Type": "application/json" };
    if (webhookSecret) {
      headers["X-Webhook-Secret"] = webhookSecret;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[baileys-bridge] webhook returned ${response.status} ${response.statusText}`,
      );
    }

    return await response.json().catch(() => null);
  } catch (error) {
    console.error("[baileys-bridge] webhook error:", error);
    return null;
  }
}

async function extractIncomingMedia(message) {
  const imageMessage = message?.message?.imageMessage;
  const documentMessage = message?.message?.documentMessage;
  const mediaNode = imageMessage || documentMessage;

  if (!mediaNode) return null;

  try {
    const buffer = await downloadMediaMessage(
      message,
      "buffer",
      {},
      { logger: undefined, reuploadRequest: socket?.updateMediaMessage },
    );
    const mimetype = mediaNode.mimetype || (imageMessage ? "image/jpeg" : "application/octet-stream");
    const base64 = Buffer.from(buffer).toString("base64");

    return {
      mimetype,
      fileName: documentMessage?.fileName || null,
      mediaBase64: `data:${mimetype};base64,${base64}`,
    };
  } catch (error) {
    console.error("[baileys-bridge] failed to download incoming media:", error);
    return {
      mimetype: mediaNode.mimetype || null,
      fileName: documentMessage?.fileName || null,
      mediaDownloadError: error instanceof Error ? error.message : "download failed",
    };
  }
}

async function startSocket(options = {}) {
  const { forceRestart = false, qr = true } =
    typeof options === "boolean" ? { forceRestart: options, qr: true } : options;

  if (starting) return starting;

  starting = (async () => {
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    if (forceRestart) {
      await stopSocket("manual restart");
    }
    manualStop = false;

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu("Chrome"),
      version,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 120_000,
      markOnlineOnConnect: false,
      printQRInTerminal: qr,
      qrTimeout: 300_000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQrDataUrl = await QRCode.toDataURL(qr);
        markPairingReady();
      }

      if (connection) {
        socketState = connection;
      }

      if (connection === "open") {
        ownerJid = sock.user?.id || null;
        lastError = null;
        lastQrDataUrl = null;
      }

      if (connection === "close") {
        ownerJid = null;
        const statusCode = new Boom(lastDisconnect?.error).output.statusCode;
        const shouldReconnect =
          !manualStop && autoReconnect && statusCode !== DisconnectReason.loggedOut;

        lastError = {
          statusCode,
          message:
            lastDisconnect?.error instanceof Error
              ? lastDisconnect.error.message
              : "connection closed",
        };

        if (shouldReconnect) {
          startSocket();
        }

        manualStop = false;
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        if (!message?.message || message.key?.fromMe) continue;
        if (!message.key?.remoteJid || message.key.remoteJid.endsWith("@g.us")) continue;

        const phone = resolvePhoneFromJid(message.key.remoteJid);
        const bridgeStartedAt = Date.now();
        const activityVersion = nextLeadActivityVersion(phone);
        const initialTypingDelayMs = getInitialTypingDelayMs(message);
        const TYPING_COVER_MS = Number(process.env.TYPING_COVER_MS || 12000);
        let typingVisibleAt = null;

        const initialTypingPromise = (async () => {
          await sleep(initialTypingDelayMs);

          if (!phone || socketState !== "open" || !isCurrentLeadActivity(phone, activityVersion)) {
            return false;
          }

          await startTypingPresence(phone, TYPING_COVER_MS).catch((error) => {
            console.error("[baileys-bridge] initial typing presence error:", error);
            return false;
          });
          typingVisibleAt = Date.now();
          console.log(
            `[typing] composing iniciado para ${phone} APOS ${initialTypingDelayMs}ms (cover ${TYPING_COVER_MS}ms)`,
          );
          return true;
        })();

        try {
          const media = await extractIncomingMedia(message);

          const webhookResponse = await emitWebhook({
            event: "MESSAGES_UPSERT",
            data: {
              phone,
              replyTransport: "baileys_bridge",
              key: {
                remoteJid: message.key.remoteJid,
                id: message.key.id || null,
                fromMe: false,
              },
              message: message.message,
              media,
              messageTimestamp: message.messageTimestamp || null,
              pushName: message.pushName || null,
            },
          });

          await initialTypingPromise;

          if (!isCurrentLeadActivity(phone, activityVersion)) {
            console.log(`[typing] reply ignorado para ${phone} porque chegou mensagem mais nova`);
            continue;
          }

          const replies = Array.isArray(webhookResponse?.replies)
            ? webhookResponse.replies
            : webhookResponse?.reply
              ? [webhookResponse.reply]
              : [];

          console.log(
            `[typing] webhook retornou ${replies.length} reply(s) apos ${Date.now() - bridgeStartedAt}ms (IA processou)`,
          );

          if (replies.length && socketState === "open") {
            const firstReply = replies[0] || {};
            const firstReplyPhone = normalizePhone(firstReply?.phone || phone);
            const firstTypingDelayMs = Number(firstReply?.typingDelayMs || 0);
            const totalElapsedMs = Date.now() - bridgeStartedAt;
            const typingVisibleElapsedMs = typingVisibleAt ? Date.now() - typingVisibleAt : 0;
            const floorMs = 3500 + Math.floor(Math.random() * 500);
            const remainingDelayMs = Math.max(
              0,
              floorMs - totalElapsedMs,
              firstTypingDelayMs - totalElapsedMs,
              MIN_VISIBLE_TYPING_MS - typingVisibleElapsedMs,
            );
            if (remainingDelayMs > 0 && firstReplyPhone) {
              await startTypingPresence(firstReplyPhone, remainingDelayMs).catch((error) => {
                console.error("[baileys-bridge] final typing presence error:", error);
              });
              typingVisibleAt ||= Date.now();
              console.log(
                `[typing] segurando "digitando" por mais ${remainingDelayMs}ms (piso ${floorMs}ms / delay IA ${firstTypingDelayMs}ms) antes de enviar`,
              );
              await sleep(remainingDelayMs);
            }

            for (let index = 0; index < replies.length; index += 1) {
              if (!isCurrentLeadActivity(phone, activityVersion)) {
                console.log(`[typing] envio cancelado para ${phone} porque chegou mensagem mais nova`);
                break;
              }

              const reply = replies[index] || {};
              const replyText = String(reply?.text || "").trim();
              const replyPhone = normalizePhone(reply?.phone || phone);

              if (!replyText || !replyPhone) continue;

              if (index > 0) {
                const betweenMessagesTypingMs = index === 1 ? 1400 : 1200;
                await startTypingPresence(replyPhone, betweenMessagesTypingMs).catch((error) => {
                  console.error("[baileys-bridge] between-message typing error:", error);
                });
                await sleep(betweenMessagesTypingMs);
              }

              await sock.sendMessage(toJid(replyPhone), { text: replyText });
              clearTypingSession(replyPhone, { pause: true });
              console.log(`[typing] mensagem ${index + 1}/${replies.length} enviada para ${replyPhone} (${replyText.length} chars)`);
            }
          }
        } finally {
          // Garante que a presenca nunca fique presa em "digitando", mesmo se a
          // IA falhar, o fetch retornar null ou ocorrer erro no envio.
          clearTypingSession(phone, { pause: true });
          console.log(`[typing] presenca pausada (paused) para ${phone} no final`);
        }
      }
    });

    socket = sock;
    return sock;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

function authMiddleware(req, res, next) {
  const incomingKey = req.headers.apikey;
  if (incomingKey !== apiKey) {
    res.status(401).json({
      status: 401,
      error: "Unauthorized",
      response: { message: ["Invalid apikey"] },
    });
    return;
  }
  next();
}

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    instanceName,
    state: socketState,
    connected: socketState === "open",
    ownerJid,
    hasWebhook: Boolean(webhookUrl),
    lastError,
  });
});

app.use(authMiddleware);

app.get("/instance/connectionState/:instance", (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  res.json({
    instance: {
      instanceName,
      state: socketState,
      ownerJid,
    },
  });
});

app.get("/instance/connect/:instance", async (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  await startSocket();

  res.json({
    instance: {
      instanceName,
      state: socketState,
      ownerJid,
    },
    base64: lastQrDataUrl
      ? lastQrDataUrl.replace(/^data:image\/png;base64,/, "")
      : null,
  });
});

app.put("/instance/restart/:instance", async (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  await startSocket(true);

  res.json({
    instance: {
      instanceName,
      state: socketState,
      ownerJid,
    },
    base64: lastQrDataUrl
      ? lastQrDataUrl.replace(/^data:image\/png;base64,/, "")
      : null,
  });
});

app.post("/webhook/set/:instance", (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  webhookUrl = String(req.body?.url || "").trim();

  res.json({
    webhook: {
      enabled: Boolean(webhookUrl),
      url: webhookUrl || null,
    },
  });
});

app.post("/instance/pairingCode/:instance", async (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  const phone = normalizePhone(req.body?.phone);
  const customCode = String(req.body?.code || "").trim().toUpperCase();
  if (!phone) {
    res.status(400).json({
      status: 400,
      error: "Bad Request",
      response: { message: ["phone is required"] },
    });
    return;
  }

  if (customCode && !/^[A-Z0-9]{8}$/.test(customCode)) {
    res.status(400).json({
      status: 400,
      error: "Bad Request",
      response: { message: ["code must be exactly 8 letters/numbers"] },
    });
    return;
  }

  if (req.body?.reset !== false) {
    await stopSocket("reset before pairing code");
    resetAuthFiles();
  }

  await startSocket({ forceRestart: true, qr: false });

  if (!socket) {
    res.status(500).json({
      status: 500,
      error: "Internal Server Error",
      response: { message: ["socket not initialized"] },
    });
    return;
  }

  try {
    if (socket.authState?.creds?.registered) {
      res.json({
        code: null,
        message: "already registered",
      });
      return;
    }

    await waitForPairingReady();
    const code = await socket.requestPairingCode(phone, customCode || undefined);
    res.json({ code });
  } catch (error) {
    res.status(500).json({
      status: 500,
      error: "Internal Server Error",
      response: {
        message: [
          error instanceof Error
            ? error.message
            : "failed to request pairing code",
        ],
      },
    });
  }
});

app.post("/message/sendText/:instance", async (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  const number = normalizePhone(req.body?.number);
  const text = String(req.body?.text || "").trim();

  if (!number || !text) {
    res.status(400).json({
      status: 400,
      error: "Bad Request",
      response: { message: ["number and text are required"] },
    });
    return;
  }

  if (!socket || socketState !== "open") {
    res.status(409).json({
      status: 409,
      error: "Conflict",
      response: { message: ["instance is not connected"] },
    });
    return;
  }

  try {
    const jid = toJid(number);
    const result = await socket.sendMessage(jid, { text });

    res.json({
      key: result?.key ?? null,
      status: "PENDING",
      serverId: result?.key?.id ?? null,
    });
  } catch (error) {
    res.status(500).json({
      status: 500,
      error: "Internal Server Error",
      response: {
        message: [
          error instanceof Error ? error.message : "failed to send message",
        ],
      },
    });
  }
});

app.post("/chat/sendPresence/:instance", async (req, res) => {
  const mismatch = ensureInstance(req.params.instance);
  if (mismatch) {
    res.status(mismatch.status).json(mismatch.payload);
    return;
  }

  const number = normalizePhone(req.body?.number || req.body?.options?.number);
  const delay = Number(req.body?.options?.delay || req.body?.delay || 3000);

  if (!number) {
    res.status(400).json({
      status: 400,
      error: "Bad Request",
      response: { message: ["number is required"] },
    });
    return;
  }

  if (!socket || socketState !== "open") {
    res.status(409).json({
      status: 409,
      error: "Conflict",
      response: { message: ["instance is not connected"] },
    });
    return;
  }

  try {
    await startTypingPresence(number, Number.isFinite(delay) ? delay : 3000);
    res.json({ presence: "composing", number, delay });
  } catch (error) {
    res.status(500).json({
      status: 500,
      error: "Internal Server Error",
      response: {
        message: [
          error instanceof Error ? error.message : "failed to send presence",
        ],
      },
    });
  }
});

app.listen(port, async () => {
  console.log(`[baileys-bridge] listening on port ${port}`);
  console.log(`[baileys-bridge] instance: ${instanceName}`);
  if (apiKey === "change-me") {
    console.log(
      "[baileys-bridge] warning: BAILEYS_BRIDGE_API_KEY is using default value.",
    );
  }
  if (webhookUrl) {
    console.log(`[baileys-bridge] webhook: ${webhookUrl}`);
  }

  if (autoStart) {
    try {
      await startSocket();
    } catch (error) {
      lastError =
        error instanceof Error ? { message: error.message } : { message: "startup failed" };
      console.error("[baileys-bridge] initial socket startup failed:", error);
    }
  }
});

process.on("unhandledRejection", (error) => {
  console.error("[baileys-bridge] unhandledRejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("[baileys-bridge] uncaughtException:", error);
});
