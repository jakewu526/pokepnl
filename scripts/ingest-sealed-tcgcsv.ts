import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { capturePriceSnapshot } from "@/lib/price-snapshot";
import { tightNormalize, setNameKeys } from "@/lib/pricecharting-api";
import {
  fetchGroups,
  fetchProducts,
  fetchPrices,
  isCardProduct,
  classifySealedType,
  productImageUrl,
  POKEMON_EN_CATEGORY,
  POKEMON_JP_CATEGORY,
  type TcgGroup,
  type TcgProduct,
  type TcgPrice,
} from "@/lib/tcgcsv";

// Primary sealed-product ingestion. TCGplayer's catalog (via the keyless
// tcgcsv.com mirror) carries far more sealed product than PriceCharting's
// bulk guide and ships a real image plus a market price for nearly all of it.
// ingest-sealed-products-pricecharting.ts still runs afterwards to attach
// price history and to add the products TCGplayer doesn't list (vintage
// Topps, promo-console oddities).

const CONCURRENCY = 6;

type Stats = {
  groups: number;
  sealed: number;
  created: number;
  updated: number;
  adopted: number;
  renamed: number;
  skipped: number;
  snapshots: number;
  newSets: number;
};

// tcgcsv group names carry a set code prefix our CardSet names don't have
// ("SV07: Stellar Crown", "SM - Ultra Prism", "sm1+: Enhanced Expansion
// Pack"). Stripping it is what lets an existing set be reused instead of
// spawning a near-duplicate.
function cleanGroupName(name: string): string {
  // The code can end in an upper- or lower-case letter ("SV11B: Black Bolt",
  // "sm1+: Enhanced Expansion Pack"), so the trailing class has to allow both.
  return name.replace(/^[A-Za-z]{1,6}[0-9]*[A-Za-z+]*\s*[:\-]\s*/, "").trim() || name.trim();
}

type SetIndex = Map<string, string>;

async function buildSetIndex(): Promise<SetIndex> {
  const sets = await prisma.cardSet.findMany({
    select: { id: true, name: true, _count: { select: { cards: true } } },
  });
  const index: SetIndex = new Map();
  // Card-bearing sets are indexed last so they win any key collision with a
  // previously-created sealed-only set -- sealed product should attach to the
  // real set, not to a stray duplicate.
  for (const s of [...sets].sort((a, b) => a._count.cards - b._count.cards)) {
    for (const key of setNameKeys(s.name)) index.set(key, s.id);
  }
  return index;
}

async function resolveSet(
  index: SetIndex,
  group: TcgGroup,
  language: string,
  stats: Stats,
  dryRun: boolean
): Promise<{ id: string | null; name: string }> {
  const base = cleanGroupName(group.name);
  const name = language === "JA" ? `Japanese ${base}` : base;

  // Try the language-qualified name first, then the bare one -- a Japanese
  // group may already exist as a PriceCharting-created "Japanese X" set, and
  // if not, the English set of the same name must not be reused for it.
  const existing = index.get(tightNormalize(name));
  if (existing) return { id: existing, name };

  if (dryRun) return { id: null, name };

  const created = await prisma.cardSet.create({ data: { name } });
  index.set(tightNormalize(name), created.id);
  stats.newSets += 1;
  return { id: created.id, name };
}

// Prefer the "Normal" print row; sealed product occasionally carries a single
// unnamed subtype instead, so fall back to whatever the group returned.
function pickPrice(prices: TcgPrice[]): TcgPrice | undefined {
  return prices.find((p) => p.subTypeName === "Normal") ?? prices[0];
}

async function upsertProduct(
  product: TcgProduct,
  type: string,
  setId: string,
  language: string,
  stats: Stats
): Promise<string | null> {
  const tcgId = String(product.productId);
  const imageUrl = productImageUrl(product);
  const data = {
    name: product.name,
    type: type as never,
    imageUrl,
    setId,
    language,
    tcgplayerGroupId: String(product.groupId),
  };

  const byTcgId = await prisma.sealedProduct.findUnique({ where: { tcgplayerProductId: tcgId } });
  if (byTcgId) {
    await prisma.sealedProduct.update({ where: { id: byTcgId.id }, data });
    stats.updated += 1;
    return byTcgId.id;
  }

  // A PriceCharting run may already have created this product under the same
  // (setId, name). Adopting that row -- rather than creating a second one --
  // is what keeps the two sources from double-listing every product, and
  // preserves any collection/transaction rows already pointing at it.
  const byName = await prisma.sealedProduct.findFirst({ where: { setId, name: product.name } });
  if (byName) {
    if (byName.tcgplayerProductId && byName.tcgplayerProductId !== tcgId) {
      // Genuinely different products colliding on name within one set --
      // disambiguate rather than clobber the incumbent.
      const unique = `${product.name} (${tcgId})`;
      await prisma.sealedProduct.create({
        data: { ...data, name: unique, tcgplayerProductId: tcgId },
      });
      stats.renamed += 1;
      stats.created += 1;
      return null;
    }
    await prisma.sealedProduct.update({
      where: { id: byName.id },
      data: { ...data, tcgplayerProductId: tcgId },
    });
    stats.adopted += 1;
    return byName.id;
  }

  const created = await prisma.sealedProduct.create({
    data: { ...data, tcgplayerProductId: tcgId },
  });
  stats.created += 1;
  return created.id;
}

