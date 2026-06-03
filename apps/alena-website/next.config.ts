import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.sanity.io" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "scontent-*.cdninstagram.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/תפריט", destination: "/menu", permanent: true },
      { source: "/אירועים", destination: "/events", permanent: true },
      { source: "/משלוחים", destination: "/delivery", permanent: true },
      { source: "/גלריה", destination: "/gallery", permanent: true },
      { source: "/אודות", destination: "/about", permanent: true },
      { source: "/צור-קשר", destination: "/contact", permanent: true },
      { source: "/בלוג", destination: "/blog", permanent: true },
    ];
  },
};

export default nextConfig;
