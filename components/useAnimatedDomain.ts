"use client";

import { useEffect, useRef, useState } from "react";

// The chart viewport: min/max timestamp on x, min/max price on y. Animating
// this (rather than morphing the line path, whose point count changes between
// ranges) is what produces the zoom/pan as the axes rescale.
export type Domain = {
  minDate: number;
  maxDate: number;
  minPrice: number;
  maxPrice: number;
};

const DURATION_MS = 700;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function domainsEqual(a: Domain, b: Domain): boolean {
  return (
    a.minDate === b.minDate &&
    a.maxDate === b.maxDate &&
    a.minPrice === b.minPrice &&
    a.maxPrice === b.maxPrice
  );
}

export type AnimatedDomain = {
  // The interpolated viewport to render this frame.
  domain: Domain;
  // The viewport the in-flight transition started from (equals `domain` when
  // idle). Callers use it to render the wider point set across a transition so
  // a zoom-in never reveals empty space.
  from: Domain;
  animating: boolean;
};

// Smoothly interpolates the rendered domain toward `target` whenever it changes,
// so a range switch animates instead of snapping. Honors reduced-motion.
export function useAnimatedDomain(target: Domain): AnimatedDomain {
  const [domain, setDomain] = useState<Domain>(target);
  const [animating, setAnimating] = useState(false);
  const domainRef = useRef(domain);
  domainRef.current = domain;
  const fromRef = useRef<Domain>(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (domainsEqual(domainRef.current, target)) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDomain(target);
      setAnimating(false);
      return;
    }

    const from = domainRef.current;
    fromRef.current = from;
    setAnimating(true);
    const start = performance.now();
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const e = easeInOutCubic(t);
      setDomain({
        minDate: from.minDate + (target.minDate - from.minDate) * e,
        maxDate: from.maxDate + (target.maxDate - from.maxDate) * e,
        minPrice: from.minPrice + (target.minPrice - from.minPrice) * e,
        maxPrice: from.maxPrice + (target.maxPrice - from.maxPrice) * e,
      });
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setAnimating(false);
      }
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
    // Track the primitive fields; `target` is a fresh object each render.
  }, [target.minDate, target.maxDate, target.minPrice, target.maxPrice]);

  return { domain, from: animating ? fromRef.current : domain, animating };
}
