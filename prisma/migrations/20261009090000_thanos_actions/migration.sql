CREATE TABLE "ThanosAction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt" TIMESTAMP(3),
  CONSTRAINT "ThanosAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThanosAction_userId_createdAt_idx" ON "ThanosAction"("userId", "createdAt");
