import type { ReactNode } from "react";
import { InfoTip } from "@/components/InfoTip";

type Tone = "plain" | "band" | "muted";

// Ground treatment per zone -- the main lever against "every block looks the
// same": these bands run edge-to-edge (the section itself carries the
// background), while the content inside stays centered at the app's usual
// max-w-6xl. See the zone table in the dashboard redesign plan.
const TONE_CLASS: Record<Tone, string> = {
  plain: "bg-paper",
  band: "border-y border-line bg-paper-raised/60",
  muted: "bg-paper-raised/40",
};

// scroll-mt-28 keeps the sticky header+nav from covering the section when a
// nav pill jumps here (matches the existing UI-08 test case's requirement).
export function DashboardSection({
  id,
  title,
  help,
  tone = "plain",
  children,
}: {
  id: string;
  title: string;
  help?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-28 py-8 sm:py-10 ${TONE_CLASS[tone]}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {help && <InfoTip text={help} />}
        </div>
        {children}
      </div>
    </section>
  );
}
