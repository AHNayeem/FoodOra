import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads request-scoped locale config from this file.
const withNextIntl = createNextIntlPlugin("./config/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Food/restaurant imagery is sourced from Unsplash during the prototype.
    // Swap these patterns for your own CDN when wiring real data.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        // Placeholder avatar imagery for users, chefs, riders.
        protocol: "https",
        hostname: "i.pravatar.cc",
        pathname: "/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
