-- ApplicationDocument: optional link to a DocumentType (τύπος δικαιολογητικού),
-- ώστε το ανέβασμα εγγράφου σε πρόγραμμα να επιλέγει τύπο από τον κοινό κατάλογο.
ALTER TABLE "ApplicationDocument" ADD COLUMN "documentTypeId" TEXT;
ALTER TABLE "ApplicationDocument"
  ADD CONSTRAINT "ApplicationDocument_documentTypeId_fkey"
  FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ApplicationDocument_documentTypeId_idx" ON "ApplicationDocument"("documentTypeId");
