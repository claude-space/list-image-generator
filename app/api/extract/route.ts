import { NextRequest, NextResponse } from "next/server";
import { extractArticle } from "@/app/lib/extract";
import { clientIp, rateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Extract is the expensive endpoint (Playwright + network). Keep it tight.
  const ip = clientIp(req.headers);
  const rl = rateLimit({ scope: "extract", ip, max: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "Provide a valid http(s) URL" },
      { status: 400 },
    );
  }
  try {
    const result = await extractArticle(url);
    if (result.items.length === 0) {
      return NextResponse.json(
        {
          ...result,
          warning:
            "Couldn't detect list items automatically. Add them manually below.",
        },
        { status: 200 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
