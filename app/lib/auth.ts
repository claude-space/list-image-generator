import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "app-session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Stateless session cookies. Format: `{base64url(payload)}.{hmac}` where the
 * payload encodes the issued-at timestamp. We re-verify the HMAC on every
 * request, so flipping AUTH_SECRET invalidates every existing session.
 *
 * Avoids a database, an auth library, and email infrastructure — the tradeoff
 * is no per-user identity. Everyone on the team uses the same APP_PASSWORD.
 * Upgrade path: swap to NextAuth.js + Resend magic links if you ever need
 * per-user audit trails or selective revocation.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET env var is required (>=16 chars). Generate one: openssl rand -hex 32",
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function unb64url(s: string): Buffer {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function issueSessionCookie(): { name: string; value: string; maxAge: number } {
  const payload = b64url(Buffer.from(JSON.stringify({ iat: Date.now() })));
  const sig = sign(payload);
  return { name: COOKIE_NAME, value: `${payload}.${sig}`, maxAge: MAX_AGE_SECONDS };
}

export function clearSessionCookie(): { name: string; value: string; maxAge: number } {
  return { name: COOKIE_NAME, value: "", maxAge: 0 };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * Validates a session cookie value. Returns true if signature checks out AND
 * the payload isn't past its max age.
 */
export function verifySession(cookieValue: string | undefined | null): boolean {
  if (!cookieValue) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  try {
    const { iat } = JSON.parse(unb64url(payload).toString());
    if (typeof iat !== "number") return false;
    if (Date.now() - iat > MAX_AGE_SECONDS * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time password comparison so failed login attempts don't leak length.
 */
export function checkPassword(submitted: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
