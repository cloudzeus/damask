-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[];
