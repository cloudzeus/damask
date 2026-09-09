-- Σύνδεση Οδηγού Εντύπου (region-values) με τύπο δικαιολογητικού.
ALTER TABLE "TaxFormTemplate" ADD COLUMN "documentTypeId" TEXT;
CREATE INDEX "TaxFormTemplate_documentTypeId_idx" ON "TaxFormTemplate"("documentTypeId");
ALTER TABLE "TaxFormTemplate" ADD CONSTRAINT "TaxFormTemplate_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
