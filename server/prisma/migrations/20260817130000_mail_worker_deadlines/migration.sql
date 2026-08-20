-- Mail polling progress and processing completion metadata.
ALTER TABLE "MailAccount" ADD COLUMN "lastPolledAt" TIMESTAMP(3);
ALTER TABLE "MailMessage" ADD COLUMN "processedAt" TIMESTAMP(3);

-- Existing deployments may already contain extraction rows. Seed deterministic
-- keys before making retry idempotency mandatory.
ALTER TABLE "ExtractionResult" ADD COLUMN "dedupeKey" TEXT;
UPDATE "ExtractionResult"
SET "dedupeKey" = 'legacy:' || "id"
WHERE "dedupeKey" IS NULL;
ALTER TABLE "ExtractionResult" ALTER COLUMN "dedupeKey" SET NOT NULL;
CREATE UNIQUE INDEX "ExtractionResult_dedupeKey_key"
ON "ExtractionResult"("dedupeKey");
