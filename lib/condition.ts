export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type Condition = (typeof CONDITIONS)[number];

export function isCondition(value: string | undefined): value is Condition {
  return !!value && (CONDITIONS as readonly string[]).includes(value);
}

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

// Fallback estimate used when neither TCGplayer nor eBay condition-level
// pricing is available. Industry-standard rough percentages of the Near
// Mint market price.
export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
};

// Best-effort guess; VERIFY against eBay's Taxonomy API
// (GET /commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=183454)
// once EBAY_CLIENT_ID/SECRET are populated -- the exact aspect name and
// value strings for the "CCG Individual Cards" category are unconfirmed.
export const EBAY_CONDITION_ASPECT_NAME = "Card Condition";
export const EBAY_CONDITION_ASPECT_VALUES: Record<Exclude<Condition, "NM">, string> = {
  LP: "Lightly Played (Excellent)",
  MP: "Moderately Played (Very Good)",
  HP: "Heavily Played (Good)",
  DMG: "Damaged (Poor)",
};
