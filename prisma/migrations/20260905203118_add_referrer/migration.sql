-- CreateEnum
CREATE TYPE "ReferrerType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "Trdr" ADD COLUMN     "referrerId" TEXT;

-- CreateTable
CREATE TABLE "Referrer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReferrerType" NOT NULL DEFAULT 'COMPANY',
    "email" TEXT,
    "phone" TEXT,
    "afm" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trdrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referrer_active_idx" ON "Referrer"("active");

-- CreateIndex
CREATE INDEX "Referrer_trdrId_idx" ON "Referrer"("trdrId");

-- CreateIndex
CREATE INDEX "Trdr_referrerId_idx" ON "Trdr"("referrerId");

-- AddForeignKey
ALTER TABLE "Trdr" ADD CONSTRAINT "Trdr_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referrer" ADD CONSTRAINT "Referrer_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE SET NULL ON UPDATE CASCADE;
