CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportBatch_trdrId_status_idx" ON "ImportBatch"("trdrId", "status");
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "relPath" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "hash" TEXT,
    "storageKey" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'UPLOADING',
    "dest" TEXT,
    "suggestion" JSONB,
    "appId" TEXT,
    "junkReason" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "waitReason" TEXT,
    "autoSaved" BOOLEAN NOT NULL DEFAULT false,
    "resultNote" TEXT,
    "resultRef" TEXT,
    "catalogVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportItem_batchId_idx" ON "ImportItem"("batchId");
CREATE INDEX "ImportItem_trdrId_hash_idx" ON "ImportItem"("trdrId", "hash");
CREATE INDEX "ImportItem_phase_nextAttemptAt_idx" ON "ImportItem"("phase", "nextAttemptAt");
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
