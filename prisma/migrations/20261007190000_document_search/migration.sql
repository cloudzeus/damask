CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "DocumentSearch" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tags" TEXT[],
    "content" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trdrId" TEXT,
    "trdrName" TEXT,
    "docType" TEXT,
    "programTitle" TEXT,
    "year" INTEGER,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(768),
    "embeddedHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentSearch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSearch_key_key" ON "DocumentSearch"("key");
CREATE INDEX "DocumentSearch_trdrId_idx" ON "DocumentSearch"("trdrId");
CREATE INDEX "DocumentSearch_category_idx" ON "DocumentSearch"("category");
-- Σημασιολογική αναζήτηση (cosine) & αναζήτηση κειμένου (trigram)
CREATE INDEX "DocumentSearch_embedding_hnsw" ON "DocumentSearch" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "DocumentSearch_searchText_trgm" ON "DocumentSearch" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX "DocumentSearch_tags_gin" ON "DocumentSearch" USING gin ("tags");
