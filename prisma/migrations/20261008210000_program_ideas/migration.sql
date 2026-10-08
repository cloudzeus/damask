CREATE TABLE "ProgramIdeaSet" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "capabilities" TEXT,
  "result" JSONB,
  "model" TEXT,
  "error" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ProgramIdeaSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgramIdeaSet_programId_createdAt_idx" ON "ProgramIdeaSet"("programId", "createdAt");
ALTER TABLE "ProgramIdeaSet" ADD CONSTRAINT "ProgramIdeaSet_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
