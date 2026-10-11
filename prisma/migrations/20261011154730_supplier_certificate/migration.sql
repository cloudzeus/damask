-- AlterTable
ALTER TABLE "Trdr" ADD COLUMN     "supplierLogoKey" TEXT;

-- CreateTable
CREATE TABLE "SupplierCertificate" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "supplierTrdrId" TEXT,
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signatureKey" TEXT,
    "stampKey" TEXT,
    "pdfKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCertificate_expenseId_key" ON "SupplierCertificate"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCertificate_token_key" ON "SupplierCertificate"("token");

-- CreateIndex
CREATE INDEX "SupplierCertificate_status_idx" ON "SupplierCertificate"("status");

-- AddForeignKey
ALTER TABLE "SupplierCertificate" ADD CONSTRAINT "SupplierCertificate_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
