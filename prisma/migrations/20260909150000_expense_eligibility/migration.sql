-- Αξιολόγηση επιλεξιμότητας δαπάνης (AI τεκμηρίωση).
ALTER TABLE "ProgramExpense" ADD COLUMN "eligibilityVerdict" TEXT;
ALTER TABLE "ProgramExpense" ADD COLUMN "eligibilityNote" TEXT;
ALTER TABLE "ProgramExpense" ADD COLUMN "eligibilityCheckedAt" TIMESTAMP(3);
