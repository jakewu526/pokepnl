"use client";

import { useRef, useState } from "react";

type DragState = { startX: number; startScrollLeft: number; dragged: boolean };

// A horizontal scroll-snap strip for "Just added" -- native touch swipe on
// mobile (overflow-x + snap-x is all that takes), plus click-and-drag for
// mouse users on desktop: a plain vertical wheel doesn't move a
// horizontal-only strip, so without drag support a mouse user has no way to
// move it besides the chevron buttons.
export function PortfolioCarousel({ children }: { children: React.ReactNode[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function cardStep(): number {
    const scroller = scrollerRef.current;
    const card = scroller?.querySelector<HTMLElement>("[data-carousel-item]");
    const gap = 12;
    return card ? card.getBoundingClientRect().width + gap : (scroller?.clientWidth ?? 0) * 0.8;
  }

  function scrollByCard(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: cardStep() * direction, behavior: "smooth" });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return; // touch/pen already scroll natively
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragRef.current = { startX: e.clientX, startScrollLeft: scroller.scrollLeft, dragged: false };
    scroller.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = scrollerRef.current;
    const drag = dragRef.current;
    if (!scroller || !drag) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 3) drag.dragged = true;
    scroller.scrollLeft = drag.startScrollLeft - delta;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = scrollerRef.current;
    const drag = dragRef.current;
    if (!scroller || !drag) return;
    scroller.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    // Dragging moves scrollLeft directly, bypassing the snap engine (which
    // only corrects on its own scroll events) -- settle it onto the nearest
    // card boundary explicitly rather than leaving it wherever the mouse let go.
    if (drag.dragged) {
      const step = cardStep();
      const index = step > 0 ? Math.round(scroller.scrollLeft / step) : 0;
      scroller.scrollTo({ left: index * step, behavior: "smooth" });
    }
    dragRef.current = null;
  }

  // A drag that actually moved the strip shouldn't also fire the card's own
  // link underneath the pointer -- capture phase so this runs before it.
  function handleClickCapture(e: React.MouseEvent) {
    if (dragRef.current?.dragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClickCapture={handleClickCapture}
        className={`no-scrollbar flex gap-3 overflow-x-auto pb-1 sm:gap-4 ${
          isDragging ? "cursor-grabbing snap-none select-none" : "cursor-grab snap-x snap-mandatory scroll-smooth"
        }`}
      >
        {children.map((child, i) => (
          <div key={i} data-carousel-item className="w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[18.5%]">
            {child}
          </div>
        ))}
      </div>

      {/* Edge fades hint the strip keeps going past what's visible -- the
          peeking last card alone read as "a row that got cut off," not as
          something you're meant to scroll. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-paper to-transparent sm:w-14" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent sm:w-14" />

      <button
        type="button"
        onClick={() => scrollByCard(-1)}
        aria-label="Scroll to previous"
        className="absolute top-1/2 left-1 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper-raised p-2.5 text-ink shadow-lg transition-colors hover:bg-paper sm:flex"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scrollByCard(1)}
        aria-label="Scroll to next"
        className="absolute top-1/2 right-1 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper-raised p-2.5 text-ink shadow-lg transition-colors hover:bg-paper sm:flex"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
