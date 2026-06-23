import type { NextConfig } from "next";

// shellagent.io's Caddy router serves this agent at /agents/list-image-generator.
// Hardcoded rather than env-driven because Next.js re-reads next.config.ts at
// runtime — an env var would have to be set in both the build command AND the
// systemd unit's Environment block (which is root-owned). Hardcoding is fine
// for a single-deployment app; local dev `npm run dev` still works since
// Next.js serves the home page at /agents/list-image-generator/ locally too
// (browse to http://localhost:3000/agents/list-image-generator/).
const basePath = "/agents/list-image-generator";

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
