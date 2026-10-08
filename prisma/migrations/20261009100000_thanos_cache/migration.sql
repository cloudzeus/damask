CREATE TABLE "ThanosAnswerCache" (
  "key" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "reply" TEXT NOT NULL,
  "model" TEXT,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThanosAnswerCache_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "ThanosAnswerCache_expiresAt_idx" ON "ThanosAnswerCache"("expiresAt");

CREATE TABLE "ThanosTtsCache" (
  "hash" TEXT NOT NULL,
  "audio" BYTEA NOT NULL,
  "chars" INTEGER NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThanosTtsCache_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX "ThanosTtsCache_lastHitAt_idx" ON "ThanosTtsCache"("lastHitAt");
