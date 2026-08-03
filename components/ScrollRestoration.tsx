"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// How long to keep retrying the restore before giving up. Searched/filtered
// binder pages re-run a DB query on the way back (unlike the cached default
// listing), so the results grid can still be shorter than the saved scroll
// position for a few frames after mount -- a single scrollTo attempt lands
// on a too-short page and silently does nothing.
const RESTORE_TIMEOUT_MS = 2000;

// Next.js scrolls to the top on every App Router navigation, including
// `router.back()` to a page whose content didn't actually change (e.g.
// returning to the same binder page/search after adding a card from a
// card's detail view). Restore the scroll position ourselves, keyed by the
// full URL, so returning to a page you were scrolled down on doesn't dump
// you back at the top.
export function ScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `binder-scroll:${pathname}?${searchParams.toString()}`;
  const restoringRef = useRef(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(key);
    const targetY = saved != null ? parseInt(saved, 10) : NaN;
    if (!Number.isFinite(targetY) || targetY <= 0) return;

    restoringRef.current = true;
    let rafId: number;
    let cancelled = false;
    const start = performance.now();

    function attempt() {
      if (cancelled) return;
      window.scrollTo(0, targetY);
      const closeEnough = Math.abs(window.scrollY - targetY) < 2;
      const timedOut = performance.now() - start > RESTORE_TIMEOUT_MS;
      if (closeEnough || timedOut) {
        restoringRef.current = false;
        return;
      }
      rafId = requestAnimationFrame(attempt);
    }
    rafId = requestAnimationFrame(attempt);

    // The user scrolling or dragging on their own means "leave me here" --
    // stop fighting them for control of the scroll position.
    function stopRestoring() {
      cancelled = true;
      restoringRef.current = false;
    }
    window.addEventListener("wheel", stopRestoring, { passive: true, once: true });
    window.addEventListener("touchmove", stopRestoring, { passive: true, once: true });

    return () => {
      cancelled = true;
      restoringRef.current = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("touchmove", stopRestoring);
    };
  }, [key]);

  useEffect(() => {
    function handleScroll() {
      if (restoringRef.current) return;
      sessionStorage.setItem(key, String(window.scrollY));
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [key]);

  return null;
}
