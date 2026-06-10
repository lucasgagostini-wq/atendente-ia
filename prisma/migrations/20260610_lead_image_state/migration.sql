-- Estado persistente de mídia/foto de serviço no Lead.
-- Substitui o marcador frágil [FOTO_RECEBIDA] no summary por colunas robustas
-- que os gates determinísticos e a safety final consultam.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "hasReceivedImage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastImageAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "imageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pendingMediaAt" TIMESTAMP(3);

-- Backfill: leads que já têm o marcador legado [FOTO_RECEBIDA] no summary
-- passam a ter o estado persistente correto, sem depender mais do regex.
UPDATE "Lead"
SET "hasReceivedImage" = true
WHERE "summary" LIKE '%[FOTO_RECEBIDA]%' AND "hasReceivedImage" = false;
