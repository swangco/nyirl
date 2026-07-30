import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/applications",
        destination: "/applied",
        permanent: true,
      },
      {
        source: "/category/:category",
        destination: "/discover?category=:category",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