async function writePrices(productId: string, price: TcgPrice, stats: Stats): Promise<void> {
  const tiers: [number | null, "MARKET" | "LOW" | "MID" | "HIGH" | "DIRECT_LOW"][] = [
    [price.marketPrice, "MARKET"],
    [price.lowPrice, "LOW"],
    [price.midPrice, "MID"],
    [price.highPrice, "HIGH"],
    [price.directLowPrice, "DIRECT_LOW"],
  ];
  for (const [value, priceType] of tiers) {
    if (value == null || value <= 0) continue;
    await capturePriceSnapshot({
      entityId: productId,
      entityField: "sealedProductId",
      source: "TCGPLAYER",
      priceType,
      // Sealed product is never graded here -- a non-null condition would
      // make these rows invisible to the sealed price cascade in lib/sealed.ts.
      condition: null,
      price: value,
    });
    stats.snapshots += 1;
  }
}

async function processGroup(
  categoryId: number,
  group: TcgGroup,
  language: string,
  index: SetIndex,
  stats: Stats,
  unknown: string[],
  dryRun: boolean
): Promise<void> {
  const [products, prices] = await Promise.all([
    fetchProducts(categoryId, group.groupId),
    fetchPrices(categoryId, group.groupId).catch(() => [] as TcgPrice[]),
  ]);
  if (products.length === 0) return;

  const sealed: { product: TcgProduct; type: string }[] = [];
  for (const product of products) {
    if (isCardProduct(product)) continue;
    const type = classifySealedType(product.name);
    if (!type) {
      unknown.push(`${group.name} | ${product.name}`);
      continue;
    }
    sealed.push({ product, type });
  }
  if (sealed.length === 0) return;

  stats.groups += 1;
  stats.sealed += sealed.length;

  const { id: setId, name: setName } = await resolveSet(index, group, language, stats, dryRun);
  if (dryRun || !setId) {
    console.log(`${setName} [${language}] -- ${sealed.length} sealed (dry run)`);
    for (const { product, type } of sealed.slice(0, 4)) {
      console.log(`    ${type.padEnd(18)} ${product.name}`);
    }
    return;
  }

  const priceByProduct = new Map<number, TcgPrice[]>();
  for (const p of prices) {
    const list = priceByProduct.get(p.productId) ?? [];
    list.push(p);
    priceByProduct.set(p.productId, list);
  }

  console.log(`${setName} [${language}] -- ${sealed.length} sealed`);
  for (const { product, type } of sealed) {
    try {
      const id = await upsertProduct(product, type, setId, language, stats);
      const price = pickPrice(priceByProduct.get(product.productId) ?? []);
      if (id && price) await writePrices(id, price, stats);
    } catch (err) {
      stats.skipped += 1;
      const msg = err instanceof Error ? err.message.replace(/\s+/g, " ").trim().slice(0, 300) : String(err);
      console.log(`    Skipping "${product.name}": ${msg}`);
    }
  }
}

async function runCategory(
  categoryId: number,
  language: string,
  index: SetIndex,
  stats: Stats,
  unknown: string[],
  dryRun: boolean,
  limit: number
): Promise<void> {
  const groups = await fetchGroups(categoryId);
  const selected = limit > 0 ? groups.slice(0, limit) : groups;
  console.log(`\n=== category ${categoryId} (${language}): ${selected.length} groups ===`);

  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < selected.length) {
      const group = selected[cursor];
      cursor += 1;
      try {
        await processGroup(categoryId, group, language, index, stats, unknown, dryRun);
      } catch (err) {
        console.log(`  group "${group.name}" failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit-groups="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
  const onlyArg = process.argv.find((a) => a.startsWith("--category="));
  const only = onlyArg ? Number(onlyArg.split("=")[1]) : 0;

  const stats: Stats = {
    groups: 0, sealed: 0, created: 0, updated: 0, adopted: 0,
    renamed: 0, skipped: 0, snapshots: 0, newSets: 0,
  };
  const unknown: string[] = [];
  const index = await buildSetIndex();

  const categories: [number, string][] = [
    [POKEMON_EN_CATEGORY, "EN"],
    [POKEMON_JP_CATEGORY, "JA"],
  ];
  for (const [categoryId, language] of categories) {
    if (only && only !== categoryId) continue;
    await runCategory(categoryId, language, index, stats, unknown, dryRun, limit);
  }

  console.log(`\n=== summary${dryRun ? " (dry run)" : ""} ===`);
  console.log(`  groups with sealed : ${stats.groups}`);
  console.log(`  sealed products    : ${stats.sealed}`);
  console.log(`  created            : ${stats.created}`);
  console.log(`  updated            : ${stats.updated}`);
  console.log(`  adopted existing   : ${stats.adopted}`);
  console.log(`  renamed on clash   : ${stats.renamed}`);
  console.log(`  skipped (errors)   : ${stats.skipped}`);
  console.log(`  price snapshots    : ${stats.snapshots}`);
  console.log(`  new sets created   : ${stats.newSets}`);
  console.log(`  unclassified       : ${unknown.length}`);
  for (const u of unknown.slice(0, 40)) console.log(`      ${u}`);
  if (unknown.length > 40) console.log(`      ... and ${unknown.length - 40} more`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
