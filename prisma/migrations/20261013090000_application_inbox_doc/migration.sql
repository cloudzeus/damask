-- CreateTable
CREATE TABLE "ApplicationInboxDoc" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "relPath" TEXT,
    "extracted" JSONB,
    "readError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "ApplicationInboxDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApplicationInboxDoc_applicationId_status_idx" ON "ApplicationInboxDoc"("applicationId", "status");
CREATE INDEX "ApplicationInboxDoc_trdrId_idx" ON "ApplicationInboxDoc"("trdrId");
ALTER TABLE "ApplicationInboxDoc" ADD CONSTRAINT "ApplicationInboxDoc_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
