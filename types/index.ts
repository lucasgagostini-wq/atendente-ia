export type LeadStatus = "NEW" | "QUALIFIED" | "NEGOTIATION" | "CONVERTED" | "LOST";
export type FunnelStage = "COLD" | "WARM" | "HOT" | "CHECKOUT" | "CUSTOMER";
export type ConversationStatus = "OPEN" | "ARCHIVED" | "CLOSED";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageRole = "LEAD" | "ASSISTANT" | "HUMAN" | "SYSTEM";
export type MessageType = "TEXT" | "IMAGE" | "AUDIO";
export type ProspectingJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  status: LeadStatus;
  funnelStage: FunnelStage;
  source: string | null;
  aiEnabled: boolean;
  humanTakeover: boolean;
  summary: string | null;
  interest: string | null;
  objections?: Record<string, unknown> | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  leadTags?: Array<{
    leadId: string;
    tagId: string;
    tag: Tag;
  }>;
};

export type Conversation = {
  id: string;
  leadId: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  lead?: Lead;
  messages?: Message[];
};

export type Message = {
  id: string;
  conversationId: string;
  leadId: string;
  direction: MessageDirection;
  role: MessageRole;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type Prompt = {
  id: string;
  name: string;
  personality: string;
  tone: string;
  goal: string;
  rules: string;
  faq: string;
  objections: string;
  offer: string;
  checkoutUrl: string | null;
  transferTriggers: string;
  cta: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Automation = {
  id: string;
  name: string;
  trigger: string;
  message: string;
  delayMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type Settings = {
  id: string;
  evolutionApiUrl: string | null;
  evolutionApiKey: string | null;
  evolutionInstanceName: string | null;
  webhookUrl: string | null;
  openRouterApiKey: string | null;
  openRouterModel: string;
  apifyApiToken: string | null;
  prospectorMapsActorId: string;
  temperature: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  safeMode: boolean;
  defaultCheckoutUrl: string | null;
  aiPaused: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProspectingLead = {
  id: string;
  jobId: string;
  source: string;
  companyName: string;
  phone: string | null;
  rating: number | null;
  reviewsCount: number | null;
  address: string | null;
  website: string | null;
  mapsUrl: string | null;
  placeId: string | null;
  businessCategory: string | null;
  imported: boolean;
  importedLeadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProspectingJob = {
  id: string;
  query: string;
  maxResults: number;
  source: string;
  status: ProspectingJobStatus;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  resultsCount: number;
  importedCount: number;
  createdAt: string;
  updatedAt: string;
  leads?: ProspectingLead[];
};

export type BroadcastSuggestion = {
  suggestedMessage: string;
  variations: string[];
  model: string;
};

export type BroadcastRunResult = {
  runId: string;
  tagId: string;
  tagName: string;
  totalEligible: number;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: Array<{
    leadId: string;
    phone: string;
    reason: string;
  }>;
};

export type LogItem = {
  id: string;
  type: string;
  message: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export type DashboardMetrics = {
  totalLeads: number;
  activeConversations: number;
  messagesToday: number;
  hotLeads: number;
  conversions: number;
  responseRate: number;
};
