/*
  Warnings:

  - The primary key for the `ArchitectCustomer` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `customerId` on the `ArchitectCustomer` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `roleTitle` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `s1Id` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `Order` table. All the data in the column will be lost.
  - The primary key for the `PriceCache` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `customerId` on the `PriceCache` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `trdrId` to the `ArchitectCustomer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trdrId` to the `Contact` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trdrId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trdrId` to the `PriceCache` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ArchitectCustomer" DROP CONSTRAINT "ArchitectCustomer_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "PriceCache" DROP CONSTRAINT "PriceCache_customerId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_customerId_fkey";

-- DropIndex
DROP INDEX "ArchitectCustomer_customerId_idx";

-- DropIndex
DROP INDEX "Contact_customerId_idx";

-- DropIndex
DROP INDEX "Order_customerId_idx";

-- DropIndex
DROP INDEX "User_customerId_idx";

-- AlterTable
ALTER TABLE "ArchitectCustomer" DROP CONSTRAINT "ArchitectCustomer_pkey",
DROP COLUMN "customerId",
ADD COLUMN     "trdrId" TEXT NOT NULL,
ADD CONSTRAINT "ArchitectCustomer_pkey" PRIMARY KEY ("architectId", "trdrId");

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "customerId",
DROP COLUMN "roleTitle",
DROP COLUMN "s1Id",
ADD COLUMN     "COMMENTS" TEXT,
ADD COLUMN     "LINENUM" INTEGER,
ADD COLUMN     "PRSN" INTEGER,
ADD COLUMN     "TRDBRANCH" INTEGER,
ADD COLUMN     "trdrId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "customerId",
ADD COLUMN     "trdrId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PriceCache" DROP CONSTRAINT "PriceCache_pkey",
DROP COLUMN "customerId",
ADD COLUMN     "trdrId" TEXT NOT NULL,
ADD CONSTRAINT "PriceCache_pkey" PRIMARY KEY ("trdrId", "productId");

-- AlterTable
ALTER TABLE "User" DROP COLUMN "customerId",
ADD COLUMN     "trdrId" TEXT;

-- DropTable
DROP TABLE "Customer";

-- DropEnum
DROP TYPE "TraderStatus";

-- CreateTable
CREATE TABLE "Trdr" (
    "id" TEXT NOT NULL,
    "TRDR" INTEGER,
    "SODTYPE" INTEGER NOT NULL DEFAULT 13,
    "CODE" TEXT,
    "NAME" TEXT NOT NULL,
    "AFM" TEXT,
    "IRSDATA" TEXT,
    "JOBTYPETRD" TEXT,
    "ADDRESS" TEXT,
    "ZIP" TEXT,
    "DISTRICT" TEXT,
    "CITY" TEXT,
    "COUNTRY" INTEGER,
    "PHONE01" TEXT,
    "PHONE02" TEXT,
    "FAX" TEXT,
    "EMAIL" TEXT,
    "WEBPAGE" TEXT,
    "TRDCATEGORY" INTEGER,
    "TRDPGROUP" INTEGER,
    "TRDBUSINESS" INTEGER,
    "PAYMENT" INTEGER,
    "SHIPMENT" INTEGER,
    "SOCURRENCY" INTEGER DEFAULT 100,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,
    "ISPROSP" INTEGER NOT NULL DEFAULT 0,
    "REMARKS" TEXT,
    "CODE1" TEXT,
    "UPDDATE" TIMESTAMP(3),
    "appLat" DOUBLE PRECISION,
    "appLng" DOUBLE PRECISION,
    "appLogoUrl" TEXT,
    "appLegalForm" TEXT,
    "appNotes" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trdr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vat" (
    "VAT" INTEGER NOT NULL,
    "NAME" TEXT NOT NULL,
    "PERCNT" DOUBLE PRECISION NOT NULL,
    "VATS1" INTEGER,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,
    "MYDATACODE" INTEGER,

    CONSTRAINT "Vat_pkey" PRIMARY KEY ("VAT")
);

-- CreateTable
CREATE TABLE "Country" (
    "COUNTRY" INTEGER NOT NULL,
    "SHORTCUT" TEXT NOT NULL,
    "NAME" TEXT NOT NULL,
    "SOCURRENCY" INTEGER,
    "COUNTRYTYPE" INTEGER,
    "INTCODE" TEXT,
    "INTERCODE" TEXT,
    "EANCODE" TEXT,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("COUNTRY")
);

-- CreateTable
CREATE TABLE "Irsdata" (
    "IRSDATA" INTEGER NOT NULL,
    "CODE" TEXT,
    "NAME" TEXT NOT NULL,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,
    "ADDRESS" TEXT,
    "CITY" TEXT,
    "ZIP" TEXT,
    "PHONE1" TEXT,
    "EMAIL" TEXT,

    CONSTRAINT "Irsdata_pkey" PRIMARY KEY ("IRSDATA")
);

-- CreateTable
CREATE TABLE "TrdCategory" (
    "TRDCATEGORY" INTEGER NOT NULL,
    "CODE" TEXT NOT NULL,
    "NAME" TEXT NOT NULL,
    "VATSTS" INTEGER,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TrdCategory_pkey" PRIMARY KEY ("TRDCATEGORY")
);

-- CreateTable
CREATE TABLE "S1Payment" (
    "PAYMENT" INTEGER NOT NULL,
    "CODE" TEXT NOT NULL,
    "NAME" TEXT NOT NULL,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,
    "MYDATACODE" INTEGER,
    "INSTALMENTS" INTEGER,

    CONSTRAINT "S1Payment_pkey" PRIMARY KEY ("PAYMENT")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "SHIPMENT" INTEGER NOT NULL,
    "CODE" TEXT NOT NULL,
    "NAME" TEXT NOT NULL,
    "INTCODE" TEXT,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("SHIPMENT")
);

-- CreateTable
CREATE TABLE "SoCurrency" (
    "SOCURRENCY" INTEGER NOT NULL,
    "SHORTCUT" TEXT NOT NULL,
    "NAME" TEXT NOT NULL,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,
    "INTERCODE" TEXT,
    "LRATE" DOUBLE PRECISION,

    CONSTRAINT "SoCurrency_pkey" PRIMARY KEY ("SOCURRENCY")
);

-- CreateTable
CREATE TABLE "Series" (
    "SERIES" INTEGER NOT NULL,
    "SODTYPE" INTEGER NOT NULL,
    "CODE" TEXT,
    "NAME" TEXT NOT NULL,
    "ISACTIVE" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("SERIES")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trdr_TRDR_key" ON "Trdr"("TRDR");

-- CreateIndex
CREATE INDEX "Trdr_SODTYPE_ISPROSP_idx" ON "Trdr"("SODTYPE", "ISPROSP");

-- CreateIndex
CREATE INDEX "Trdr_SODTYPE_ISACTIVE_idx" ON "Trdr"("SODTYPE", "ISACTIVE");

-- CreateIndex
CREATE INDEX "Trdr_AFM_idx" ON "Trdr"("AFM");

-- CreateIndex
CREATE INDEX "ArchitectCustomer_trdrId_idx" ON "ArchitectCustomer"("trdrId");

-- CreateIndex
CREATE INDEX "Contact_trdrId_idx" ON "Contact"("trdrId");

-- CreateIndex
CREATE INDEX "Order_trdrId_idx" ON "Order"("trdrId");

-- CreateIndex
CREATE INDEX "User_trdrId_idx" ON "User"("trdrId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectCustomer" ADD CONSTRAINT "ArchitectCustomer_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCache" ADD CONSTRAINT "PriceCache_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
