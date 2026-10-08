CREATE TABLE "EligibilityAssessment" (
  "id" TEXT NOT NULL,
  "trdrId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "probability" INTEGER,
  "verdict" TEXT,
  "score" DECIMAL(5,1),
  "summary" TEXT,
  "result" JSONB,
  "inputSnapshot" JSONB,
  "usedGuidePdf" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT,
  "error" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "EligibilityAssessment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EligibilityAssessment_trdrId_createdAt_idx" ON "EligibilityAssessment"("trdrId", "createdAt");
CREATE INDEX "EligibilityAssessment_programId_idx" ON "EligibilityAssessment"("programId");
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
