// Sealed products don't wear the way a raw card does (no surface/edge/corner
// wear scale) -- the thing that actually varies and matters to a buyer is
// packaging damage, so the vocabulary is different from lib/condition.ts's
// card conditions.
export const SEALED_CONDITIONS = ["MINT", "DENTED", "RIPPED", "OTHER"] as const;
export type SealedCondition = (typeof SEALED_CONDITIONS)[number];

export const SEALED_CONDITION_LABELS: Record<SealedCondition, string> = {
  MINT: "Mint",
  DENTED: "Dented",
  RIPPED: "Ripped",
  OTHER: "Other",
};

export const SEALED_CONDITION_OTHER_MAX_LENGTH = 100;
