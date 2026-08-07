"use client";

import { useEffect, useRef } from "react";

// Wraps children in the `.holo` treatment (see app/globals.css) and drives
// its cursor-tracked sheen. Writes --holo-x/--holo-y straight to the DOM via
// el.style.setProperty() inside a rAF, never through React state -- routing
// every pointermove through a re-render would repaint the whole hero on
// every mouse move.
export function HoloSurface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let pendingX: number | null = null;
    let pendingY: number | null = null;

    function flush() {
      raf = 0;
      if (pendingX == null || pendingY == null) return;
      el!.style.setProperty("--holo-x", `${pendingX}%`);
      el!.style.setProperty("--holo-y", `${pendingY}%`);
    }

    function handleMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pendingX = ((e.clientX - rect.left) / rect.width) * 100;
      pendingY = ((e.clientY - rect.top) / rect.height) * 100;
      if (!raf) raf = requestAnimationFrame(flush);
    }

    el.addEventListener("pointermove", handleMove);
    return () => {
      el.removeEventListener("pointermove", handleMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={`holo ${className}`}>
      {children}
    </div>
  );
}
