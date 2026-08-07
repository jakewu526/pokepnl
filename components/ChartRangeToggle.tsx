import type { RangeKey } from "@/lib/chart-format";

export function ChartRangeToggle({
  available,
  selected,
  onSelect,
}: {
  available: { key: RangeKey; label: string }[];
  selected: RangeKey | null;
  onSelect: (key: RangeKey) => void;
}) {
  if (available.length < 2) return null;

  return (
    <>
      {available.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSelect(o.key)}
          className={`rounded px-2.5 py-1 font-body text-xs font-medium transition ${
            o.key === selected
              ? "bg-ink text-paper"
              : "border border-line text-ink-muted hover:bg-paper hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}
