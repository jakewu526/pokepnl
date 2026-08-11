-- CreateTable
CREATE TABLE "CardLatestPrice" (
    "cardId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "source" "PriceSource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardLatestPrice_pkey" PRIMARY KEY ("cardId")
);

-- CreateIndex
CREATE INDEX "CardLatestPrice_price_idx" ON "CardLatestPrice"("price");

-- AddForeignKey
ALTER TABLE "CardLatestPrice" ADD CONSTRAINT "CardLatestPrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
