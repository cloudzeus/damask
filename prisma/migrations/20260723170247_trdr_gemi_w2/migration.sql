/*
  Warnings:

  - A unique constraint covering the columns `[arGemi]` on the table `Trdr` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('GEMI', 'MANUAL');

-- CreateEnum
CREATE TYPE "TrdrDocumentKind" AS ENUM ('DECISION', 'PUBLICATION', 'OTHER');

-- AlterTable
ALTER TABLE "Trdr" ADD COLUMN     "aadeFirmKind" TEXT,
ADD COLUMN     "aadeStatus" TEXT,
ADD COLUMN     "aadeSyncedAt" TIMESTAMP(3),
ADD COLUMN     "arGemi" TEXT,
ADD COLUMN     "foundingDate" TIMESTAMP(3),
ADD COLUMN     "gemiAutoRegistered" BOOLEAN,
ADD COLUMN     "gemiData" JSONB,
ADD COLUMN     "gemiIsBranch" BOOLEAN,
ADD COLUMN     "gemiLastStatusChange" TIMESTAMP(3),
ADD COLUMN     "gemiObjective" TEXT,
ADD COLUMN     "gemiOffice" TEXT,
ADD COLUMN     "gemiStatus" TEXT,
ADD COLUMN     "gemiSyncedAt" TIMESTAMP(3),
ADD COLUMN     "geocodedAddress" TEXT,
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "regionCode" TEXT;

-- CreateTable
CREATE TABLE "TrdrKad" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeWithoutDots" TEXT,
    "codeAade" TEXT,
    "description" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL DEFAULT 'SECONDARY',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrdrKad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrdrDocument" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'GEMI',
    "docKind" "TrdrDocumentKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "kak" TEXT,
    "assembly" TEXT,
    "summary" TEXT,
    "decisionSubject" TEXT,
    "dateAssemblyDecided" TIMESTAMP(3),
    "dateAnnounced" TIMESTAMP(3),
    "dateRegistrated" TIMESTAMP(3),
    "applicationStatus" TEXT,
    "sourceUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrdrDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalType" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "LegalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GemiOfficeRef" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "url" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "GemiOfficeRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyStatusRef" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "isActive" BOOLEAN,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "CompanyStatusRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrefectureRef" (
    "id" TEXT NOT NULL,
    "descr" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "PrefectureRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalityRef" (
    "id" TEXT NOT NULL,
    "prefectureId" TEXT,
    "descr" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "MunicipalityRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrdrKad_trdrId_idx" ON "TrdrKad"("trdrId");

-- CreateIndex
CREATE INDEX "TrdrKad_codeWithoutDots_idx" ON "TrdrKad"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "TrdrKad_codeAade_idx" ON "TrdrKad"("codeAade");

-- CreateIndex
CREATE UNIQUE INDEX "TrdrKad_trdrId_code_key" ON "TrdrKad"("trdrId", "code");

-- CreateIndex
CREATE INDEX "TrdrDocument_trdrId_idx" ON "TrdrDocument"("trdrId");

-- CreateIndex
CREATE INDEX "TrdrDocument_kak_idx" ON "TrdrDocument"("kak");

-- CreateIndex
CREATE UNIQUE INDEX "TrdrDocument_trdrId_kak_key" ON "TrdrDocument"("trdrId", "kak");

-- CreateIndex
CREATE INDEX "MunicipalityRef_prefectureId_idx" ON "MunicipalityRef"("prefectureId");

-- CreateIndex
CREATE UNIQUE INDEX "Trdr_arGemi_key" ON "Trdr"("arGemi");

-- CreateIndex
CREATE INDEX "Trdr_regionCode_idx" ON "Trdr"("regionCode");

-- AddForeignKey
ALTER TABLE "Trdr" ADD CONSTRAINT "Trdr_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrKad" ADD CONSTRAINT "TrdrKad_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrdrDocument" ADD CONSTRAINT "TrdrDocument_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalityRef" ADD CONSTRAINT "MunicipalityRef_prefectureId_fkey" FOREIGN KEY ("prefectureId") REFERENCES "PrefectureRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
