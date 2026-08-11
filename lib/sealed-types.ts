// Pure types/constants shared between server code (lib/sealed.ts) and client
// components (e.g. SearchBar). Kept free of any server-only import (prisma,
// "pg") so client components can pull in SEALED_TYPE_LABELS without dragging
// the whole server module -- and its Node-only "dns" dependency -- into the
// browser bundle.
export type SealedProductType =
  | "BOOSTER_BOX"
  | "BOOSTER_PACK"
  | "ELITE_TRAINER_BOX"
  | "BUNDLE"
  | "BLISTER"
  | "COLLECTION_BOX"
  | "TIN"
  | "OTHER"
  | "PREMIUM_COLLECTION"
  | "DISPLAY_CASE"
  | "DECK"
  | "POSTER_COLLECTION"
  | "PIN_COLLECTION"
  | "GIFT_BOX"
  | "BINDER"
  | "STARTER_SET";

export const SEALED_TYPE_LABELS: Record<SealedProductType, string> = {
  BOOSTER_BOX: "Booster Box",
  BOOSTER_PACK: "Booster Pack",
  ELITE_TRAINER_BOX: "Elite Trainer Box",
  BUNDLE: "Booster Bundle",
  BLISTER: "Blister",
  COLLECTION_BOX: "Collection Box",
  TIN: "Tin",
  OTHER: "Sealed Product",
  PREMIUM_COLLECTION: "Premium Collection",
  DISPLAY_CASE: "Display Case",
  DECK: "Deck",
  POSTER_COLLECTION: "Poster Collection",
  PIN_COLLECTION: "Pin Collection",
  GIFT_BOX: "Gift Box",
  BINDER: "Binder",
  STARTER_SET: "Starter Set",
};

export type SealedProductSuggestion = {
  id: string;
  name: string;
  type: SealedProductType;
  imageUrl: string | null;
  language: string;
  setName: string | null;
};
