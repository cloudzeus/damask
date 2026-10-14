-- Program: κανόνας προσφοράς
ALTER TABLE "Program" ADD COLUMN "quotePolicy" TEXT;
ALTER TABLE "Program" ADD COLUMN "quotePolicyNote" TEXT;

-- Παραστατικά υλοποίησης ανά εγκεκριμένη δαπάνη
CREATE TABLE "ExpenseInvoice" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "number" TEXT,
    "date" TIMESTAMP(3),
    "supplier" TEXT,
    "supplierAfm" TEXT,
    "netAmount" DECIMAL(18,2),
    "vatAmount" DECIMAL(18,2),
    "totalAmount" DECIMAL(18,2),
    "invoiceKey" TEXT NOT NULL,
    "invoiceName" TEXT NOT NULL,
    "invoiceMime" TEXT,
    "bankExtraitKey" TEXT,
    "bankExtraitName" TEXT,
    "bankExtraitMime" TEXT,
    "paidAmount" DECIMAL(18,2),
    "paidAt" TIMESTAMP(3),
    "readError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseInvoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseInvoice_expenseId_idx" ON "ExpenseInvoice"("expenseId");
ALTER TABLE "ExpenseInvoice" ADD CONSTRAINT "ExpenseInvoice_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
