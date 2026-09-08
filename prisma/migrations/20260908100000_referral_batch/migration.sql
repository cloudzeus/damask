-- Referral batch eligibility mapping (ανά εταιρία παραπομπής)
CREATE TABLE "ReferralBatch" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "fileName" TEXT,
  "total" INTEGER NOT NULL DEFAULT 0,
  "eligibleCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralBatch_referrerId_idx" ON "ReferralBatch"("referrerId");
ALTER TABLE "ReferralBatch" ADD CONSTRAINT "ReferralBatch_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferralCompany" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "afm" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "legalForm" TEXT,
  "city" TEXT,
  "zip" TEXT,
  "regionName" TEXT,
  "regionConfident" BOOLEAN NOT NULL DEFAULT false,
  "kads" JSONB,
  "eligiblePrograms" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "convertedTrdrId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCompany_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralCompany_referrerId_idx" ON "ReferralCompany"("referrerId");
CREATE INDEX "ReferralCompany_batchId_idx" ON "ReferralCompany"("batchId");
CREATE INDEX "ReferralCompany_afm_idx" ON "ReferralCompany"("afm");
CREATE INDEX "ReferralCompany_status_idx" ON "ReferralCompany"("status");
ALTER TABLE "ReferralCompany" ADD CONSTRAINT "ReferralCompany_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReferralBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCompany" ADD CONSTRAINT "ReferralCompany_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
