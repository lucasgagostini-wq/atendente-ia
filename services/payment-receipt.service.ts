import axios from "axios";
import { getSettings } from "@/lib/settings-cache";
import { prisma } from "@/lib/prisma";

export type ExpectedPaymentData = {
  pixKey: string;
  recipientName: string;
  bank: string;
  amount: string;
};

export type PixReceiptAnalysis = {
  looksLikePixReceipt: boolean;
  isRandomImage: boolean;
  recipientNameFound: string | null;
  pixKeyFound: string | null;
  bankFound: string | null;
  amountFound: string | null;
  dateFound: string | null;
  timeFound: string | null;
  matchesRecipient: boolean;
  matchesPixKey: boolean;
  matchesBank: boolean;
  matchesAmount: boolean;
  timeLooksValid: boolean;
  suspiciousOrUnclear: boolean;
  reason: string;
  confidence: "low" | "medium" | "high";
  fallbackUsed?: boolean;
  fallbackMode?: "manual_review" | "invalid_reupload";
};

type AnalyzeArgs = {
  imageUrlOrBase64?: string | null;
  expectedPaymentData: ExpectedPaymentData;
  conversationContext: {
    pixSentAt?: Date | string | null;
    receiptReceivedAt?: Date | string | null;
    recentHistory?: string[];
  };
};

function extractJsonObject(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(content.slice(start, end + 1)) as Partial<PixReceiptAnalysis>;
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw: Partial<PixReceiptAnalysis> | null): PixReceiptAnalysis {
  return {
    looksLikePixReceipt: Boolean(raw?.looksLikePixReceipt),
    isRandomImage: Boolean(raw?.isRandomImage),
    recipientNameFound: raw?.recipientNameFound ?? null,
    pixKeyFound: raw?.pixKeyFound ?? null,
    bankFound: raw?.bankFound ?? null,
    amountFound: raw?.amountFound ?? null,
    dateFound: raw?.dateFound ?? null,
    timeFound: raw?.timeFound ?? null,
    matchesRecipient: Boolean(raw?.matchesRecipient),
    matchesPixKey: Boolean(raw?.matchesPixKey),
    matchesBank: Boolean(raw?.matchesBank),
    matchesAmount: Boolean(raw?.matchesAmount),
    timeLooksValid: Boolean(raw?.timeLooksValid),
    suspiciousOrUnclear: Boolean(raw?.suspiciousOrUnclear),
    reason: raw?.reason || "Análise visual inconclusiva. Conferir manualmente.",
    confidence: raw?.confidence === "high" || raw?.confidence === "medium" ? raw.confidence : "low",
  };
}

function fallbackReceiptAnalysis(
  reason: string,
  mode: "manual_review" | "invalid_reupload" = "manual_review",
): PixReceiptAnalysis {
  return {
    looksLikePixReceipt: mode === "manual_review",
    isRandomImage: mode === "invalid_reupload",
    recipientNameFound: null,
    pixKeyFound: null,
    bankFound: null,
    amountFound: null,
    dateFound: null,
    timeFound: null,
    matchesRecipient: false,
    matchesPixKey: false,
    matchesBank: false,
    matchesAmount: false,
    timeLooksValid: false,
    suspiciousOrUnclear: true,
    reason,
    confidence: "low",
    fallbackUsed: true,
    fallbackMode: mode,
  };
}

