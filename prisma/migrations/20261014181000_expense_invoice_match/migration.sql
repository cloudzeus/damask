ALTER TABLE "ExpenseInvoice" ADD COLUMN "paidTo" TEXT;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "supplierCertKey" TEXT;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "supplierCertName" TEXT;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "supplierCertMime" TEXT;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "lines" JSONB;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "matchVerdict" TEXT;
ALTER TABLE "ExpenseInvoice" ADD COLUMN "matchNote" TEXT;
