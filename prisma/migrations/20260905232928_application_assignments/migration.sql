-- CreateTable
CREATE TABLE "ApplicationAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationAssignment_applicationId_idx" ON "ApplicationAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_userId_idx" ON "ApplicationAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAssignment_applicationId_userId_key" ON "ApplicationAssignment"("applicationId", "userId");
