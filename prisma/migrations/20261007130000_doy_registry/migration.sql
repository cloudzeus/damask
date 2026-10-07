-- CreateTable
CREATE TABLE "DoyRegistry" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoyRegistry_pkey" PRIMARY KEY ("code")
);
