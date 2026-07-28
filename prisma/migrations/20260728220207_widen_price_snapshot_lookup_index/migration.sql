-- DropIndex
DROP INDEX "PriceSnapshot_cardId_priceType_variant_capturedDate_idx";

-- CreateIndex
CREATE INDEX "PriceSnapshot_cardId_priceType_variant_source_capturedDate_idx" ON "PriceSnapshot"("cardId", "priceType", "variant", "source", "capturedDate");
