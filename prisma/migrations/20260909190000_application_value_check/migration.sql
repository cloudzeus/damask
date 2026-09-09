-- CreateTable
CREATE TABLE "ApplicationValueCheck" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "selectedYear" INTEGER,
    "selectedValue" DECIMAL(18,2),
    "note" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationValueCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationValueCheck_applicationId_idx" ON "ApplicationValueCheck"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationValueCheck_applicationId_fieldKey_key" ON "ApplicationValueCheck"("applicationId", "fieldKey");

-- AddForeignKey
ALTER TABLE "ApplicationValueCheck" ADD CONSTRAINT "ApplicationValueCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
