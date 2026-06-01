import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
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

let webhookUrl = process.env.BAILEYS_BRIDGE_WEBHOOK_URL || "";
let socket = null;
let socketState = "close";
let ownerJid = null;
let lastQrDataUrl = null;
let lastError = null;
let starting = null;

const app = express();
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

function toJid(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  if (digits.includes("@")) return digits;
  return `${digits}@s.whatsapp.net`;
}

async function emitWebhook(payload) {
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[baileys-bridge] webhook returned ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("[baileys-bridge] webhook error:", error);
  }
}

async function startSocket(forceRestart = false) {
  if (starting) return starting;

  starting = (async () => {
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    if (forceRestart && socket) {
      try {
        socket.end(new Error("manual restart"));
      } catch {
        // noop
      }
      socket = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      browser: Browsers.macOS("Desktop"),
      version,
      markOnlineOnConnect: false,
      printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQrDataUrl = await QRCode.toDataURL(qr);
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
          autoReconnect && statusCode !== DisconnectReason.loggedOut;

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
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        if (!message?.message || message.key?.fromMe) continue;
        if (!message.key?.remoteJid || message.key.remoteJid.endsWith("@g.us")) continue;

        await emitWebhook({
          event: "MESSAGES_UPSERT",
          data: {
            key: {
              remoteJid: message.key.remoteJid,
              fromMe: false,
            },
            message: message.message,
            pushName: message.pushName || null,
          },
        });
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

  try {
    await startSocket();
  } catch (error) {
    lastError =
      error instanceof Error ? { message: error.message } : { message: "startup failed" };
    console.error("[baileys-bridge] initial socket startup failed:", error);
  }
});

process.on("unhandledRejection", (error) => {
  console.error("[baileys-bridge] unhandledRejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("[baileys-bridge] uncaughtException:", error);
});
