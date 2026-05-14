import { NextRequest, NextResponse } from "next/server";
import { checkPassword, issueSessionCookie } from "@/app/lib/auth";
import { clientIp, rateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Tight throttle on login attempts to make brute-forcing infeasible.
  const ip = clientIp(req.headers);
  const rl = rateLimit({ scope: "login", ip, max: 8, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.password || !checkPassword(body.password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const cookie = issueSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookie.name,
    value: cookie.value,
    maxAge: cookie.maxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res;
}
