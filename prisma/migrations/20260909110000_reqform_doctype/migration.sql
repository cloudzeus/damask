-- Link απαιτούμενου εντύπου προγράμματος με τύπο δικαιολογητικού (matching αποθήκης).
ALTER TABLE "ProgramRequiredForm" ADD COLUMN "documentTypeId" TEXT;
CREATE INDEX "ProgramRequiredForm_documentTypeId_idx" ON "ProgramRequiredForm"("documentTypeId");
ALTER TABLE "ProgramRequiredForm" ADD CONSTRAINT "ProgramRequiredForm_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
