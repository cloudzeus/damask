-- CreateTable
CREATE TABLE "TrdrProgramMatch" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "matched" TEXT[],
    "failed" TEXT[],
    "matchedKads" TEXT[],
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrdrProgramMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrdrProgramMatch_programId_eligible_idx" ON "TrdrProgramMatch"("programId", "eligible");

-- CreateIndex
CREATE INDEX "TrdrProgramMatch_trdrId_eligible_idx" ON "TrdrProgramMatch"("trdrId", "eligible");

-- CreateIndex
CREATE UNIQUE INDEX "TrdrProgramMatch_trdrId_programId_key" ON "TrdrProgramMatch"("trdrId", "programId");

-- AddForeignKey
ALTER TABLE "TrdrProgramMatch" ADD CONSTRAINT "TrdrProgramMatch_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrProgramMatch" ADD CONSTRAINT "TrdrProgramMatch_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
