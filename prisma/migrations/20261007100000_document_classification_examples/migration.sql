-- CreateTable
CREATE TABLE "DocumentClassificationExample" (
    "id" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "predictedTypeId" TEXT,
    "wasCorrect" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "trdrId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentClassificationExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentClassificationExample_documentTypeId_createdAt_idx" ON "DocumentClassificationExample"("documentTypeId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentClassificationExample" ADD CONSTRAINT "DocumentClassificationExample_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
