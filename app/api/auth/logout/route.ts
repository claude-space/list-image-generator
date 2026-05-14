import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const c = clearSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: c.name,
    value: c.value,
    maxAge: c.maxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res;
}
