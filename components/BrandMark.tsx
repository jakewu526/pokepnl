// The wordmark's companion glyph: the mark alone, no frame. It went emerald
// square -> filled emerald tile -> emerald outline -> this. The tile hid the
// art (the asset is white-on-transparent) and the outline just spent 40% of
// the footprint on a border, so the drawing itself is the whole element now
// and gets all that space. Sized to pokepnl-mark.png's own ~3:4 aspect --
// the full hand-holding-a-card art cropped tight to its ink.
//
// The mask is how the white asset becomes emerald. MobileTabBar still uses
// the raw PNG as an <Image>, since it sits on solid emerald and wants white.
export const POKEPNL_MASK = {
  maskImage: "url(/pokepnl-mark.png)",
  WebkitMaskImage: "url(/pokepnl-mark.png)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
} as const;

export function BrandMark({ className = "h-11 w-[33px] sm:h-14 sm:w-[42px]" }: { className?: string }) {
  return <span aria-hidden="true" className={`block shrink-0 bg-emerald ${className}`} style={POKEPNL_MASK} />;
}
