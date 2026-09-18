-- Πολλαπλές επαφές ανά εταιρία-παραπομπής (ReferrerContact).
CREATE TABLE "ReferrerContact" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferrerContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferrerContact_referrerId_idx" ON "ReferrerContact"("referrerId");
ALTER TABLE "ReferrerContact"
  ADD CONSTRAINT "ReferrerContact_referrerId_fkey"
  FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
