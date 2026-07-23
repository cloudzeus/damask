-- CreateEnum
CREATE TYPE "TaskAssignTo" AS ENUM ('MANAGER', 'PROCESSOR', 'BOTH');

-- AlterTable
ALTER TABLE "ApplicationObligation" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "ProgramTaskTemplate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignTo" "TaskAssignTo" NOT NULL DEFAULT 'PROCESSOR',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "dueOffsetDays" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramTaskTemplate_programId_idx" ON "ProgramTaskTemplate"("programId");

-- CreateIndex
CREATE INDEX "ProgramTaskTemplate_programId_stage_idx" ON "ProgramTaskTemplate"("programId", "stage");

-- CreateIndex
CREATE INDEX "ApplicationObligation_templateId_idx" ON "ApplicationObligation"("templateId");

-- AddForeignKey
ALTER TABLE "ApplicationObligation" ADD CONSTRAINT "ApplicationObligation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgramTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTaskTemplate" ADD CONSTRAINT "ProgramTaskTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
