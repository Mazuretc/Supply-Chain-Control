-- Renewable worker leases so stale RUNNING jobs can be recovered safely.
ALTER TABLE "Job" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "Job" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "Job_status_availableAt_leaseExpiresAt_idx"
ON "Job"("status", "availableAt", "leaseExpiresAt");
