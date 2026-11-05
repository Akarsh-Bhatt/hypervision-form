import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In development, strict mode doubles all component lifecycles and effects.
  // Turning it off provides a noticeably snappier rendering experience.
  reactStrictMode: false,
  experimental: {
    // Tree-shake lucide-react to avoid importing hundreds of unused icon chunks
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
