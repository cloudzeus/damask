-- AlterTable
ALTER TABLE "TrdrDossierDocument" ADD COLUMN "programId" TEXT,
ADD COLUMN "reusable" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "TrdrDossierDocument_programId_idx" ON "TrdrDossierDocument"("programId");

-- AddForeignKey
ALTER TABLE "TrdrDossierDocument" ADD CONSTRAINT "TrdrDossierDocument_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
