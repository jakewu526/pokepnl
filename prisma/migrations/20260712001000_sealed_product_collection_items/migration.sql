-- DropForeignKey
ALTER TABLE "CollectionItem" DROP CONSTRAINT "CollectionItem_cardId_fkey";

-- AlterTable
ALTER TABLE "CollectionItem" ADD COLUMN     "sealedProductId" TEXT,
ALTER COLUMN "cardId" DROP NOT NULL,
ALTER COLUMN "condition" DROP NOT NULL,
ALTER COLUMN "condition" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_userId_sealedProductId_key" ON "CollectionItem"("userId", "sealedProductId");

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
