import Link from "next/link";
import { SEALED_TYPE_LABELS, type SealedProductType } from "@/lib/sealed";

// Only the types worth surfacing as a top-level filter -- the full enum has
// long-tail members (BINDER, GIFT_BOX, POSTER_COLLECTION) that would push the
// row past a usable width. Anything not listed is still reachable by search.
const FILTER_TYPES: SealedProductType[] = [
  "BOOSTER_BOX",
  "ELITE_TRAINER_BOX",
  "BOOSTER_PACK",
  "BUNDLE",
  "BLISTER",
  "TIN",
  "COLLECTION_BOX",
  "PREMIUM_COLLECTION",
  "DISPLAY_CASE",
  "DECK",
];

function href(query: string, type: string, language: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (type) params.set("type", type);
  if (language) params.set("lang", language);
  const qs = params.toString();
  return qs ? `/sealed?${qs}` : "/sealed";
}

function Pill({
  label,
  active,
  target,
}: {
  label: string;
  active: boolean;
  target: string;
}) {
  return (
    <Link
      href={target}
      className={
        active
          ? "shrink-0 rounded-full bg-emerald px-3 py-1.5 font-body text-sm font-medium text-paper-raised"
          : "shrink-0 rounded-full bg-paper-raised px-3 py-1.5 font-body text-sm font-medium text-ink-muted hover:text-ink"
      }
    >
      {label}
    </Link>
  );
}

export function SealedFilterBar({
  query,
  type,
  language,
}: {
  query: string;
  type: string;
  language: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pill label="All types" active={!type} target={href(query, "", language)} />
        {FILTER_TYPES.map((t) => (
          <Pill
            key={t}
            label={SEALED_TYPE_LABELS[t]}
            active={type === t}
            target={href(query, type === t ? "" : t, language)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Pill label="All languages" active={!language} target={href(query, type, "")} />
        <Pill label="English" active={language === "EN"} target={href(query, type, language === "EN" ? "" : "EN")} />
        <Pill label="Japanese" active={language === "JA"} target={href(query, type, language === "JA" ? "" : "JA")} />
      </div>
    </div>
  );
}
