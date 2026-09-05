-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('SUBSCRIBE', 'UNSUBSCRIBE');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('DOUBLE_OPT_IN_OTP', 'PUBLIC_FORM', 'ADMIN', 'IMPORT', 'UNSUBSCRIBE_LINK');

-- CreateTable
CREATE TABLE "NewsletterConsent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "afm" TEXT,
    "trdrId" TEXT,
    "action" "ConsentAction" NOT NULL DEFAULT 'SUBSCRIBE',
    "method" "ConsentMethod" NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentVersion" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "source" TEXT,
    "publicLeadRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterConsent_email_idx" ON "NewsletterConsent"("email");

-- CreateIndex
CREATE INDEX "NewsletterConsent_action_idx" ON "NewsletterConsent"("action");

-- CreateIndex
CREATE INDEX "NewsletterConsent_createdAt_idx" ON "NewsletterConsent"("createdAt");
