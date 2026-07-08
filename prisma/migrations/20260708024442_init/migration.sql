-- CreateEnum
CREATE TYPE "SealedProductType" AS ENUM ('BOOSTER_BOX', 'BOOSTER_PACK', 'ELITE_TRAINER_BOX', 'BUNDLE', 'BLISTER', 'COLLECTION_BOX', 'TIN', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('TCGPLAYER', 'PRICECHARTING');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('MARKET', 'LOW', 'MID', 'HIGH', 'DIRECT_LOW');

-- CreateTable
CREATE TABLE "CardSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT,
    "releaseDate" TIMESTAMP(3),
    "totalCards" INTEGER,
    "pokemonTcgIoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT,
    "supertype" TEXT,
    "subtypes" TEXT[],
    "imageUrl" TEXT,
    "pokemonTcgIoId" TEXT,
    "tcgplayerProductId" TEXT,
    "pricechartingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealedProduct" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "name" TEXT NOT NULL,
    "type" "SealedProductType" NOT NULL,
    "tcgplayerProductId" TEXT,
    "pricechartingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SealedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "cardId" TEXT,
    "sealedProductId" TEXT,
    "source" "PriceSource" NOT NULL,
    "priceType" "PriceType" NOT NULL,
    "condition" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardSet_pokemonTcgIoId_key" ON "CardSet"("pokemonTcgIoId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_pokemonTcgIoId_key" ON "Card"("pokemonTcgIoId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_tcgplayerProductId_key" ON "Card"("tcgplayerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_pricechartingId_key" ON "Card"("pricechartingId");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Card_setId_number_key" ON "Card"("setId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SealedProduct_tcgplayerProductId_key" ON "SealedProduct"("tcgplayerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "SealedProduct_pricechartingId_key" ON "SealedProduct"("pricechartingId");

-- CreateIndex
CREATE INDEX "SealedProduct_name_idx" ON "SealedProduct"("name");

-- CreateIndex
CREATE INDEX "PriceSnapshot_cardId_capturedAt_idx" ON "PriceSnapshot"("cardId", "capturedAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_sealedProductId_capturedAt_idx" ON "PriceSnapshot"("sealedProductId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_cardId_sealedProductId_source_priceType_condi_key" ON "PriceSnapshot"("cardId", "sealedProductId", "source", "priceType", "condition", "capturedDate");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedProduct" ADD CONSTRAINT "SealedProduct_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
