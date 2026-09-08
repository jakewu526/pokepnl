// Every top-level page duplicates its own header (no shared Header
// component), so keeping "the Binder title and the avatar" undimmed while
// QuickActionOverlay's backdrop covers everything else can't be done by
// bumping a shared header's z-index. Instead this renders a small floating
// replica -- same wordmark + a plain avatar circle, not the real per-page
// header -- above the dim layer, only while the overlay is open.
export function FloatingBinderBar({ hasAvatar, hasNotification }: { hasAvatar: boolean; hasNotification: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <div className="flex items-baseline gap-3">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">Binder</span>
        </div>
        {hasAvatar && (
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald text-paper-raised">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="8.5" r="3.5" />
              <path strokeLinecap="round" d="M4.5 20c1.4-3.8 4.6-6 7.5-6s6.1 2.2 7.5 6" />
            </svg>
            {hasNotification && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber ring-2 ring-paper" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
