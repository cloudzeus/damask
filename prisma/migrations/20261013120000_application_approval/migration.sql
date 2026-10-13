-- CreateTable
CREATE TABLE "ApplicationApproval" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "applicationCode" TEXT,
    "beneficiaryCode" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decisionRef" TEXT,
    "ada" TEXT,
    "decisionDate" TIMESTAMP(3),
    "resultStatus" TEXT,
    "projectTitle" TEXT,
    "durationMonths" INTEGER,
    "endsAt" TIMESTAMP(3),
    "regionCategory" TEXT,
    "score" DOUBLE PRECISION,
    "totalBudget" DECIMAL(18,2),
    "publicAmount" DECIMAL(18,2),
    "privateAmount" DECIMAL(18,2),
    "aidPct" DOUBLE PRECISION,
    "expenses" JSONB,
    "indicators" JSONB,
    "extra" JSONB,
    "docKey" TEXT,
    "docName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicationApproval_applicationId_key" ON "ApplicationApproval"("applicationId");
ALTER TABLE "ApplicationApproval" ADD CONSTRAINT "ApplicationApproval_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
