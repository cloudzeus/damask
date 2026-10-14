CREATE TABLE "ExpenseInvoiceAttachment" (
    "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "kind" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseInvoiceAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseInvoiceAttachment_invoiceId_idx" ON "ExpenseInvoiceAttachment"("invoiceId");
ALTER TABLE "ExpenseInvoiceAttachment" ADD CONSTRAINT "ExpenseInvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ExpenseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
