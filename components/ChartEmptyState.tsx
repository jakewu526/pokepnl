// Shared "nothing to show yet" shell -- ValueVsCostChart and
// MonthlyPerformanceChart each had their own copy of this box with slightly
// different text; extracted so the two read as one system instead of two
// coincidentally-similar ones that could drift apart later.
export function ChartEmptyState({
  title,
  subtitle,
  height = 280,
}: {
  title: string;
  subtitle: string;
  height?: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 rounded-card border border-line bg-paper-raised text-center"
      style={{ height }}
    >
      <p className="font-body text-sm font-medium text-ink">{title}</p>
      <p className="font-body text-xs text-ink-muted">{subtitle}</p>
    </div>
  );
}
