-- CreateEnum
CREATE TYPE "ApplicationLifecycle" AS ENUM ('POTENTIAL', 'SUBMITTING', 'IMPLEMENTATION', 'MODIFICATIONS', 'PAYMENT');

-- AlterEnum
ALTER TYPE "ProgramLeadStatus" ADD VALUE 'SAVED';

-- AlterTable
ALTER TABLE "ProgramApplication" ADD COLUMN     "eligibilitySnapshot" JSONB,
ADD COLUMN     "lifecycle" "ApplicationLifecycle" NOT NULL DEFAULT 'POTENTIAL';

-- AlterTable
ALTER TABLE "ProgramLead" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "tokenHash" DROP NOT NULL;
