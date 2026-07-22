-- CreateEnum
CREATE TYPE "TaxTemplateStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "TaxFieldKind" AS ENUM ('SINGLE', 'SERIES', 'TABLE');

-- CreateEnum
CREATE TYPE "FinancialValueType" AS ENUM ('CURRENCY', 'NUMBER', 'PERCENT', 'INTEGER', 'DATE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "FinancialValueSource" AS ENUM ('OCR', 'MANUAL');

-- CreateTable
CREATE TABLE "TaxFormTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "status" "TaxTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "sampleStorageKey" TEXT,
    "samplePageCount" INTEGER,
    "sampleThumbUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFormTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "valueType" "FinancialValueType" NOT NULL DEFAULT 'CURRENCY',
    "kind" "TaxFieldKind" NOT NULL DEFAULT 'SINGLE',
    "config" JSONB,
    "regionHint" JSONB,
    "aiHint" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFormTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrdrFormRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usage" TEXT,
    "trdrId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "extractedData" JSONB,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrdrFormRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrdrFinancialValue" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "templateId" TEXT,
    "year" INTEGER NOT NULL,
    "value" DECIMAL(18,2),
    "valueText" TEXT,
    "valueJson" JSONB,
    "kind" "TaxFieldKind" NOT NULL DEFAULT 'SINGLE',
    "valueType" "FinancialValueType" NOT NULL,
    "source" "FinancialValueSource" NOT NULL DEFAULT 'OCR',
    "sourceRecordId" TEXT,
    "confidence" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrdrFinancialValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxFormTemplate_status_idx" ON "TaxFormTemplate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFormTemplate_code_year_key" ON "TaxFormTemplate"("code", "year");

-- CreateIndex
CREATE INDEX "TaxFormTemplateField_templateId_idx" ON "TaxFormTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFormTemplateField_templateId_fieldKey_key" ON "TaxFormTemplateField"("templateId", "fieldKey");

-- CreateIndex
CREATE INDEX "TrdrFormRecord_trdrId_idx" ON "TrdrFormRecord"("trdrId");

-- CreateIndex
CREATE INDEX "TrdrFormRecord_templateId_idx" ON "TrdrFormRecord"("templateId");

-- CreateIndex
CREATE INDEX "TrdrFormRecord_trdrId_year_idx" ON "TrdrFormRecord"("trdrId", "year");

-- CreateIndex
CREATE INDEX "TrdrFinancialValue_trdrId_idx" ON "TrdrFinancialValue"("trdrId");

-- CreateIndex
CREATE INDEX "TrdrFinancialValue_fieldKey_year_idx" ON "TrdrFinancialValue"("fieldKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TrdrFinancialValue_trdrId_fieldKey_year_key" ON "TrdrFinancialValue"("trdrId", "fieldKey", "year");

-- AddForeignKey
ALTER TABLE "TaxFormTemplateField" ADD CONSTRAINT "TaxFormTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrFormRecord" ADD CONSTRAINT "TrdrFormRecord_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrFormRecord" ADD CONSTRAINT "TrdrFormRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrFinancialValue" ADD CONSTRAINT "TrdrFinancialValue_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrFinancialValue" ADD CONSTRAINT "TrdrFinancialValue_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "TrdrFormRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
