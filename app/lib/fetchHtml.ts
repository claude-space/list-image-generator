import type { Browser } from "playwright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetches HTML with a two-stage strategy:
 *   1. Plain server-side fetch with browser-shaped headers (cheap, fast).
 *   2. If that fails or returns a bot-check page, fall back to Playwright
 *      (real Chromium, renders JS, defeats most basic bot blocks).
 *
 * Many publishers — including Valnet's network (ScreenRant/CBR/GameRant/etc.)
 * — sit behind Cloudflare and return 403/connection-resets to non-browser
 * fetches even with a spoofed UA. The Playwright path handles those.
 *
 * Browser instance is cached on globalThis so dev-mode module reloads don't
 * relaunch Chromium on every request.
 */
export async function fetchHtml(url: string): Promise<{ html: string; via: "fetch" | "playwright"; status: number }> {
  // Stage 1: plain fetch
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      if (looksLikeRealPage(html)) {
        return { html, via: "fetch", status: res.status };
      }
    }
  } catch {
    // fall through to playwright
  }

  // Stage 2: Playwright
  return await fetchViaPlaywright(url);
}

function looksLikeRealPage(html: string): boolean {
  // Cloudflare / Akamai / Distil challenge pages are all tiny and contain
  // these signatures. Real articles are 50KB+ of HTML.
  if (html.length < 5000) return false;
  const low = html.slice(0, 8000).toLowerCase();
  if (low.includes("just a moment")) return false;
  if (low.includes("cf-browser-verification")) return false;
  if (low.includes("checking your browser")) return false;
  if (low.includes("attention required") && low.includes("cloudflare")) return false;
  return true;
}

type Cached = { browser: Browser | null; promise: Promise<Browser> | null };
const g = globalThis as unknown as { __pwBrowser?: Cached };
if (!g.__pwBrowser) g.__pwBrowser = { browser: null, promise: null };

async function getBrowser(): Promise<Browser> {
  const cache = g.__pwBrowser!;
  if (cache.browser && cache.browser.isConnected()) return cache.browser;
  if (cache.promise) return cache.promise;
  cache.promise = (async () => {
    // Dynamic import keeps playwright out of the cold-start path when we
    // never actually need it.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    cache.browser = browser;
    browser.on("disconnected", () => {
      cache.browser = null;
      cache.promise = null;
    });
    return browser;
  })();
  return cache.promise;
}

async function fetchViaPlaywright(url: string): Promise<{ html: string; via: "playwright"; status: number }> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const html = await page.content();
    return { html, via: "playwright", status: resp?.status() ?? 0 };
  } finally {
    await context.close();
  }
}
