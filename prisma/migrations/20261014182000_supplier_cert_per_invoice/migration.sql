DROP INDEX IF EXISTS "SupplierCertificate_expenseId_key";
CREATE INDEX "SupplierCertificate_expenseId_idx" ON "SupplierCertificate"("expenseId");
ALTER TABLE "SupplierCertificate" ADD COLUMN "invoiceId" TEXT;
CREATE UNIQUE INDEX "SupplierCertificate_invoiceId_key" ON "SupplierCertificate"("invoiceId");
ALTER TABLE "SupplierCertificate" ADD CONSTRAINT "SupplierCertificate_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ExpenseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
