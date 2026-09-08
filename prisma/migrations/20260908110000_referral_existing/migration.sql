-- Referral company: already-customer check (ΑΦΜ uniqueness)
ALTER TABLE "ReferralCompany" ADD COLUMN "existingTrdrId" TEXT;
ALTER TABLE "ReferralCompany" ADD COLUMN "existingIsCustomer" BOOLEAN NOT NULL DEFAULT false;
