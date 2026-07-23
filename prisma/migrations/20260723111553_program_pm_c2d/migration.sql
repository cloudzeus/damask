-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('PENDING', 'UPLOADED', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "obligationId" TEXT,
    "trdrId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "uploadedDocumentId" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "trdrId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastAccessAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequest_tokenHash_key" ON "DocumentRequest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequest_uploadedDocumentId_key" ON "DocumentRequest"("uploadedDocumentId");

-- CreateIndex
CREATE INDEX "DocumentRequest_applicationId_idx" ON "DocumentRequest"("applicationId");

-- CreateIndex
CREATE INDEX "DocumentRequest_trdrId_idx" ON "DocumentRequest"("trdrId");

-- CreateIndex
CREATE INDEX "DocumentRequest_status_idx" ON "DocumentRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalToken_tokenHash_key" ON "PortalToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalToken_trdrId_idx" ON "PortalToken"("trdrId");

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ApplicationObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_uploadedDocumentId_fkey" FOREIGN KEY ("uploadedDocumentId") REFERENCES "ApplicationDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalToken" ADD CONSTRAINT "PortalToken_trdrId_fkey" FOREIGN KEY ("trdrId") REFERENCES "Trdr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
