import type { DataQuality } from "@/lib/dashboard";

function stateFromScore(score: number): "ok" | "warn" | "fail" {
  if (score >= 0.9) return "ok";
  if (score >= 0.7) return "warn";
  return "fail";
}

// Header pill = the "persistent" half of "persistent score + drill-down"
// (advice-doc step 8: don't let a report quietly lie about how good its
// input data is). A plain anchor to #ops works with JS disabled and needs no
// new route -- the drill-down is DataQualityPanel, rendered in the Ops zone.
export function DataQualityScore({ quality }: { quality: DataQuality }) {
  const state = stateFromScore(quality.score);
  const toneClass = state === "ok" ? "text-emerald-strong" : "text-amber";

  const pct = Math.round(quality.score * 100);

  return (
    // Hidden below sm: the header row already carries "← Binder" plus
    // AuthNav's four links (which themselves hide the user's name on
    // mobile to fit) -- adding this pushes 375px over into horizontal
    // scroll (UI-01). Full label returns at md: once there's room.
    <a
      href="#ops"
      className={`hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-data text-xs font-medium transition-colors hover:bg-paper-raised sm:flex ${toneClass}`}
    >
      <span aria-hidden="true">●</span>
      <span className="md:hidden">{pct}%</span>
      <span className="hidden md:inline">{pct}% data quality</span>
    </a>
  );
}
