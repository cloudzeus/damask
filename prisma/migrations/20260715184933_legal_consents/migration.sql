-- CreateTable
CREATE TABLE "LegalPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalPageTranslation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "machineTranslated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LegalPageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "browser" TEXT,
    "locale" TEXT,
    "choices" JSONB NOT NULL,
    "policyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalPage_slug_key" ON "LegalPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LegalPageTranslation_pageId_locale_key" ON "LegalPageTranslation"("pageId", "locale");

-- CreateIndex
CREATE INDEX "ConsentLog_createdAt_idx" ON "ConsentLog"("createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_visitorId_idx" ON "ConsentLog"("visitorId");

-- AddForeignKey
ALTER TABLE "LegalPageTranslation" ADD CONSTRAINT "LegalPageTranslation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "LegalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
