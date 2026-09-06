-- CreateTable
CREATE TABLE "ApplicationContact" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationContact_applicationId_idx" ON "ApplicationContact"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationContact_contactId_idx" ON "ApplicationContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationContact_applicationId_contactId_key" ON "ApplicationContact"("applicationId", "contactId");

-- AddForeignKey
ALTER TABLE "ApplicationContact" ADD CONSTRAINT "ApplicationContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationContact" ADD CONSTRAINT "ApplicationContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
