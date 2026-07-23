/*
  Warnings:

  - A unique constraint covering the columns `[replacesExpenseId]` on the table `ProgramExpense` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'REPLACED');

-- AlterTable
ALTER TABLE "ProgramExpense" ADD COLUMN     "replacesExpenseId" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ProgramExpenseCertification" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "location" TEXT,
    "assetRegistryRef" TEXT,
    "assetRegistryDate" TIMESTAMP(3),
    "photoKey" TEXT,
    "bankStatementKey" TEXT,
    "newUnusedCertKey" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramExpenseCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExpenseCertification_expenseId_key" ON "ProgramExpenseCertification"("expenseId");

-- CreateIndex
CREATE INDEX "ProgramExpenseCertification_expenseId_idx" ON "ProgramExpenseCertification"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExpense_replacesExpenseId_key" ON "ProgramExpense"("replacesExpenseId");

-- CreateIndex
CREATE INDEX "ProgramExpense_status_idx" ON "ProgramExpense"("status");

-- AddForeignKey
ALTER TABLE "ProgramExpense" ADD CONSTRAINT "ProgramExpense_replacesExpenseId_fkey" FOREIGN KEY ("replacesExpenseId") REFERENCES "ProgramExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExpenseCertification" ADD CONSTRAINT "ProgramExpenseCertification_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExpenseCertification" ADD CONSTRAINT "ProgramExpenseCertification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
