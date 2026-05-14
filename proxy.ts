import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/app/lib/auth";

/**
 * Auth gate. Anything not in the allowlist must carry a valid session cookie
 * or it gets bounced to /login?next=<originalPath>.
 *
 * The rate limit on /api/auth/login lives inside the route handler itself —
 * doing throttling here would require Edge-compatible state, and we keep
 * everything in-memory in the Node runtime.
 *
 * In Next.js 16 this file is named `proxy.ts` (was `middleware.ts` in <=15).
 */

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
];

function isPublic(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith("/_next/")) return true;
  if (path === "/favicon.ico") return true;
  if (path.startsWith("/fonts/")) return true;
  return false;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (verifySession(cookie)) return NextResponse.next();

  // API routes get a JSON 401; pages get a redirect to /login.
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  if (path !== "/") loginUrl.searchParams.set("next", path);
  return NextResponse.redirect(loginUrl);
}

// Next.js 16's proxy.ts always runs on Node.js, so we can use node:crypto
// for HMAC without an explicit runtime export. The `matcher` config is still
// supported and keeps the proxy off static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
