-- AlterTable
ALTER TABLE "TrdrDossierDocument" ADD COLUMN "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "TrdrDossierDocument_trdrId_contentHash_idx" ON "TrdrDossierDocument"("trdrId", "contentHash");
