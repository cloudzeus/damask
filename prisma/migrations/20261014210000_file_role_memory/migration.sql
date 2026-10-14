ALTER TABLE "ApplicationInboxDoc" ADD COLUMN "role" TEXT;
CREATE TABLE "FileRoleExample" (
    "id" TEXT NOT NULL, "pattern" TEXT NOT NULL, "folder" TEXT NOT NULL DEFAULT '', "role" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'AUTO',
    "hits" INTEGER NOT NULL DEFAULT 1, "sample" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FileRoleExample_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileRoleExample_pattern_folder_role_key" ON "FileRoleExample"("pattern", "folder", "role");
CREATE INDEX "FileRoleExample_pattern_idx" ON "FileRoleExample"("pattern");
