-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "FileRequestStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileRequestItemStatus" AS ENUM ('PENDING', 'UPLOADED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "trdrId" TEXT,
    "programId" TEXT,
    "applicationId" TEXT,
    "obligationId" TEXT,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "snippet" TEXT,
    "mailgunId" TEXT,
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentById" TEXT,
    "trdrId" TEXT,
    "programId" TEXT,
    "applicationId" TEXT,
    "obligationId" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "email" TEXT,
    "status" "FileRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "trdrId" TEXT NOT NULL,
    "programId" TEXT,
    "applicationId" TEXT,
    "obligationId" TEXT,
    "createdById" TEXT,
    "emailThreadId" TEXT,
    "completedAt" TIMESTAMP(3),
    "customerNotifiedAt" TIMESTAMP(3),
    "staffNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileRequestItem" (
    "id" TEXT NOT NULL,
    "fileRequestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "FileRequestItemStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "mediaAssetId" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_token_key" ON "EmailThread"("token");

-- CreateIndex
CREATE INDEX "EmailThread_trdrId_idx" ON "EmailThread"("trdrId");

-- CreateIndex
CREATE INDEX "EmailThread_programId_idx" ON "EmailThread"("programId");

-- CreateIndex
CREATE INDEX "EmailThread_applicationId_idx" ON "EmailThread"("applicationId");

-- CreateIndex
CREATE INDEX "EmailThread_obligationId_idx" ON "EmailThread"("obligationId");

-- CreateIndex
CREATE INDEX "EmailThread_createdById_idx" ON "EmailThread"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_messageId_key" ON "EmailMessage"("messageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_idx" ON "EmailMessage"("direction");

-- CreateIndex
CREATE INDEX "EmailMessage_status_idx" ON "EmailMessage"("status");

-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_trdrId_idx" ON "EmailMessage"("trdrId");

-- CreateIndex
CREATE UNIQUE INDEX "FileRequest_tokenHash_key" ON "FileRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "FileRequest_trdrId_idx" ON "FileRequest"("trdrId");

-- CreateIndex
CREATE INDEX "FileRequest_programId_idx" ON "FileRequest"("programId");

-- CreateIndex
CREATE INDEX "FileRequest_applicationId_idx" ON "FileRequest"("applicationId");

-- CreateIndex
CREATE INDEX "FileRequest_status_idx" ON "FileRequest"("status");

-- CreateIndex
CREATE INDEX "FileRequest_expiresAt_idx" ON "FileRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "FileRequestItem_fileRequestId_idx" ON "FileRequestItem"("fileRequestId");

-- CreateIndex
CREATE INDEX "FileRequestItem_status_idx" ON "FileRequestItem"("status");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRequestItem" ADD CONSTRAINT "FileRequestItem_fileRequestId_fkey" FOREIGN KEY ("fileRequestId") REFERENCES "FileRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
