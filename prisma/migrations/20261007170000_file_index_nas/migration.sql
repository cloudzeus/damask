-- CreateTable
CREATE TABLE "FileIndexEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "lastChanged" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "trdrId" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missingAt" TIMESTAMP(3),
    "nasBackedUpAt" TIMESTAMP(3),
    "nasSize" INTEGER,
    "nasSourceChanged" TIMESTAMP(3),
    "nasError" TEXT,
    "nasAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FileIndexEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileIndexEntry_key_key" ON "FileIndexEntry"("key");
CREATE INDEX "FileIndexEntry_trdrId_idx" ON "FileIndexEntry"("trdrId");
CREATE INDEX "FileIndexEntry_category_idx" ON "FileIndexEntry"("category");
CREATE INDEX "FileIndexEntry_nasBackedUpAt_idx" ON "FileIndexEntry"("nasBackedUpAt");

-- CreateTable
CREATE TABLE "NasBackupRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "uploaded" INTEGER NOT NULL DEFAULT 0,
    "uploadedBytes" BIGINT NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "triggeredById" TEXT,
    CONSTRAINT "NasBackupRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NasBackupRun_startedAt_idx" ON "NasBackupRun"("startedAt");
