-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'PAUSED', 'AWAITING_WHATSAPP', 'DISCONNECTED');

-- DropIndex
DROP INDEX "Lead_phone_key";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "profileId" TEXT;

-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN     "profileId" TEXT;

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "whatsappSessionName" TEXT,
    "pixKey" TEXT,
    "pixName" TEXT,
    "pixBank" TEXT,
    "promptConfig" JSONB,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_slug_key" ON "Profile"("slug");

-- CreateIndex
CREATE INDEX "Profile_status_idx" ON "Profile"("status");

-- CreateIndex
CREATE INDEX "Lead_profileId_lastMessageAt_idx" ON "Lead"("profileId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_profileId_phone_key" ON "Lead"("profileId", "phone");

-- CreateIndex
CREATE INDEX "Prompt_profileId_isActive_idx" ON "Prompt"("profileId", "isActive");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

