import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { tcgplayerFetch, POKEMON_CATEGORY_ID } from "@/lib/tcgplayer";

// Matches TCGplayer "Cards" products to our Card rows. TCGplayer product
// names typically look like "Pikachu - 025/078" or include the card number
// in `extendedData` (field name "Number"); this uses the extended data when
// present and falls back to parsing the trailing "n/nnn" from the name.
// Re-verify field names against https://docs.tcgplayer.com/ once API access
// is available.

type TcgGroup = { groupId: number; name: string };
type TcgCardProduct = {
  productId: number;
  name: string;
  groupId: number;
  productTypeName: string;
  extendedData?: { name: string; value: string }[];
};

function extractNumber(product: TcgCardProduct): string | null {
  const field = product.extendedData?.find((f) => f.name === "Number");
  if (field) return field.value.split("/")[0].trim();

  const match = product.name.match(/(\d+)\/\d+/);
  return match ? match[1] : null;
}

async function fetchAllGroups(): Promise<TcgGroup[]> {
  const groups: TcgGroup[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await tcgplayerFetch<{ results: TcgGroup[] }>(
      `/catalog/categories/${POKEMON_CATEGORY_ID}/groups?limit=${limit}&offset=${offset}`
    );
    groups.push(...res.results);
    if (res.results.length < limit) break;
    offset += limit;
  }
  return groups;
}

async function fetchCardProductsForGroup(groupId: number): Promise<TcgCardProduct[]> {
  const products: TcgCardProduct[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await tcgplayerFetch<{ results: TcgCardProduct[] }>(
      `/catalog/products?categoryId=${POKEMON_CATEGORY_ID}&groupId=${groupId}&productTypes=Cards&getExtendedFields=true&limit=${limit}&offset=${offset}`
    );
    products.push(...res.results);
    if (res.results.length < limit) break;
    offset += limit;
  }
  return products;
}

async function main() {
  const groups = await fetchAllGroups();
  let matched = 0;
  let unmatched = 0;

  for (const group of groups) {
    const set = await prisma.cardSet.findFirst({ where: { name: group.name } });
    if (!set) {
      console.warn(`No matching CardSet for TCGplayer group "${group.name}"`);
      continue;
    }

    const products = await fetchCardProductsForGroup(group.groupId);

    for (const product of products) {
      const number = extractNumber(product);
      if (!number) {
        unmatched += 1;
        continue;
      }

      const card = await prisma.card.findFirst({
        where: { setId: set.id, number },
      });
      if (!card) {
        unmatched += 1;
        continue;
      }

      await prisma.card.update({
        where: { id: card.id },
        data: { tcgplayerProductId: String(product.productId) },
      });
      matched += 1;
    }
  }

  console.log(`Linked ${matched} cards to TCGplayer product IDs (${unmatched} unmatched).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
