/*
  Warnings:

  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_groupId_fkey";

-- DropTable
DROP TABLE "Group";

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "s1Id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_s1Id_key" ON "ProductGroup"("s1Id");

-- CreateIndex
CREATE INDEX "ArchitectCustomer_customerId_idx" ON "ArchitectCustomer"("customerId");

-- CreateIndex
CREATE INDEX "CommissionEntry_architectId_idx" ON "CommissionEntry"("architectId");

-- CreateIndex
CREATE INDEX "Contact_customerId_idx" ON "Contact"("customerId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE INDEX "OrderLine_containerId_idx" ON "OrderLine"("containerId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_groupId_idx" ON "Product"("groupId");

-- CreateIndex
CREATE INDEX "Product_subgroupId_idx" ON "Product"("subgroupId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_customerId_idx" ON "User"("customerId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
