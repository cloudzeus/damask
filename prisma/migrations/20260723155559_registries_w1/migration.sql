-- CreateEnum
CREATE TYPE "KadLicenseType" AS ENUM ('OPERATING_LICENSE');

-- CreateTable
CREATE TABLE "Region" (
    "code" TEXT NOT NULL,
    "nameEL" TEXT NOT NULL,
    "nameEN" TEXT,
    "level" INTEGER NOT NULL,
    "parentCode" TEXT,
    "path" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "KadCode" (
    "code" TEXT NOT NULL,
    "codeWithoutDots" VARCHAR(10),
    "description" TEXT NOT NULL,
    "title" TEXT,
    "level" INTEGER,
    "sector" VARCHAR(3),
    "sectorLetter" VARCHAR(3),
    "parentCode" TEXT,
    "path" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KadCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "KadLicenseRequirement" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "licenseType" "KadLicenseType" NOT NULL DEFAULT 'OPERATING_LICENSE',
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "sourceParentCode" VARCHAR(20),
    "source" TEXT NOT NULL DEFAULT 'NF BUSNESS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KadLicenseRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KadImportLog" (
    "id" SERIAL NOT NULL,
    "totalCodes" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceVersion" TEXT NOT NULL DEFAULT '2026',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,

    CONSTRAINT "KadImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Region_parentCode_idx" ON "Region"("parentCode");

-- CreateIndex
CREATE INDEX "Region_level_idx" ON "Region"("level");

-- CreateIndex
CREATE INDEX "Region_nameEL_idx" ON "Region"("nameEL");

-- CreateIndex
CREATE UNIQUE INDEX "KadCode_codeWithoutDots_key" ON "KadCode"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "KadCode_title_idx" ON "KadCode"("title");

-- CreateIndex
CREATE INDEX "KadCode_description_idx" ON "KadCode"("description");

-- CreateIndex
CREATE INDEX "KadCode_parentCode_idx" ON "KadCode"("parentCode");

-- CreateIndex
CREATE INDEX "KadCode_level_idx" ON "KadCode"("level");

-- CreateIndex
CREATE INDEX "KadCode_sectorLetter_idx" ON "KadCode"("sectorLetter");

-- CreateIndex
CREATE INDEX "KadCode_codeWithoutDots_idx" ON "KadCode"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_licenseType_idx" ON "KadLicenseRequirement"("licenseType");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_inherited_idx" ON "KadLicenseRequirement"("inherited");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_sourceParentCode_idx" ON "KadLicenseRequirement"("sourceParentCode");

-- CreateIndex
CREATE UNIQUE INDEX "KadLicenseRequirement_code_licenseType_key" ON "KadLicenseRequirement"("code", "licenseType");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KadCode" ADD CONSTRAINT "KadCode_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "KadCode"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KadLicenseRequirement" ADD CONSTRAINT "KadLicenseRequirement_code_fkey" FOREIGN KEY ("code") REFERENCES "KadCode"("code") ON DELETE CASCADE ON UPDATE CASCADE;
