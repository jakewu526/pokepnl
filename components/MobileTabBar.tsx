"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 11.5 12 4l8 7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 10v9h5v-5.5h2V19h5v-9" />
    </svg>
  );
}

function GridIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V11M10 20V5M16 20v-8" />
      <path strokeLinecap="round" d="M2.5 20h19" />
    </svg>
  );
}

function ReceiptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" />
      <path strokeLinecap="round" d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  );
}

type TabItem = {
  key: string;
  label: string;
  href: string;
  icon: (props: IconProps) => React.ReactElement;
  // Which side faces the circle -- that tile touches the circle's true edge
  // with zero gap (see the button's mx-[-6px] below, which cancels the
  // row's normal gap-1.5 for just these two neighbors) and gets a mask cut
  // at the circle's *actual* center and radius, so the curve it shows is
  // genuinely the circle's own curvature, not an unrelated shape.
  notch?: "left" | "right";
};

// Placeholder destinations -- swap these (and the center button's action)
// once the final tab bar IA is decided.
const LEFT_TABS: TabItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { key: "cards", label: "Cards", href: "/", icon: GridIcon, notch: "right" },
];

const RIGHT_TABS: TabItem[] = [
  { key: "portfolio", label: "Portfolio", href: "/portfolio", icon: ChartIcon, notch: "left" },
  { key: "transactions", label: "Activity", href: "/transactions", icon: ReceiptIcon },
];

// Circle is h-20/w-20 -> 40px radius. The tile sits with zero gap against
// the circle's true edge (see mx-[-6px] on the button), so the mask center
// is exactly one radius past the tile's own edge -- calc(100% + 40px) for
// Cards, calc(0% - 40px) for Portfolio -- putting it at the circle's real
// center, not a point local to the tile. +4px on the mask's own radius is
// just a thin halo, same idea as the gap between every other pair of
// buttons, not extra curve depth.
const CIRCLE_RADIUS = 40;
const HALO = 8;

function SquareTab({ tab, active }: { tab: TabItem; active: boolean }) {
  const Icon = tab.icon;
  const maskImage =
    tab.notch === "right"
      ? `radial-gradient(circle ${CIRCLE_RADIUS + HALO}px at calc(100% + ${CIRCLE_RADIUS}px) 50%, transparent 99%, black 100%)`
      : tab.notch === "left"
        ? `radial-gradient(circle ${CIRCLE_RADIUS + HALO}px at calc(0% - ${CIRCLE_RADIUS}px) 50%, transparent 99%, black 100%)`
        : undefined;

  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      style={maskImage ? { WebkitMaskImage: maskImage, maskImage } : undefined}
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 bg-paper-raised px-1 text-center text-[9px] font-medium leading-tight transition-colors ${
        active ? "text-emerald" : "text-ink-muted hover:text-ink"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{tab.label}</span>
    </Link>
  );
}

// Full-screen auth/onboarding gates -- not normal browsing pages, and their
// own flow doesn't make sense to navigate away from via tabs like
// "Dashboard" while you're still signing in.
const HIDDEN_ON = ["/login", "/signup", "/welcome"];

/**
 * Fixed bottom tab bar for narrow (phone-width) viewports -- hidden at the
 * `md` breakpoint and up. Mounted from components/AppChrome.tsx (itself
 * mounted from the root layout), so it's live on every page; app/layout.tsx
 * also pads the body (pb-24 md:pb-0) so page content doesn't sit underneath
 * it. `onPrimaryAction` opens the Trade/Sell overlay (or redirects to login
 * for a signed-out visitor) -- see AppChrome for that decision.
 */
export function MobileTabBar({ onPrimaryAction }: { onPrimaryAction: () => void }) {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {/* Solid bg-paper backdrop behind the whole row, so the small gaps
          between buttons don't show scrolling page content through them --
          e.g. card art scrolling past underneath used to peek through those
          gaps. Deliberately bg-paper, not bg-paper-raised: it needs to
          differ from the tiles' own color, or the tiles lose their contrast
          against it and stop reading as distinct buttons. */}
      <div
        className="flex h-20 items-center justify-center gap-1.5 border-t border-line bg-paper shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {LEFT_TABS.map((tab) => (
          <SquareTab key={tab.key} tab={tab} active={pathname === tab.href} />
        ))}

        {/* mx-[-6px] cancels the row's gap-1.5 on both sides of just this
            element, so it touches Cards/Portfolio with zero gap -- required
            for the mask math above, which assumes the tile edge sits
            exactly one radius away from the circle's true center. */}
        <button
          type="button"
          aria-label="Trade or sell"
          onClick={onPrimaryAction}
          className="mx-[-6px] flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald text-paper-raised shadow-lg transition-transform active:scale-95"
        >
          <Image src="/pokepnl-mark.png" alt="" width={240} height={184} className="h-12 w-auto" priority />
        </button>

        {RIGHT_TABS.map((tab) => (
          <SquareTab key={tab.key} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}
