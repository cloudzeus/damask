-- CreateTable
CREATE TABLE "ProgramExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "product" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(18,2),
    "vatPct" DECIMAL(5,2),
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramExpenseLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgramExpenseLine_expenseId_idx" ON "ProgramExpenseLine"("expenseId");
ALTER TABLE "ProgramExpenseLine" ADD CONSTRAINT "ProgramExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
