-- AlterEnum
ALTER TYPE "PriceSource" ADD VALUE 'CARDMARKET';
ALTER TYPE "PriceSource" ADD VALUE 'EBAY';

-- CreateIndex
CREATE UNIQUE INDEX "SealedProduct_setId_name_key" ON "SealedProduct"("setId", "name");
