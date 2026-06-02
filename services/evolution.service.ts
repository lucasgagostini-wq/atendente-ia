import axios, { AxiosInstance } from "axios";
import { getSettings } from "@/lib/settings-cache";
import { randomBetween, sleep } from "@/lib/utils";

type SendMediaPayload = {
  phone: string;
  mediaUrl: string;
  caption?: string;
};

type SendOptions = {
  allowSimulation?: boolean;
};

class EvolutionService {


  private async getClient() {
    const settings = await getSettings();
    const baseURL =
      settings.evolutionApiUrl || process.env.EVOLUTION_API_URL || "";
    const apiKey = settings.evolutionApiKey || process.env.EVOLUTION_API_KEY || "";
    const instance =
      settings.evolutionInstanceName || process.env.EVOLUTION_INSTANCE_NAME || "";

    if (!baseURL || !apiKey || !instance) {
      return {
        client: null as AxiosInstance | null,
        instance,
        isConfigured: false,
      };
    }

    const client = axios.create({
      baseURL,
      timeout: 15_000,
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
    });

    return { client, instance, isConfigured: true };
  }

  async getStatus() {
    const { client, instance, isConfigured } = await this.getClient();

    if (!isConfigured || !client) {
      return {
        connected: false,
        configured: false,
        number: null,
      };
    }

    try {
      const { data } = await client.get(`/instance/connectionState/${instance}`);
      return {
        connected:
          data?.instance?.state === "open" ||
          data?.instance?.state === "connected" ||
          data?.state === "open",
        configured: true,
        number:
          data?.instance?.ownerJid ||
          data?.instance?.profileName ||
          data?.number ||
          null,
        raw: data,
      };
    } catch (error) {
      return {
        connected: false,
        configured: true,
        number: null,
        error: error instanceof Error ? error.message : "Erro ao buscar status",
      };
    }
  }

  async connect() {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      throw new Error("Evolution API não configurada.");
    }

    const { data } = await client.get(`/instance/connect/${instance}`);
    return data;
  }

  async reconnect() {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      throw new Error("Evolution API não configurada.");
    }

    const { data } = await client.put(`/instance/restart/${instance}`);
    return data;
  }

  async setWebhook(webhookUrl: string) {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      throw new Error("Evolution API não configurada.");
    }

    const { data } = await client.post(`/webhook/set/${instance}`, {
      url: webhookUrl,
      enabled: true,
      webhookByEvents: false,
      events: [
        "MESSAGES_UPSERT",
        "CONNECTION_UPDATE",
        "QRCODE_UPDATED",
        "SEND_MESSAGE",
      ],
    });
    return data;
  }

  async simulateTyping() {
    const settings = await getSettings();
    const minDelay = settings.minDelaySeconds ?? 2;
    const maxDelay = settings.maxDelaySeconds ?? 8;
    await sleep(randomBetween(minDelay, maxDelay) * 1000);
  }

  async sendText(phone: string, text: string) {
    return this.sendTextWithOptions(phone, text);
  }

  private async sendTextWithOptions(
    phone: string,
    text: string,
    options?: SendOptions,
  ) {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      const allowSimulation =
        options?.allowSimulation ?? process.env.NODE_ENV !== "production";
      if (!allowSimulation) {
        throw new Error(
          "Evolution API não configurada. Preencha URL, API Key e Instance Name em Configurações.",
        );
      }

      return {
        simulated: true,
        phone,
        text,
      };
    }

    await this.simulateTyping();

    const payload = {
      number: phone.replace(/\D/g, ""),
      text,
      delay: 1200,
      linkPreview: true,
    };

    const { data } = await client.post(`/message/sendText/${instance}`, payload);
    return data;
  }

  async sendTextStrict(phone: string, text: string) {
    return this.sendTextWithOptions(phone, text, { allowSimulation: false });
  }

  async sendImage(payload: SendMediaPayload, options?: SendOptions) {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      const allowSimulation =
        options?.allowSimulation ?? process.env.NODE_ENV !== "production";
      if (!allowSimulation) {
        throw new Error(
          "Evolution API não configurada. Preencha URL, API Key e Instance Name em Configurações.",
        );
      }

      return { simulated: true, ...payload };
    }

    const { data } = await client.post(`/message/sendMedia/${instance}`, {
      number: payload.phone.replace(/\D/g, ""),
      mediatype: "image",
      media: payload.mediaUrl,
      caption: payload.caption ?? "",
    });
    return data;
  }

  async sendAudio(payload: SendMediaPayload, options?: SendOptions) {
    const { client, instance, isConfigured } = await this.getClient();
    if (!isConfigured || !client) {
      const allowSimulation =
        options?.allowSimulation ?? process.env.NODE_ENV !== "production";
      if (!allowSimulation) {
        throw new Error(
          "Evolution API não configurada. Preencha URL, API Key e Instance Name em Configurações.",
        );
      }

      return { simulated: true, ...payload };
    }

    const { data } = await client.post(`/message/sendWhatsAppAudio/${instance}`, {
      number: payload.phone.replace(/\D/g, ""),
      audio: payload.mediaUrl,
    });
    return data;
  }
}

export const evolutionService = new EvolutionService();