class PaymentReceiptService {
  async analyzePossiblePixReceipt(
    imageUrlOrBase64: string | null | undefined,
    expectedPaymentData: ExpectedPaymentData,
    conversationContext: AnalyzeArgs["conversationContext"],
  ): Promise<PixReceiptAnalysis> {
    const settings = await getSettings();
    const apiKey = settings.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    const visionModel = process.env.VISION_AI_MODEL || process.env.OPENROUTER_VISION_MODEL;

    if (!imageUrlOrBase64 || !apiKey || !visionModel) {
      const analysis = fallbackReceiptAnalysis(
        "Sem imagem acessível ou modelo de visão configurado. Conferir pagamento manualmente.",
        "manual_review",
      );
      await prisma.log.create({
        data: {
          type: "PAYMENT_RECEIPT_VISION_FALLBACK",
          message: analysis.reason,
          payload: {
            hasImage: Boolean(imageUrlOrBase64),
            hasApiKey: Boolean(apiKey),
            hasVisionModel: Boolean(visionModel),
          },
        },
      }).catch(() => {});
      return analysis;
    }

    const startedAt = Date.now();

    // OpenRouter (e Claude Vision) exige que base64 tenha o prefixo data URI.
    // URLs HTTP/S já funcionam como estão.
    const imageContent =
      imageUrlOrBase64.startsWith("http") || imageUrlOrBase64.startsWith("data:")
        ? imageUrlOrBase64
        : `data:image/jpeg;base64,${imageUrlOrBase64}`;

    const prompt = [
      "Analise a imagem como possível comprovante PIX brasileiro.",
      "Não confirme pagamento. Apenas extraia sinais visuais e compare com os dados esperados.",
      "Responda APENAS em JSON válido no formato solicitado.",
      "",
      `Dados esperados: chave PIX=${expectedPaymentData.pixKey}; nome=${expectedPaymentData.recipientName}; banco=${expectedPaymentData.bank}; valor=${expectedPaymentData.amount}.`,
      `Contexto: PIX enviado em ${conversationContext.pixSentAt || "desconhecido"}; imagem recebida em ${conversationContext.receiptReceivedAt || "agora"}.`,
      "Regras de horário: data deve ser hoje ou muito recente; horário não pode ser claramente antes do envio do PIX nem no futuro. Se ilegível, marque unclear.",
      "",
      "JSON:",
      '{"looksLikePixReceipt":true,"isRandomImage":false,"recipientNameFound":"...","pixKeyFound":"...","bankFound":"...","amountFound":"...","dateFound":"...","timeFound":"...","matchesRecipient":true,"matchesPixKey":true,"matchesBank":true,"matchesAmount":true,"timeLooksValid":true,"suspiciousOrUnclear":false,"reason":"...","confidence":"high"}',
    ].join("\n");

    try {
      const { data } = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: visionModel,
          temperature: 0.1,
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageContent } },
              ],
            },
          ],
        },
        {
          timeout: 18_000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
            "X-Title": "Atendente IA",
          },
        },
      );

      const output = data?.choices?.[0]?.message?.content?.trim() || "";
      const analysis = normalizeAnalysis(extractJsonObject(output));

      await prisma.log.create({
        data: {
          type: "PAYMENT_RECEIPT_ANALYSIS",
          message: "Análise visual de comprovante PIX concluída",
          payload: {
            model: visionModel,
            durationMs: Date.now() - startedAt,
            expectedPaymentData,
            analysis,
            rawResponse: output.slice(0, 2000),
          },
        },
      }).catch(() => {});

      return analysis;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status ?? null : null;
      const detailMessage =
        axios.isAxiosError(error) && error.response?.data
          ? JSON.stringify(error.response.data).toLowerCase()
          : "";
      const visionUnavailable =
        status === 404 &&
        (detailMessage.includes("model is unavailable") ||
          detailMessage.includes("paid version is available") ||
          detailMessage.includes("unavailable for free"));

      const analysis = fallbackReceiptAnalysis(
        visionUnavailable
          ? "Nao consegui validar esse comprovante por imagem agora. Preciso que ele mostre valor, data e recebedor visiveis."
          : "Falha na análise visual. Conferir pagamento manualmente.",
        visionUnavailable ? "invalid_reupload" : "manual_review",
      );

      await prisma.log.create({
        data: {
          type: "PAYMENT_RECEIPT_ANALYSIS_ERROR",
          message: error instanceof Error ? error.message : "Erro desconhecido na análise visual",
          payload: {
            model: visionModel,
            status,
            detail: axios.isAxiosError(error) ? error.response?.data ?? null : null,
            fallbackMode: analysis.fallbackMode,
          },
        },
      }).catch(() => {});

      return analysis;
    }
  }
}

export const paymentReceiptService = new PaymentReceiptService();
