import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { tcgplayerFetch, POKEMON_CATEGORY_ID } from "@/lib/tcgplayer";

// NOTE: TCGplayer's catalog API requires an approved partner API key
// (see lib/tcgplayer.ts). Endpoint shapes below follow TCGplayer API v1.39
// docs (https://docs.tcgplayer.com/) as of writing -- re-verify field names
// against current docs once TCGPLAYER_PUBLIC_KEY/PRIVATE_KEY are obtained.

type TcgGroup = {
  groupId: number;
  name: string;
  abbreviation?: string;
};

type TcgProduct = {
  productId: number;
  name: string;
  groupId: number;
  productTypeName: string; // e.g. "Cards", "Booster Box", "Booster Pack", "Sealed Products"
};

const SEALED_TYPE_MAP: Record<string, string> = {
  "Booster Box": "BOOSTER_BOX",
  "Booster Pack": "BOOSTER_PACK",
  "Elite Trainer Box": "ELITE_TRAINER_BOX",
  Bundle: "BUNDLE",
  Blister: "BLISTER",
  "Collection Box": "COLLECTION_BOX",
  Tin: "TIN",
};

function mapProductType(productTypeName: string): string {
  for (const [key, value] of Object.entries(SEALED_TYPE_MAP)) {
    if (productTypeName.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return "OTHER";
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

async function fetchSealedProductsForGroup(groupId: number): Promise<TcgProduct[]> {
  const products: TcgProduct[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await tcgplayerFetch<{ results: TcgProduct[] }>(
      `/catalog/products?categoryId=${POKEMON_CATEGORY_ID}&groupId=${groupId}&limit=${limit}&offset=${offset}`
    );
    const sealed = res.results.filter((p) => p.productTypeName !== "Cards");
    products.push(...sealed);
    if (res.results.length < limit) break;
    offset += limit;
  }
  return products;
}

async function main() {
  const groups = await fetchAllGroups();
  console.log(`Found ${groups.length} TCGplayer groups (sets) under Pokemon category.`);

  let totalUpserted = 0;

  for (const group of groups) {
    const set = await prisma.cardSet.findFirst({ where: { name: group.name } });
    const sealedProducts = await fetchSealedProductsForGroup(group.groupId);

    for (const product of sealedProducts) {
      await prisma.sealedProduct.upsert({
        where: { tcgplayerProductId: String(product.productId) },
        create: {
          tcgplayerProductId: String(product.productId),
          name: product.name,
          type: mapProductType(product.productTypeName) as never,
          setId: set?.id,
        },
        update: {
          name: product.name,
          type: mapProductType(product.productTypeName) as never,
          setId: set?.id,
        },
      });
      totalUpserted += 1;
    }
  }

  console.log(`Upserted ${totalUpserted} sealed products.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
