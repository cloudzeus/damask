ALTER TABLE "DocumentType" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TrdrDossierDocument" ADD COLUMN "valuesReadAt" TIMESTAMP(3);
ALTER TABLE "ImportItem" ALTER COLUMN "catalogVersion" TYPE TEXT USING "catalogVersion"::text;
CREATE TABLE "StoredFileHash" (
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "trdrId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredFileHash_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "StoredFileHash_trdrId_hash_idx" ON "StoredFileHash"("trdrId", "hash");
CREATE INDEX "StoredFileHash_hash_idx" ON "StoredFileHash"("hash");
