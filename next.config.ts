import type { NextConfig } from "next";

// shellagent.io serves each agent from a user-prefixed sub-path
// (e.g. /trevor-ford/list-image-generator). The `basePath` is baked into the
// build at `npm run build` time via the BASE_PATH env var. Unset locally →
// app serves from `/`.
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  // Surface the same value to client components via process.env at build
  // time. Used by client-side fetch() calls in page.tsx to prefix
  // `/api/...` URLs; without this they'd hit the bare domain root and 404
  // behind the shellagent sub-path.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  serverExternalPackages: ["@resvg/resvg-js", "satori", "playwright", "playwright-core", "sharp"],
};

export default nextConfig;
