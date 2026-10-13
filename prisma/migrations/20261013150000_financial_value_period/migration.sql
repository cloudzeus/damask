ALTER TABLE "TrdrFinancialValue" ADD COLUMN "period" TEXT NOT NULL DEFAULT '';
DROP INDEX "TrdrFinancialValue_trdrId_fieldKey_year_key";
CREATE UNIQUE INDEX "TrdrFinancialValue_trdrId_fieldKey_year_period_key" ON "TrdrFinancialValue"("trdrId", "fieldKey", "year", "period");
ALTER TABLE "TrdrFormRecord" ADD COLUMN "period" TEXT;
ALTER TABLE "TrdrFormRecord" ADD COLUMN "dossierDocId" TEXT;
