-- Σειρές εγγράφων (π.χ. Φ2 ανά μήνα)
ALTER TABLE "DocumentType" ADD COLUMN "seriesKind" TEXT;
ALTER TABLE "TrdrDossierDocument" ADD COLUMN "period" TEXT;
ALTER TABLE "ApplicationDocument" ADD COLUMN "period" TEXT;
ALTER TABLE "ProgramRequiredForm" ADD COLUMN "seriesCount" INTEGER, ADD COLUMN "seriesFrom" TEXT, ADD COLUMN "seriesTo" TEXT;
CREATE INDEX "TrdrDossierDocument_trdrId_documentTypeId_period_idx" ON "TrdrDossierDocument"("trdrId", "documentTypeId", "period");
