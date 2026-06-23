import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Always evaluate at request time — a static snapshot would defeat the
// purpose of a health probe.
export const dynamic = "force-dynamic";

// Lightweight liveness probe. The deploy-to-vm SKILL curls this after each
// PM2 restart to confirm the process is actually serving traffic — not just
// that PM2 marked it "online". A 200 here means: Node is up, Next routing
// is wired, the response body parses.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "list-image-generator",
    uptimeSeconds: Math.round(process.uptime()),
  });
}
