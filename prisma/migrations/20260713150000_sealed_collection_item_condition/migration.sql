-- DropIndex
DROP INDEX "CollectionItem_userId_sealedProductId_key";

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_userId_sealedProductId_condition_key" ON "CollectionItem"("userId", "sealedProductId", "condition");
