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

// Rough industry-standard percentages of the Near Mint market price, used
// to estimate what a collector's own graded-condition copy is worth (in the
// collection/P&L views) -- not tied to any live per-condition price lookup.
export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
};
