import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share card reads Geist from node_modules at runtime, which file tracing can't see;
  // without this, Vercel's function bundle has no fonts and the card falls back to the default.
  outputFileTracingIncludes: {
    "/w/[address]/opengraph-image": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,SemiBold}.ttf", "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf"],
  },
};

export default nextConfig;
