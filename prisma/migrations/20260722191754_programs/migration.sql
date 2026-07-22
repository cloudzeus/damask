-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProgramExtractStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProgramBonusKind" AS ENUM ('SPEED', 'INNOVATION', 'GREEN', 'EMPLOYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseSuggestSource" AS ENUM ('AI', 'MANUAL');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "referenceCode" TEXT,
    "sourceFileName" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "submissionStart" TIMESTAMP(3),
    "submissionEnd" TIMESTAMP(3),
    "totalBudget" DECIMAL(18,2),
    "fundingRate" DECIMAL(5,2),
    "durationMonths" INTEGER,
    "minEmployeesFte" DECIMAL(10,2),
    "minOperationalYears" DECIMAL(5,2),
    "eligibilityNote" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "extractStatus" "ProgramExtractStatus" NOT NULL DEFAULT 'PENDING',
    "extractedData" JSONB,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "errorMessage" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExpenseCategory" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "minPercentage" DECIMAL(5,2),
    "maxPercentage" DECIMAL(5,2),
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramKad" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ProgramKad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBonus" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ProgramBonusKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "condition" TEXT,
    "bonusRate" DECIMAL(5,2),
    "bonusAmount" DECIMAL(18,2),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCriterion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(5,2),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDeadline" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPhase" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDeliverable" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "phaseId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRegion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ProgramRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEligibleLegalForm" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProgramEligibleLegalForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramApplication" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExpense" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2),
    "date" TIMESTAMP(3),
    "vendor" TEXT,
    "vendorAfm" TEXT,
    "docNumber" TEXT,
    "suggestedCategoryId" TEXT,
    "suggestionReason" TEXT,
    "suggestionConfidence" DOUBLE PRECISION,
    "suggestionSource" "ExpenseSuggestSource",
    "categoryId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_storageKey_key" ON "Program"("storageKey");

-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");

-- CreateIndex
CREATE INDEX "Program_extractStatus_idx" ON "Program"("extractStatus");

-- CreateIndex
CREATE INDEX "Program_submissionEnd_idx" ON "Program"("submissionEnd");

-- CreateIndex
CREATE INDEX "ProgramExpenseCategory_programId_idx" ON "ProgramExpenseCategory"("programId");

-- CreateIndex
CREATE INDEX "ProgramKad_programId_idx" ON "ProgramKad"("programId");

-- CreateIndex
CREATE INDEX "ProgramBonus_programId_idx" ON "ProgramBonus"("programId");

-- CreateIndex
CREATE INDEX "ProgramCriterion_programId_idx" ON "ProgramCriterion"("programId");

-- CreateIndex
CREATE INDEX "ProgramDeadline_programId_idx" ON "ProgramDeadline"("programId");

-- CreateIndex
CREATE INDEX "ProgramPhase_programId_idx" ON "ProgramPhase"("programId");

-- CreateIndex
CREATE INDEX "ProgramDeliverable_programId_idx" ON "ProgramDeliverable"("programId");

-- CreateIndex
CREATE INDEX "ProgramRegion_programId_idx" ON "ProgramRegion"("programId");

-- CreateIndex
CREATE INDEX "ProgramEligibleLegalForm_programId_idx" ON "ProgramEligibleLegalForm"("programId");

-- CreateIndex
CREATE INDEX "ProgramApplication_trdrId_idx" ON "ProgramApplication"("trdrId");

-- CreateIndex
CREATE INDEX "ProgramApplication_programId_idx" ON "ProgramApplication"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramApplication_trdrId_programId_key" ON "ProgramApplication"("trdrId", "programId");

-- CreateIndex
CREATE INDEX "ProgramExpense_applicationId_idx" ON "ProgramExpense"("applicationId");

-- CreateIndex
CREATE INDEX "ProgramExpense_categoryId_idx" ON "ProgramExpense"("categoryId");

-- AddForeignKey
ALTER TABLE "ProgramExpenseCategory" ADD CONSTRAINT "ProgramExpenseCategory_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramKad" ADD CONSTRAINT "ProgramKad_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBonus" ADD CONSTRAINT "ProgramBonus_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCriterion" ADD CONSTRAINT "ProgramCriterion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDeadline" ADD CONSTRAINT "ProgramDeadline_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPhase" ADD CONSTRAINT "ProgramPhase_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDeliverable" ADD CONSTRAINT "ProgramDeliverable_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDeliverable" ADD CONSTRAINT "ProgramDeliverable_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProgramPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRegion" ADD CONSTRAINT "ProgramRegion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEligibleLegalForm" ADD CONSTRAINT "ProgramEligibleLegalForm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExpense" ADD CONSTRAINT "ProgramExpense_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExpense" ADD CONSTRAINT "ProgramExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProgramExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
