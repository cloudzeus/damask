-- C2g T1b: restructure ProgramDeliverableTemplate/ExpenseDeliverable from a
-- flat (phase, mandatory, onSiteVerification, status, files, dependencies)
-- shape into two levels: Παραδοτέο (group, spans phases) -> Tasks (per
-- phase, each closes with >= minFiles files).
--
-- IMPORTANT — data preservation on a fresh-chain (prod) run: the previously
-- committed migration 20260723130900_program_pm_c2g_absorb inserts
-- old-style ExpenseDeliverable rows (with phase/status/mandatory/
-- onSiteVerification) and DeliverableFile rows keyed by the old
-- deliverableId BEFORE this migration runs. This migration therefore, in
-- order:
--   1) creates the new ProgramDeliverableTask / ExpenseDeliverableTask
--      tables while the old columns on ExpenseDeliverable still exist,
--   2) copies every existing ExpenseDeliverable row into exactly one
--      ExpenseDeliverableTask row (1:1), preserving phase/name/mandatory/
--      onSiteVerification/status/acceptedById/acceptedAt/notes/order,
--   3) repoints DeliverableFile / DeliverableDependency / DocumentRequest
--      to the newly created tasks (matched via the 1:1 deliverableId link),
--   4) only then drops the now-superseded columns/FKs/indexes from
--      ExpenseDeliverable and ProgramDeliverableTemplate.
-- In dev this is a no-op data-wise (0 absorbed rows today), but the SQL is
-- correct for a fresh database that runs the full migration chain.

-- ============================================================
-- 1) CreateTable: new template-level task + instance-level task
-- ============================================================

-- CreateTable
CREATE TABLE "ProgramDeliverableTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "phase" "DeliverablePhase" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onSiteVerification" BOOLEAN NOT NULL DEFAULT false,
    "minFiles" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDeliverableTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseDeliverableTask" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "taskTemplateId" TEXT,
    "phase" "DeliverablePhase" NOT NULL,
    "name" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onSiteVerification" BOOLEAN NOT NULL DEFAULT false,
    "minFiles" INTEGER NOT NULL DEFAULT 1,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDeliverableTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramDeliverableTask_templateId_idx" ON "ProgramDeliverableTask"("templateId");

-- CreateIndex
CREATE INDEX "ProgramDeliverableTask_templateId_phase_idx" ON "ProgramDeliverableTask"("templateId", "phase");

-- CreateIndex
CREATE INDEX "ExpenseDeliverableTask_deliverableId_idx" ON "ExpenseDeliverableTask"("deliverableId");

