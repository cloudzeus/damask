/*
  Warnings:

  - Added the required column `name` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'FILE';

-- AlterTable
-- "name" is added nullable first, backfilled below, then locked to NOT NULL —
-- so this migration is safe to run against a MediaAsset table that already
-- has rows (existing product/demo uploads keep their data, never dropped).
ALTER TABLE "MediaAsset" ADD COLUMN     "alt" TEXT,
ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "size" INTEGER,
ALTER COLUMN "productId" DROP NOT NULL;

-- Backfill "name" for pre-existing rows from the last path segment of cdnUrl
-- (e.g. https://cdn.example.com/products/1/foo-abc123.webp -> "foo-abc123.webp"),
-- falling back to a generic label on the rare chance that resolves empty.
UPDATE "MediaAsset"
SET "name" = COALESCE(NULLIF(regexp_replace(regexp_replace("cdnUrl", '\?.*$', ''), '^.*/', ''), ''), 'media')
WHERE "name" IS NULL;

-- AlterTable
ALTER TABLE "MediaAsset" ALTER COLUMN "name" SET NOT NULL;

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFolder_parentId_name_key" ON "MediaFolder"("parentId", "name");

-- CreateIndex
CREATE INDEX "MediaAsset_folderId_idx" ON "MediaAsset"("folderId");

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
