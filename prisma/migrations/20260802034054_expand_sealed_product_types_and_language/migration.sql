-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SealedProductType" ADD VALUE 'PREMIUM_COLLECTION';
ALTER TYPE "SealedProductType" ADD VALUE 'DISPLAY_CASE';
ALTER TYPE "SealedProductType" ADD VALUE 'DECK';
ALTER TYPE "SealedProductType" ADD VALUE 'POSTER_COLLECTION';
ALTER TYPE "SealedProductType" ADD VALUE 'PIN_COLLECTION';
ALTER TYPE "SealedProductType" ADD VALUE 'GIFT_BOX';
ALTER TYPE "SealedProductType" ADD VALUE 'BINDER';
ALTER TYPE "SealedProductType" ADD VALUE 'STARTER_SET';

-- AlterTable
ALTER TABLE "SealedProduct" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'EN',
ADD COLUMN     "tcgplayerGroupId" TEXT;

-- CreateIndex
CREATE INDEX "SealedProduct_type_idx" ON "SealedProduct"("type");

-- CreateIndex
CREATE INDEX "SealedProduct_language_idx" ON "SealedProduct"("language");
