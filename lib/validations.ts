import { z } from "zod";

export const messageTypeSchema = z.enum(["TEXT", "IMAGE", "AUDIO"]);
export const directionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export const roleSchema = z.enum(["LEAD", "ASSISTANT", "HUMAN", "SYSTEM"]);

export const leadSchema = z.object({
  name: z.string().min(1).optional().or(z.literal("")),
  phone: z.string().min(8),
  status: z
    .enum(["NEW", "QUALIFIED", "NEGOTIATION", "CONVERTED", "LOST"])
    .optional(),
  funnelStage: z
    .enum(["COLD", "WARM", "HOT", "CHECKOUT", "CUSTOMER"])
    .optional(),
  source: z.string().optional().or(z.literal("")),
  aiEnabled: z.boolean().optional(),
  humanTakeover: z.boolean().optional(),
  summary: z.string().optional().or(z.literal("")),
});

export const conversationSchema = z.object({
  leadId: z.string().cuid(),
  status: z.enum(["OPEN", "ARCHIVED", "CLOSED"]).optional(),
});

export const messageSchema = z.object({
  conversationId: z.string().cuid(),
  leadId: z.string().cuid(),
  direction: directionSchema,
  role: roleSchema,
  type: messageTypeSchema.default("TEXT"),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const aiRespondSchema = z.object({
  leadId: z.string().cuid(),
  conversationId: z.string().cuid(),
  incomingMessage: z.string().min(1).optional(),
});

export const automationSchema = z.object({
  name: z.string().min(2),
  trigger: z.string().min(2),
  message: z.string().min(2),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 7).default(30),
  active: z.boolean().default(true),
});

export const promptSchema = z.object({
  name: z.string().min(2),
  personality: z.string().min(2),
  tone: z.string().min(2),
  goal: z.string().min(2),
  rules: z.string().min(2),
  faq: z.string().min(2),
  objections: z.string().min(2),
  offer: z.string().min(2),
  checkoutUrl: z.string().url().optional().or(z.literal("")),
  transferTriggers: z.string().min(2),
  cta: z.string().min(2),
  isActive: z.boolean().default(true),
});

export const settingsSchema = z.object({
  evolutionApiUrl: z.string().url().optional().or(z.literal("")),
  evolutionApiKey: z.string().optional().or(z.literal("")),
  evolutionInstanceName: z.string().optional().or(z.literal("")),
  webhookUrl: z.string().url().optional().or(z.literal("")),
  openRouterApiKey: z.string().optional().or(z.literal("")),
  openRouterModel: z.string().min(2).default("deepseek/deepseek-chat"),
  temperature: z.number().min(0).max(2).default(0.6),
  minDelaySeconds: z.number().int().min(0).max(120).default(2),
  maxDelaySeconds: z.number().int().min(0).max(300).default(8),
  safeMode: z.boolean().default(true),
  defaultCheckoutUrl: z.string().url().optional().or(z.literal("")),
});

export const evolutionSendSchema = z.object({
  phone: z.string().min(8),
  text: z.string().min(1),
});
