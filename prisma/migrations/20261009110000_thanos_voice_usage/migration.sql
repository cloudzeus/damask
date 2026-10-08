CREATE TABLE "ThanosVoiceUsage" (
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "ThanosVoiceUsage_pkey" PRIMARY KEY ("userId", "day")
);
