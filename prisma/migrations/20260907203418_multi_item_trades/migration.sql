-- CreateEnum
CREATE TYPE "TradeOfferSide" AS ENUM ('PROPOSER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('GIVEN', 'RECEIVED');

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_givenCardId_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_givenSealedProductId_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_receivedCardId_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_receivedSealedProductId_fkey";

-- DropForeignKey
ALTER TABLE "TradeOffer" DROP CONSTRAINT "TradeOffer_proposerItemId_fkey";

-- DropForeignKey
ALTER TABLE "TradeOffer" DROP CONSTRAINT "TradeOffer_recipientItemId_fkey";

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "givenCardId",
DROP COLUMN "givenCondition",
DROP COLUMN "givenItemName",
DROP COLUMN "givenQuantity",
DROP COLUMN "givenSealedProductId",
DROP COLUMN "receivedCardId",
DROP COLUMN "receivedCondition",
DROP COLUMN "receivedItemName",
DROP COLUMN "receivedQuantity",
DROP COLUMN "receivedSealedProductId",
ADD COLUMN     "cardId" TEXT,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "direction" "TradeDirection" NOT NULL,
ADD COLUMN     "groupId" TEXT NOT NULL,
ADD COLUMN     "itemName" TEXT NOT NULL,
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "sealedProductId" TEXT;

-- AlterTable
ALTER TABLE "TradeOffer" DROP COLUMN "proposerItemId",
DROP COLUMN "proposerQuantity",
DROP COLUMN "recipientItemId",
DROP COLUMN "recipientQuantity";

-- CreateTable
CREATE TABLE "TradeOfferItem" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "side" "TradeOfferSide" NOT NULL,
    "collectionItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOfferItem_tradeOfferId_side_idx" ON "TradeOfferItem"("tradeOfferId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOfferItem_tradeOfferId_side_collectionItemId_key" ON "TradeOfferItem"("tradeOfferId", "side", "collectionItemId");

-- CreateIndex
CREATE INDEX "Trade_userId_groupId_idx" ON "Trade"("userId", "groupId");

-- AddForeignKey
ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_collectionItemId_fkey" FOREIGN KEY ("collectionItemId") REFERENCES "CollectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

