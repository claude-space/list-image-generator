/**
 * In-memory per-IP rate limiter with sliding window.
 *
 * Fine for a single-replica Render deploy (which is what we have). If you
 * later scale horizontally, replace the Map with Redis or Upstash so the
 * counter is shared across replicas.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Map<string, Bucket>>();

function bucketFor(scope: string): Map<string, Bucket> {
  let m = buckets.get(scope);
  if (!m) {
    m = new Map();
    buckets.set(scope, m);
  }
  return m;
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Allow up to `max` requests per `windowMs` per IP per scope. Scopes let us
 * give /api/render a higher cap than /api/extract since extract runs Playwright.
 */
export function rateLimit(opts: {
  scope: string;
  ip: string;
  max: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const m = bucketFor(opts.scope);

  // Occasional GC so the Map doesn't grow unbounded under a heavy traffic spike.
  if (m.size > 5000 && Math.random() < 0.01) {
    for (const [k, b] of m) if (b.resetAt < now) m.delete(k);
  }

  const cur = m.get(opts.ip);
  if (!cur || cur.resetAt < now) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs };
    m.set(opts.ip, fresh);
    return { ok: true, remaining: opts.max - 1, resetAt: fresh.resetAt };
  }

  if (cur.count >= opts.max) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt };
  }
  cur.count += 1;
  return { ok: true, remaining: opts.max - cur.count, resetAt: cur.resetAt };
}

/**
 * Extracts the caller's IP from common reverse-proxy headers (Render uses
 * `x-forwarded-for`) and falls back to a synthetic identifier if none is set —
 * better to throttle "unknown" callers as one bucket than to not throttle.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
