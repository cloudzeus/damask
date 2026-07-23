-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('ASSESSMENT', 'DOCUMENTS', 'EXPENSES_DELIVERABLES', 'OPSKE_SUBMISSION', 'INSPECTION', 'MONITORING');

-- CreateEnum
CREATE TYPE "ObligationKind" AS ENUM ('DELIVERABLE', 'FORM', 'CRITERION', 'TASK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "AssessmentVerdict" AS ENUM ('PENDING', 'ELIGIBLE', 'INELIGIBLE');

-- AlterTable
ALTER TABLE "ProgramApplication" ADD COLUMN     "assessmentMaxScore" DOUBLE PRECISION,
ADD COLUMN     "assessmentScore" DOUBLE PRECISION,
ADD COLUMN     "assessmentVerdict" "AssessmentVerdict" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "opskeRef" TEXT,
ADD COLUMN     "opskeStatus" TEXT,
ADD COLUMN     "opskeSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "processorId" TEXT,
ADD COLUMN     "stage" "ApplicationStage" NOT NULL DEFAULT 'ASSESSMENT';

-- CreateTable
CREATE TABLE "ApplicationObligation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL,
    "kind" "ObligationKind" NOT NULL DEFAULT 'TASK',
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "obligationId" TEXT,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCriterionScore" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "criterionId" TEXT,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApplicationCriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationObligation_applicationId_idx" ON "ApplicationObligation"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationObligation_applicationId_stage_idx" ON "ApplicationObligation"("applicationId", "stage");

-- CreateIndex
CREATE INDEX "ApplicationObligation_status_idx" ON "ApplicationObligation"("status");

-- CreateIndex
CREATE INDEX "ApplicationDocument_applicationId_idx" ON "ApplicationDocument"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationDocument_obligationId_idx" ON "ApplicationDocument"("obligationId");

-- CreateIndex
CREATE INDEX "ApplicationCriterionScore_applicationId_idx" ON "ApplicationCriterionScore"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCriterionScore_applicationId_criterionId_key" ON "ApplicationCriterionScore"("applicationId", "criterionId");

-- AddForeignKey
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_processorId_fkey" FOREIGN KEY ("processorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationObligation" ADD CONSTRAINT "ApplicationObligation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationObligation" ADD CONSTRAINT "ApplicationObligation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ApplicationObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCriterionScore" ADD CONSTRAINT "ApplicationCriterionScore_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
