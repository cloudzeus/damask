CREATE TABLE "FixedAssetRegister" (
    "id" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "year" INTEGER,
    "items" JSONB NOT NULL,
    "docKey" TEXT,
    "docName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FixedAssetRegister_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FixedAssetRegister_trdrId_idx" ON "FixedAssetRegister"("trdrId");
