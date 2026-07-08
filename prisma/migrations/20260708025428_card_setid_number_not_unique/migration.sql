-- DropIndex
DROP INDEX "Card_setId_number_key";

-- CreateIndex
CREATE INDEX "Card_setId_number_idx" ON "Card"("setId", "number");
