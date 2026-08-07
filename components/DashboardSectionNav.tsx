"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "pulse", label: "Pulse" },
  { id: "performance", label: "Performance" },
  { id: "positions", label: "Positions" },
  { id: "ops", label: "Ops" },
];

// Scroll-spy pill nav for the four dashboard zones. Deliberately not
// self-sticky -- it's rendered as a second row inside the page's existing
// sticky header, so there's exactly one sticky element to reason about
// instead of two independently-positioned ones.
export function DashboardSectionNav() {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="border-t border-line">
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`shrink-0 rounded px-2.5 py-1 font-body text-xs font-medium transition ${
              active === s.id ? "bg-ink text-paper" : "border border-line text-ink-muted hover:bg-paper hover:text-ink"
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
