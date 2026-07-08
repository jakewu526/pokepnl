import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const [sets, cards, sealedProducts, snapshots, distinctDays] = await Promise.all([
    prisma.cardSet.count(),
    prisma.card.count(),
    prisma.sealedProduct.count(),
    prisma.priceSnapshot.count(),
    prisma.priceSnapshot.findMany({
      distinct: ["capturedDate"],
      select: { capturedDate: true },
    }),
  ]);

  console.log("Row counts:");
  console.log(`  CardSet:        ${sets}`);
  console.log(`  Card:           ${cards}`);
  console.log(`  SealedProduct:  ${sealedProducts}`);
  console.log(`  PriceSnapshot:  ${snapshots}`);
  console.log(`  Distinct price-capture days: ${distinctDays.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
