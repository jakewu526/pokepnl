-- CreateTable
CREATE TABLE "PurchaseLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "sealedProductId" TEXT,
    "condition" TEXT,
    "quantity" INTEGER NOT NULL,
    "costPerUnit" DECIMAL(10,2),
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseLot_userId_cardId_condition_idx" ON "PurchaseLot"("userId", "cardId", "condition");

-- CreateIndex
CREATE INDEX "PurchaseLot_userId_sealedProductId_condition_idx" ON "PurchaseLot"("userId", "sealedProductId", "condition");

-- AddForeignKey
ALTER TABLE "PurchaseLot" ADD CONSTRAINT "PurchaseLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLot" ADD CONSTRAINT "PurchaseLot_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLot" ADD CONSTRAINT "PurchaseLot_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
