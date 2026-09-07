"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeToMobileQuery(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getIsMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getIsMobileServerSnapshot() {
  return false;
}

// Two taps within this long of each other, and this close together on
// screen, count as a double-tap. A native `dblclick` doesn't fire reliably
// on mobile Safari, so this tracks pointerup timestamps/coordinates by hand
// instead.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
// A pointer that moved more than this between down and up was a scroll or
// a drag, not a tap -- don't let it count toward (or reset) the double-tap.
const MOVE_CANCEL_PX = 10;

// Lets a mobile visitor double-tap a dashboard chart to view it full-screen.
// `children` is a render prop, not a plain node, so the wrapped chart can
// draw denser when small (ValueBars' `compact`) and looser once enlarged --
// see DashboardOverview, the one caller.
//
// Mobile-only: desktop already has room for these charts, and a
// double-click opening a fullscreen overlay there would be surprising
// rather than useful. Gated via matchMedia in an effect, not during render
// (checking window at render time breaks hydration).
export function ChartZoom({ title, children }: { title: string; children: (zoomed: boolean) => ReactNode }) {
  // useSyncExternalStore, not a state+effect pair -- matchMedia is external
  // mutable state (the viewport), and this is the hook React provides for
  // subscribing to exactly that without the read-then-setState-in-an-effect
  // pattern that (rightly) trips the set-state-in-effect lint rule. The
  // false server snapshot means SSR/hydration always renders the desktop
  // (non-mobile) branch first, same as every other viewport-gated bit of
  // this codebase.
  const isMobile = useSyncExternalStore(subscribeToMobileQuery, getIsMobile, getIsMobileServerSnapshot);
  const [zoomed, setZoomed] = useState(false);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomed(false);
    }
    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [zoomed]);

  function handlePointerDown(e: ReactPointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: ReactPointerEvent) {
    if (!isMobile) return;
    const down = downRef.current;
    downRef.current = null;
    // Moved too far between down and up -- a scroll/drag, not a tap. Also
    // breaks the double-tap streak so two accidental taps a scroll apart
    // don't combine into a zoom.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_CANCEL_PX) {
      lastTapRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX) {
      setZoomed(true);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }
  }

  return (
    <>
      {/* touchAction: manipulation stops iOS's own double-tap-to-zoom from
          firing here -- that's the exact browser-level zoom the mobile
          batch's viewport lock (see globals.css) exists to prevent, and it
          would otherwise fight this gesture for the same two taps. */}
      <div
        style={{ touchAction: "manipulation" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {children(false)}
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-paper p-3"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full border border-line bg-paper-raised text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {/* min-h-full + centering on the INNER div, not the scrolling
              outer one -- centering the scroll container itself is a known
              flexbox pitfall (`justify-content: center` combined with
              overflow can make the start of taller-than-box content
              unreachable even with scroll). This wrapper centers the chart
              when it's shorter than the overlay and simply grows (with the
              outer div scrolling normally) when it's taller. */}
          <div className="flex-1 overflow-y-auto pt-8">
            <div className="flex min-h-full flex-col justify-center">{children(true)}</div>
          </div>
        </div>
      )}
    </>
  );
}
