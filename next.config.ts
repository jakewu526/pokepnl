import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      new URL("https://images.pokemontcg.io/**"),
      // A minority of cards (~2.7%) have pokemontcg.io redirecting their
      // image field to this host instead.
      new URL("https://images.scrydex.com/**"),
      // PriceCharting's image CDN, used for sealed-product photos.
      new URL("https://storage.googleapis.com/images.pricecharting.com/**"),
    ],
  },
};

export default nextConfig;
