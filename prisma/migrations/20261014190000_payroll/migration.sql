CREATE TABLE "PayrollEmployee" (
    "id" TEXT NOT NULL, "expenseId" TEXT NOT NULL, "name" TEXT NOT NULL, "afm" TEXT, "amka" TEXT, "hiredAt" TIMESTAMP(3),
    "projectHire" BOOLEAN NOT NULL DEFAULT false, "fte" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollEmployee_expenseId_idx" ON "PayrollEmployee"("expenseId");
ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PayrollDoc" (
    "id" TEXT NOT NULL, "expenseId" TEXT NOT NULL, "kind" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT,
    "amount" DECIMAL(18,2), "paidAt" TIMESTAMP(3), "period" TEXT, "note" TEXT, "readError" TEXT, "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollDoc_expenseId_idx" ON "PayrollDoc"("expenseId");
ALTER TABLE "PayrollDoc" ADD CONSTRAINT "PayrollDoc_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProgramExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "docId" TEXT, "period" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'τακτικές',
    "days" DOUBLE PRECISION, "gross" DECIMAL(18,2) NOT NULL, "employeeContrib" DECIMAL(18,2), "employerContrib" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2), "net" DECIMAL(18,2), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollLine_employeeId_period_kind_key" ON "PayrollLine"("employeeId", "period", "kind");
CREATE INDEX "PayrollLine_docId_idx" ON "PayrollLine"("docId");
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_docId_fkey" FOREIGN KEY ("docId") REFERENCES "PayrollDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
