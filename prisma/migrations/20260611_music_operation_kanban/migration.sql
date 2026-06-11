DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationStage') THEN
    CREATE TYPE "OperationStage" AS ENUM (
      'PAID_ORDER',
      'PRODUCTION',
      'READY_TO_SEND',
      'SENT',
      'PIX_RECOVERY',
      'SUPPORT'
    );
  END IF;
END
$$;

ALTER TABLE "Lead"
ADD COLUMN IF NOT EXISTS "operationStage" "OperationStage";

CREATE INDEX IF NOT EXISTS "Lead_profileId_operationStage_lastMessageAt_idx"
ON "Lead" ("profileId", "operationStage", "lastMessageAt");

UPDATE "Lead"
SET "operationStage" = 'PAID_ORDER'::"OperationStage"
WHERE "operationStage" IS NULL
  AND "profileId" IN (
    SELECT "id" FROM "Profile" WHERE "slug" = 'musica-personalizada'
  );
