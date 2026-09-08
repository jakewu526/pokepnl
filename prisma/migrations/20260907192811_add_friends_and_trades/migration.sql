-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "TradeOfferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'LIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "friendCode" TEXT;

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "status" "TradeOfferStatus" NOT NULL DEFAULT 'PENDING',
    "proposerId" TEXT NOT NULL,
    "proposerItemId" TEXT,
    "proposerQuantity" INTEGER NOT NULL DEFAULT 1,
    "proposerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "recipientId" TEXT NOT NULL,
    "recipientItemId" TEXT,
    "recipientQuantity" INTEGER NOT NULL DEFAULT 1,
    "recipientConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "TradeSource" NOT NULL,
    "givenCardId" TEXT,
    "givenSealedProductId" TEXT,
    "givenCondition" TEXT,
    "givenQuantity" INTEGER NOT NULL,
    "givenItemName" TEXT NOT NULL,
    "receivedCardId" TEXT,
    "receivedSealedProductId" TEXT,
    "receivedCondition" TEXT,
    "receivedQuantity" INTEGER NOT NULL,
    "receivedItemName" TEXT NOT NULL,
    "counterpartyNote" TEXT,
    "counterpartyUserId" TEXT,
    "tradeOfferId" TEXT,
    "tradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "TradeOffer_recipientId_status_idx" ON "TradeOffer"("recipientId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_proposerId_status_idx" ON "TradeOffer"("proposerId", "status");

-- CreateIndex
CREATE INDEX "Trade_userId_tradedAt_idx" ON "Trade"("userId", "tradedAt");

-- CreateIndex
CREATE INDEX "Trade_tradeOfferId_idx" ON "Trade"("tradeOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "User_friendCode_key" ON "User"("friendCode");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_proposerItemId_fkey" FOREIGN KEY ("proposerItemId") REFERENCES "CollectionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_recipientItemId_fkey" FOREIGN KEY ("recipientItemId") REFERENCES "CollectionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_counterpartyUserId_fkey" FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_givenCardId_fkey" FOREIGN KEY ("givenCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_givenSealedProductId_fkey" FOREIGN KEY ("givenSealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_receivedCardId_fkey" FOREIGN KEY ("receivedCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_receivedSealedProductId_fkey" FOREIGN KEY ("receivedSealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

