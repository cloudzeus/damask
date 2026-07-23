-- CreateEnum
CREATE TYPE "ProgramLeadStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CLICKED');

-- CreateTable
CREATE TABLE "ProgramLead" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ProgramLeadStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramLead_tokenHash_key" ON "ProgramLead"("tokenHash");

-- CreateIndex
CREATE INDEX "ProgramLead_programId_idx" ON "ProgramLead"("programId");

-- CreateIndex
CREATE INDEX "ProgramLead_status_idx" ON "ProgramLead"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramLead_programId_trdrId_key" ON "ProgramLead"("programId", "trdrId");

-- AddForeignKey
ALTER TABLE "ProgramLead" ADD CONSTRAINT "ProgramLead_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramLead" ADD CONSTRAINT "ProgramLead_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
