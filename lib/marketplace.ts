// Where an item was bought or sold. Fixed list plus a freeform "Other" entry
// (see marketplaceLabel below) for anything not worth a dedicated code.
export const MARKETPLACES = [
  "POKEMON_CENTER",
  "AMAZON",
  "BARNES_AND_NOBLE",
  "WALMART",
  "TARGET",
  "EBAY",
  "OTHER",
] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  POKEMON_CENTER: "Pokemon Center",
  AMAZON: "Amazon",
  BARNES_AND_NOBLE: "Barnes and Noble",
  WALMART: "Walmart",
  TARGET: "Target",
  EBAY: "eBay",
  OTHER: "Other",
};

export const MARKETPLACE_OTHER_MAX_LENGTH = 100;

function isMarketplaceCode(value: string): value is Marketplace {
  return (MARKETPLACES as readonly string[]).includes(value);
}

// Stored value is either a known code's label or a freeform "Other" string --
// same convention lib/sealed-condition.ts's OTHER condition uses -- so display
// just needs to fall back to whatever was stored.
export function marketplaceLabel(value: string | null): string | null {
  if (!value) return null;
  return isMarketplaceCode(value) ? MARKETPLACE_LABELS[value] : value;
}
