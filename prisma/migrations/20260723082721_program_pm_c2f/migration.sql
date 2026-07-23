-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "ProgramExpense" ADD COLUMN     "paymentRequestId" TEXT;

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT,
    "targetAmount" DECIMAL(18,2),
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRequest_applicationId_idx" ON "PaymentRequest"("applicationId");

-- CreateIndex
CREATE INDEX "ProgramExpense_paymentRequestId_idx" ON "ProgramExpense"("paymentRequestId");

-- AddForeignKey
ALTER TABLE "ProgramExpense" ADD CONSTRAINT "ProgramExpense_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
