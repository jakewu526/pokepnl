import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/collection", destination: "/dashboard", permanent: true }];
  },
  images: {
    remotePatterns: [
      new URL("https://images.pokemontcg.io/**"),
      // A minority of cards (~2.7%) have pokemontcg.io redirecting their
      // image field to this host instead.
      new URL("https://images.scrydex.com/**"),
      // PriceCharting's image CDN, used for sealed-product photos.
      new URL("https://storage.googleapis.com/images.pricecharting.com/**"),
      // TCGplayer's product CDN -- the image source for most sealed product
      // (see lib/tcgcsv.ts).
      new URL("https://tcgplayer-cdn.tcgplayer.com/**"),
    ],
  },
};

export default nextConfig;
