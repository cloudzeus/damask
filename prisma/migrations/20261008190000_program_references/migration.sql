CREATE TABLE "ProgramReference" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "storageKey" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "note" TEXT,
  "digest" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "error" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgramReference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgramReference_programId_idx" ON "ProgramReference"("programId");
ALTER TABLE "ProgramReference" ADD CONSTRAINT "ProgramReference_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
