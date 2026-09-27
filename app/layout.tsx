import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/dal";
import { hasPendingTradeActivity } from "@/lib/notifications";
import { AppChrome } from "@/components/AppChrome";
import { SiteFooter } from "@/components/SiteFooter";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PokePnL — Pokémon card & price tracker",
  description:
    "Browse the full Pokémon TCG catalog with current market prices, sourced daily from PriceCharting, TCGplayer, and Cardmarket.",
};

// viewportFit: "cover" is required for env(safe-area-inset-bottom), used by
// both the body padding below and MobileTabBar's own safe-area padding, to
// resolve to a non-zero value on notched/home-indicator devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const hasNotification = user ? await hasPendingTradeActivity(user.id) : false;

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] font-body antialiased md:pb-0">
        {/* iOS (Safari and the WKWebView a Capacitor build runs in) zooms the
            page when a text field under 16px gets focus, and never zooms back
            out -- the inline editors on /transactions use 10-14px text.
            maximum-scale=1 stops that, and iOS still allows pinch-zoom with it
            set. It's added only on iOS because Android does honor it and
            would lose pinch-zoom. Runs inline, before hydration, so the
            viewport is fixed before the first tap. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=navigator;if(/iP(hone|ad|od)/.test(d.userAgent)||(d.platform==="MacIntel"&&d.maxTouchPoints>1)){var m=document.querySelector('meta[name="viewport"]');if(m&&m.content.indexOf("maximum-scale")<0)m.content+=", maximum-scale=1";}})();`,
          }}
        />
        {children}
        <SiteFooter />
        <AppChrome isAuthed={!!user} hasNotification={hasNotification} />
      </body>
    </html>
  );
}
