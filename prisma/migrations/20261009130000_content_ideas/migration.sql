CREATE TABLE "ContentIdea" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "programId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "targetKeyword" TEXT,
  "score" INTEGER NOT NULL DEFAULT 50,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "error" TEXT,
  "postId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentIdea_sourceUrl_key" ON "ContentIdea"("sourceUrl");
CREATE INDEX "ContentIdea_status_score_idx" ON "ContentIdea"("status", "score");
