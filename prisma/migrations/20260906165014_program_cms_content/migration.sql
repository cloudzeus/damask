-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "cmsContent" JSONB,
ADD COLUMN     "cmsGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "cmsModel" TEXT;
