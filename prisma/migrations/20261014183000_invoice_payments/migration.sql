-- Πολλές πληρωμές ανά παραστατικό (δόσεις)· ο πίνακας ExpenseInvoice είναι ακόμη άδειος.
ALTER TABLE "ExpenseInvoice" DROP COLUMN "bankExtraitKey", DROP COLUMN "bankExtraitName", DROP COLUMN "bankExtraitMime", DROP COLUMN "paidAmount", DROP COLUMN "paidAt", DROP COLUMN "paidTo";
CREATE TABLE "ExpenseInvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "paidAt" TIMESTAMP(3),
    "payee" TEXT,
    "docs" JSONB NOT NULL,
    "readError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseInvoicePayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseInvoicePayment_invoiceId_idx" ON "ExpenseInvoicePayment"("invoiceId");
ALTER TABLE "ExpenseInvoicePayment" ADD CONSTRAINT "ExpenseInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ExpenseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
