-- CreateEnum
CREATE TYPE "ProposalSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProposalSubmission" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProposalSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "opskeRef" TEXT,
    "totalAmount" DECIMAL(18,2),
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalSubmission_applicationId_idx" ON "ProposalSubmission"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalSubmission_applicationId_version_key" ON "ProposalSubmission"("applicationId", "version");

-- AddForeignKey
ALTER TABLE "ProposalSubmission" ADD CONSTRAINT "ProposalSubmission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
