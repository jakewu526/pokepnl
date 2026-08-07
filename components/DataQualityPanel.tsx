import type { DataQuality } from "@/lib/dashboard";

const STATE_DOT: Record<"ok" | "warn" | "fail", string> = {
  ok: "bg-emerald",
  warn: "bg-amber",
  fail: "bg-amber",
};

// The drill-down half of the header's DataQualityScore pill -- names exactly
// which rule broke for which field (advice-doc step 8), rather than a single
// opaque percentage.
export function DataQualityPanel({ quality }: { quality: DataQuality }) {
  return (
    <div className="rounded-card border border-line bg-paper-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-body text-sm font-medium text-ink">Data quality</h3>
        <span className="font-data text-sm font-medium text-ink">{Math.round(quality.score * 100)}%</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {quality.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2.5">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATE_DOT[check.state]}`} aria-hidden="true" />
            <div>
              <p className="font-body text-xs font-medium text-ink">{check.label}</p>
              <p className="font-body text-xs text-ink-muted">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
