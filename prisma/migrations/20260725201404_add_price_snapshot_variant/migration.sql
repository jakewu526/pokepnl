-- CreateEnum
CREATE TYPE "PrintVariant" AS ENUM ('NORMAL', 'REVERSE_HOLO');

-- AlterTable
ALTER TABLE "PriceSnapshot" ADD COLUMN "variant" "PrintVariant" NOT NULL DEFAULT 'NORMAL';

-- DropIndex
DROP INDEX "PriceSnapshot_cardId_sealedProductId_source_priceType_condi_key";

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_cardId_sealedProductId_source_priceType_condi_key" ON "PriceSnapshot"("cardId", "sealedProductId", "source", "priceType", "condition", "variant", "capturedDate");
