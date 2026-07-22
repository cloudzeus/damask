-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "b2b" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: οι σημερινοί B2B ρόλοι πάνε στην πύλη (/portal)
UPDATE "Role" SET "b2b" = true WHERE "name" IN ('ARCHITECT', 'CUSTOMER', 'SUPPLIER');
