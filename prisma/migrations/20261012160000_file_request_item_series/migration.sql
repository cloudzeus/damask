-- Σειρές στα αιτήματα δικαιολογητικών (/r/)
ALTER TABLE "FileRequestItem" ADD COLUMN "documentTypeId" TEXT, ADD COLUMN "period" TEXT, ADD COLUMN "parentItemId" TEXT;
CREATE INDEX "FileRequestItem_parentItemId_idx" ON "FileRequestItem"("parentItemId");
