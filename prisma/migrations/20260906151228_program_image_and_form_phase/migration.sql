-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "ProgramRequiredForm" ADD COLUMN     "phase" "DeliverablePhase",
ADD COLUMN     "reusable" BOOLEAN NOT NULL DEFAULT false;