-- CreateIndex
CREATE INDEX "ExpenseDeliverableTask_deliverableId_phase_idx" ON "ExpenseDeliverableTask"("deliverableId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDeliverableTask_deliverableId_taskTemplateId_key" ON "ExpenseDeliverableTask"("deliverableId", "taskTemplateId");

-- AddForeignKey
ALTER TABLE "ProgramDeliverableTask" ADD CONSTRAINT "ProgramDeliverableTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgramDeliverableTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeliverableTask" ADD CONSTRAINT "ExpenseDeliverableTask_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "ExpenseDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeliverableTask" ADD CONSTRAINT "ExpenseDeliverableTask_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "ProgramDeliverableTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 2) Data preservation: one ExpenseDeliverableTask per existing
--    ExpenseDeliverable row (1:1), copying the old per-row attributes.
--    No ProgramDeliverableTask exists yet for these (they predate the
--    two-level template), so taskTemplateId is NULL.
-- ============================================================

INSERT INTO "ExpenseDeliverableTask"
  (id, "deliverableId", "taskTemplateId", phase, name, mandatory, "onSiteVerification", "minFiles", status, "acceptedById", "acceptedAt", notes, "order", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, ed.id, NULL, ed.phase, ed.name, ed.mandatory, ed."onSiteVerification", 1, ed.status, ed."acceptedById", ed."acceptedAt", ed.notes, ed."order", ed."createdAt", ed."updatedAt"
FROM "ExpenseDeliverable" ed;

-- ============================================================
-- 3) Repoint DeliverableFile (deliverableId -> taskId), DeliverableDependency
--    (dependentId/prerequisiteId now reference tasks), and DocumentRequest
--    (deliverableId -> deliverableTaskId) to the tasks created above, using
--    the 1:1 ExpenseDeliverableTask.deliverableId link to find the match.
-- ============================================================

-- DeliverableFile: add taskId, backfill, then drop the old FK/index/column
-- DropForeignKey
ALTER TABLE "DeliverableFile" DROP CONSTRAINT "DeliverableFile_deliverableId_fkey";

-- DropIndex
DROP INDEX "DeliverableFile_deliverableId_idx";

-- AlterTable
ALTER TABLE "DeliverableFile" ADD COLUMN "taskId" TEXT;

UPDATE "DeliverableFile" f
SET "taskId" = t.id
FROM "ExpenseDeliverableTask" t
WHERE t."deliverableId" = f."deliverableId";

ALTER TABLE "DeliverableFile" ALTER COLUMN "taskId" SET NOT NULL;
ALTER TABLE "DeliverableFile" DROP COLUMN "deliverableId";

-- CreateIndex
CREATE INDEX "DeliverableFile_taskId_idx" ON "DeliverableFile"("taskId");

-- AddForeignKey
ALTER TABLE "DeliverableFile" ADD CONSTRAINT "DeliverableFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExpenseDeliverableTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DeliverableDependency: drop old FKs (pointed at ExpenseDeliverable), remap
-- the id values from the old ExpenseDeliverable.id to the new task id, then
-- add the new FKs (pointing at ExpenseDeliverableTask). Column names are
-- unchanged (dependentId/prerequisiteId), only their target table changes.
-- DropForeignKey
ALTER TABLE "DeliverableDependency" DROP CONSTRAINT "DeliverableDependency_dependentId_fkey";

-- DropForeignKey
ALTER TABLE "DeliverableDependency" DROP CONSTRAINT "DeliverableDependency_prerequisiteId_fkey";

UPDATE "DeliverableDependency" d
SET "dependentId" = t.id
FROM "ExpenseDeliverableTask" t
WHERE t."deliverableId" = d."dependentId";

UPDATE "DeliverableDependency" d
SET "prerequisiteId" = t.id
FROM "ExpenseDeliverableTask" t
WHERE t."deliverableId" = d."prerequisiteId";

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "ExpenseDeliverableTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "ExpenseDeliverableTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DocumentRequest: rename deliverableId -> deliverableTaskId (semantically
-- now targets a task; no code references it yet — T9 not built), remap any
-- populated values via the same 1:1 link.
-- DropForeignKey
ALTER TABLE "DocumentRequest" DROP CONSTRAINT "DocumentRequest_deliverableId_fkey";

-- DropIndex
DROP INDEX "DocumentRequest_deliverableId_idx";

-- AlterTable
ALTER TABLE "DocumentRequest" ADD COLUMN "deliverableTaskId" TEXT;

UPDATE "DocumentRequest" dr
SET "deliverableTaskId" = t.id
FROM "ExpenseDeliverableTask" t
WHERE t."deliverableId" = dr."deliverableId";

ALTER TABLE "DocumentRequest" DROP COLUMN "deliverableId";

-- CreateIndex
CREATE INDEX "DocumentRequest_deliverableTaskId_idx" ON "DocumentRequest"("deliverableTaskId");

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_deliverableTaskId_fkey" FOREIGN KEY ("deliverableTaskId") REFERENCES "ExpenseDeliverableTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4) Now that every row/reference has been carried over to the task level,
--    drop the superseded columns/indexes from the two group-level models.
-- ============================================================

-- DropIndex
DROP INDEX "ExpenseDeliverable_applicationId_phase_idx";

-- AlterTable
ALTER TABLE "ExpenseDeliverable" DROP COLUMN "acceptedAt",
DROP COLUMN "acceptedById",
DROP COLUMN "mandatory",
DROP COLUMN "onSiteVerification",
DROP COLUMN "phase",
DROP COLUMN "status";

-- DropIndex
DROP INDEX "ProgramDeliverableTemplate_programId_phase_idx";

-- AlterTable
ALTER TABLE "ProgramDeliverableTemplate" DROP COLUMN "mandatory",
DROP COLUMN "onSiteVerification",
DROP COLUMN "phase";
