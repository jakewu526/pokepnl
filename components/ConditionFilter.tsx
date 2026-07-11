"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CONDITIONS, CONDITION_LABELS, type Condition } from "@/lib/condition";

export function ConditionFilter({ condition }: { condition: Condition }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "NM") {
      params.delete("condition");
    } else {
      params.set("condition", next);
    }
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="condition-filter" className="font-body text-sm text-ink-muted">
        Condition
      </label>
      <select
        id="condition-filter"
        value={condition}
        onChange={(e) => handleChange(e.target.value)}
        className="h-10 rounded-full border border-line bg-paper-raised px-4 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-emerald focus-visible:outline-offset-2"
      >
        {CONDITIONS.map((code) => (
          <option key={code} value={code}>
            {CONDITION_LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
