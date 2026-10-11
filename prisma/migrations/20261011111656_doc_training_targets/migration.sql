-- AlterEnum
ALTER TYPE "FinancialValueType" ADD VALUE 'TEXT';

-- AlterTable
ALTER TABLE "DocumentClassificationExample" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "TaxFormTemplateField" ADD COLUMN     "target" TEXT;

-- Δείγματα χωρίς πελάτη = εκπαίδευση (seed scripts)
UPDATE "DocumentClassificationExample" SET "origin" = 'TRAINING' WHERE "trdrId" IS NULL;
