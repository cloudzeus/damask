-- CreateEnum
CREATE TYPE "PurchaseReconVerdict" AS ENUM ('OK', 'MISMATCH', 'UNCERTAIN');

-- CreateTable
CREATE TABLE "ExpensePurchase" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "serial" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2),
    "invoiceKey" TEXT,
    "invoiceName" TEXT,
    "bankExtraitKey" TEXT,
    "bankExtraitName" TEXT,
    "supplierCertKey" TEXT,
    "supplierCertName" TEXT,
    "reconVerdict" "PurchaseReconVerdict",
    "reconNote" TEXT,
    "reconCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpensePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePurchase_expenseId_key" ON "ExpensePurchase"("expenseId");

-- AddForeignKey
ALTER TABLE "ExpensePurchase" ADD CONSTRAINT "ExpensePurchase_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
