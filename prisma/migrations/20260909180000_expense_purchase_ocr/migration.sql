-- AlterTable
ALTER TABLE "ExpensePurchase" ADD COLUMN "ocrAmount" DECIMAL(18,2);
ALTER TABLE "ExpensePurchase" ADD COLUMN "ocrSupplier" TEXT;
ALTER TABLE "ExpensePurchase" ADD COLUMN "ocrNumber" TEXT;
ALTER TABLE "ExpensePurchase" ADD COLUMN "ocrDate" TIMESTAMP(3);
ALTER TABLE "ExpensePurchase" ADD COLUMN "ocrCheckedAt" TIMESTAMP(3);
