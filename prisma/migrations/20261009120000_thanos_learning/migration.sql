CREATE TABLE "ThanosTurn" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "conversationId" TEXT,
  "question" TEXT NOT NULL,
  "reply" TEXT NOT NULL,
  "toolsUsed" TEXT[],
  "programId" TEXT,
  "model" TEXT,
  "cached" BOOLEAN NOT NULL DEFAULT false,
  "rating" INTEGER,
  "note" TEXT,
  "distilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThanosTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThanosTurn_createdAt_idx" ON "ThanosTurn"("createdAt");
CREATE INDEX "ThanosTurn_distilledAt_idx" ON "ThanosTurn"("distilledAt");

CREATE TABLE "ThanosLesson" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "programId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
  "source" TEXT NOT NULL,
  "sourceTurnId" TEXT,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "embedding" vector(768),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThanosLesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThanosLesson_status_idx" ON "ThanosLesson"("status");
CREATE INDEX "ThanosLesson_programId_idx" ON "ThanosLesson"("programId");
