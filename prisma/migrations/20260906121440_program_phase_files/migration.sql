-- CreateTable
CREATE TABLE "ProgramPhaseFile" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "phase" "DeliverablePhase" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramPhaseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramPhaseFile_programId_idx" ON "ProgramPhaseFile"("programId");

-- CreateIndex
CREATE INDEX "ProgramPhaseFile_programId_phase_idx" ON "ProgramPhaseFile"("programId", "phase");

-- AddForeignKey
ALTER TABLE "ProgramPhaseFile" ADD CONSTRAINT "ProgramPhaseFile_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
