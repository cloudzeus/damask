/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TraderStatus" AS ENUM ('LEAD', 'CUSTOMER');

-- AlterTable
ALTER TABLE "AccessRequest" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "doy" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "profession" TEXT,
ADD COLUMN     "sodtype" INTEGER NOT NULL DEFAULT 13,
ADD COLUMN     "status" "TraderStatus" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_key" ON "Contact"("userId");

-- CreateIndex
CREATE INDEX "Customer_sodtype_status_idx" ON "Customer"("sodtype", "status");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
