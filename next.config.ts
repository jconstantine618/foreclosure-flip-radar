import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TODO: remove after fixing type errors in enrich route
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "**.zillow.com",
      },
      {
        protocol: "https",
        hostname: "**.zillowstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.realtor.com",
      },
      {
        protocol: "https",
        hostname: "**.redfin.com",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
