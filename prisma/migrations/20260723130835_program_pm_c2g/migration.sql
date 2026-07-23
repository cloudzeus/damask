-- CreateEnum
CREATE TYPE "DeliverablePhase" AS ENUM ('ASSESSMENT', 'SUBMISSION', 'APPROVAL', 'FIRST_PAYMENT', 'PHASE_A_CERTIFICATION', 'MODIFICATION', 'FINAL_PAYMENT', 'FULL_CERTIFICATION', 'AUTHORITY_AUDIT');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PENDING', 'UPLOADED', 'ACCEPTED', 'REJECTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "DeliverableScope" AS ENUM ('EXPENSE', 'APPLICATION');

-- AlterTable
ALTER TABLE "DocumentRequest" ADD COLUMN     "deliverableId" TEXT;

-- CreateTable
CREATE TABLE "ProgramDeliverableTemplate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "phase" "DeliverablePhase" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onSiteVerification" BOOLEAN NOT NULL DEFAULT false,
    "appliesTo" "DeliverableScope" NOT NULL DEFAULT 'EXPENSE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDeliverableTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseDeliverable" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "expenseId" TEXT,
    "templateId" TEXT,
    "phase" "DeliverablePhase" NOT NULL,
    "name" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onSiteVerification" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableFile" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableDependency" (
    "id" TEXT NOT NULL,
    "dependentId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliverableDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramDeliverableTemplate_programId_idx" ON "ProgramDeliverableTemplate"("programId");

-- CreateIndex
CREATE INDEX "ProgramDeliverableTemplate_programId_phase_idx" ON "ProgramDeliverableTemplate"("programId", "phase");

-- CreateIndex
CREATE INDEX "ExpenseDeliverable_applicationId_idx" ON "ExpenseDeliverable"("applicationId");

-- CreateIndex
CREATE INDEX "ExpenseDeliverable_expenseId_idx" ON "ExpenseDeliverable"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseDeliverable_applicationId_phase_idx" ON "ExpenseDeliverable"("applicationId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDeliverable_applicationId_expenseId_templateId_key" ON "ExpenseDeliverable"("applicationId", "expenseId", "templateId");

-- CreateIndex
CREATE INDEX "DeliverableFile_deliverableId_idx" ON "DeliverableFile"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableDependency_prerequisiteId_idx" ON "DeliverableDependency"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableDependency_dependentId_prerequisiteId_key" ON "DeliverableDependency"("dependentId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "DocumentRequest_deliverableId_idx" ON "DocumentRequest"("deliverableId");

-- AddForeignKey
ALTER TABLE "ProgramDeliverableTemplate" ADD CONSTRAINT "ProgramDeliverableTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeliverable" ADD CONSTRAINT "ExpenseDeliverable_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeliverable" ADD CONSTRAINT "ExpenseDeliverable_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeliverable" ADD CONSTRAINT "ExpenseDeliverable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgramDeliverableTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableFile" ADD CONSTRAINT "DeliverableFile_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ExpenseDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "ExpenseDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "ExpenseDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ExpenseDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
