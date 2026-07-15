-- CreateEnum
CREATE TYPE "DbBackupStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'RESTORING');

-- CreateTable
CREATE TABLE "DbBackup" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "status" "DbBackupStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DbBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DbBackup_storageKey_key" ON "DbBackup"("storageKey");

-- CreateIndex
CREATE INDEX "DbBackup_status_createdAt_idx" ON "DbBackup"("status", "createdAt");
