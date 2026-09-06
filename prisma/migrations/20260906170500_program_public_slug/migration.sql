-- Program public SEO slug
ALTER TABLE "Program" ADD COLUMN "publicSlug" TEXT;
CREATE UNIQUE INDEX "Program_publicSlug_key" ON "Program"("publicSlug");
