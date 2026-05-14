import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js", "satori", "playwright", "playwright-core", "sharp"],
};

export default nextConfig;
