-- CreateTable
CREATE TABLE "ProgramRequiredForm" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramRequiredForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramRequiredForm_programId_idx" ON "ProgramRequiredForm"("programId");

-- CreateIndex
CREATE INDEX "ProgramRequiredForm_templateId_idx" ON "ProgramRequiredForm"("templateId");

-- AddForeignKey
ALTER TABLE "ProgramRequiredForm" ADD CONSTRAINT "ProgramRequiredForm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRequiredForm" ADD CONSTRAINT "ProgramRequiredForm_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
