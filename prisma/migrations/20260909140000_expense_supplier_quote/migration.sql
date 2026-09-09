-- Προμηθευτής (FK Trdr) + ενυπόγραφη προσφορά (αρχείο) ανά δαπάνη.
ALTER TABLE "ProgramExpense" ADD COLUMN "supplierTrdrId" TEXT;
ALTER TABLE "ProgramExpense" ADD COLUMN "quoteStorageKey" TEXT;
ALTER TABLE "ProgramExpense" ADD COLUMN "quoteName" TEXT;
ALTER TABLE "ProgramExpense" ADD COLUMN "quoteMimeType" TEXT;
CREATE INDEX "ProgramExpense_supplierTrdrId_idx" ON "ProgramExpense"("supplierTrdrId");
ALTER TABLE "ProgramExpense" ADD CONSTRAINT "ProgramExpense_supplierTrdrId_fkey" FOREIGN KEY ("supplierTrdrId") REFERENCES "Trdr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
