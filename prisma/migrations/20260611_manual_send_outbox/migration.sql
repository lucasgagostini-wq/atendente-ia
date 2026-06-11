DO $$
BEGIN
  CREATE TYPE "OutboundMessageJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OutboundMessageJob" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" "OutboundMessageJobStatus" NOT NULL DEFAULT 'PENDING',
  "transport" TEXT NOT NULL DEFAULT 'BAILEYS_BRIDGE_OUTBOX',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "whatsappMessageId" TEXT,
  "providerPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundMessageJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundMessageJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OutboundMessageJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OutboundMessageJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OutboundMessageJob_profileId_status_createdAt_idx"
  ON "OutboundMessageJob"("profileId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "OutboundMessageJob_conversationId_status_createdAt_idx"
  ON "OutboundMessageJob"("conversationId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "OutboundMessageJob_leadId_status_createdAt_idx"
  ON "OutboundMessageJob"("leadId", "status", "createdAt");
