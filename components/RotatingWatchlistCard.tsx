"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { setFeaturedWatchlistCard } from "@/app/actions/watchlist";
import type { FeaturedCardOption } from "@/lib/watchlist";

// Generic Pokeball-style motif built from basic shapes -- deliberately not a
// reproduction of the real (trademarked) Pokemon TCG card back.
function CardBackMotif({ muted = false }: { muted?: boolean }) {
  const stroke = "var(--ink)";
  const top = muted ? "var(--line)" : "var(--emerald)";
  const bottom = "var(--paper-raised)";
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <rect x="1" y="1" width="98" height="98" rx="8" fill="var(--paper)" stroke="var(--line)" strokeWidth="2" />
      <g transform="translate(50 50)">
        <clipPath id="ball-top">
          <rect x="-32" y="-32" width="64" height="32" />
        </clipPath>
        <clipPath id="ball-bottom">
          <rect x="-32" y="0" width="64" height="32" />
        </clipPath>
        <circle r="32" fill={top} clipPath="url(#ball-top)" />
        <circle r="32" fill={bottom} clipPath="url(#ball-bottom)" />
        <circle r="32" fill="none" stroke={stroke} strokeWidth="2.5" />
        <line x1="-32" y1="0" x2="32" y2="0" stroke={stroke} strokeWidth="2.5" />
        <circle r="9" fill="var(--paper)" stroke={stroke} strokeWidth="2.5" />
        <circle r="3.5" fill={stroke} />
      </g>
    </svg>
  );
}

function EmptyFace() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 bg-paper-raised p-4 text-center">
      <div className="h-16 w-16 opacity-40">
        <CardBackMotif muted />
      </div>
      <p className="font-body text-sm font-medium text-ink">Your watchlist is empty</p>
      <Link href="/" className="font-body text-xs font-medium text-emerald-strong hover:underline">
        Browse cards →
      </Link>
    </div>
  );
}

const REST_DEG_PER_SEC = 360 / 9; // matches the old 9s-per-revolution resting pace
const HOVER_DEG_PER_SEC = 360 / 2.2; // matches the old 2.2s-per-revolution hover pace

// Drives the spin with rAF instead of a CSS animation so hover can change speed
// mid-rotation without a jump: a CSS animation recomputes its progress as
// elapsedTime / duration, so swapping the duration while running snaps the
// visible angle forward or back (worse the faster you toggle hover). Directly
// accumulating the angle each frame sidesteps that -- only the increment
// changes, never the angle itself.
function useCardSpin(spinnerRef: React.RefObject<HTMLDivElement | null>, hoveredRef: React.RefObject<boolean>) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = performance.now();
    let angle = 0;
    let speed = REST_DEG_PER_SEC;

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.1); // clamp to avoid a big jump after a tab was backgrounded
      last = now;
      const target = hoveredRef.current ? HOVER_DEG_PER_SEC : REST_DEG_PER_SEC;
      speed += (target - speed) * Math.min(1, dt * 5); // ease toward the target speed instead of snapping
      angle = (angle + speed * dt) % 360;
      if (spinnerRef.current) spinnerRef.current.style.transform = `rotateY(${angle}deg)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinnerRef, hoveredRef]);
}

export function RotatingWatchlistCard({
  featured,
  options,
}: {
  featured: FeaturedCardOption | null;
  options: FeaturedCardOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [pinnedId, setPinnedId] = useState(featured?.watchlistItemId ?? null);
  const [error, setError] = useState(false);

  const spinnerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  useCardSpin(spinnerRef, hoveredRef);

  function handlePin(id: string) {
    const next = id === "" ? null : id;
    const previous = pinnedId;
    setPinnedId(next);
    setError(false);
    startTransition(async () => {
      try {
        await setFeaturedWatchlistCard(next);
      } catch {
        setPinnedId(previous);
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="[perspective:1400px]"
        style={{ width: 260, height: 364 }}
        onMouseEnter={() => {
          hoveredRef.current = true;
        }}
        onMouseLeave={() => {
          hoveredRef.current = false;
        }}
      >
        {/* Static tilt frame: hover is tracked here, on a flat, never-rotated
            box, so it stays stable even when the spinner's projected edge
            thins out mid-rotation. */}
        <div
          className="relative h-full w-full [transform-style:preserve-3d]"
          style={{ transform: "rotateX(16deg) rotateZ(-9deg)" }}
        >
          <div ref={spinnerRef} className="relative h-full w-full [transform-style:preserve-3d]">
            <div className="absolute inset-0 overflow-hidden rounded-card border border-line bg-paper-raised [backface-visibility:hidden]">
              {featured?.card.imageUrl ? (
                <Image
                  src={featured.card.imageUrl}
                  alt={featured.card.name}
                  fill
                  sizes="260px"
                  className="object-cover"
                />
              ) : (
                <EmptyFace />
              )}
            </div>
            <div className="absolute inset-0 overflow-hidden rounded-card border border-line [transform:rotateY(180deg)] [backface-visibility:hidden]">
              <CardBackMotif muted={!featured} />
            </div>
          </div>
        </div>
      </div>

      {options.length > 0 && (
        <div className="flex w-full max-w-[260px] flex-col items-center gap-1">
          <select
            value={pinnedId ?? ""}
            onChange={(e) => handlePin(e.target.value)}
            disabled={pending}
            className="w-full rounded-card border border-line bg-paper-raised px-2 py-1.5 font-body text-xs text-ink disabled:opacity-70"
          >
            <option value="">Random on load</option>
            {options.map((o) => (
              <option key={o.watchlistItemId} value={o.watchlistItemId}>
                Pin: {o.card.name}
              </option>
            ))}
          </select>
          {error && <p className="font-body text-[11px] text-amber">Couldn&apos;t save, try again.</p>}
        </div>
      )}
    </div>
  );
}
