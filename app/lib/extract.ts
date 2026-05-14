import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { fetchHtml } from "./fetchHtml";
import { dominantAccentFromImage, fetchImageWithBytes } from "./extractColor";

export type Branding = {
  domain: string;
  siteName: string | null;
  logoUrl: string | null;
  logoDataUrl: string | null;
  faviconUrl: string | null;
  themeColor: string | null;
  accentColor: string | null;
  accentSource: "logo" | "theme-color" | "css" | "default";
  fontFamily: string | null;
};

export type ListItem = {
  rank: number | null;
  heading: string;
  body: string;
  imageUrl: string | null;
};

export type ExtractResult = {
  url: string;
  title: string;
  subtitle: string | null;
  heroImageUrl: string | null;
  items: ListItem[];
  branding: Branding;
};

export async function extractArticle(url: string): Promise<ExtractResult & { fetchedVia: "fetch" | "playwright" }> {
  const { html, via, status } = await fetchHtml(url);
  if (status >= 400) {
    throw new Error(`Page returned HTTP ${status}. Check the URL.`);
  }
  const $ = cheerio.load(html);
  const base = new URL(url);

  // Branding first — logo sniffing depends on <header> being present.
  const branding = extractBranding($, base);

  // Then strip page chrome so headings inside nav/footer never get picked up
  // as list items. Keep <article>-nested <header> (article hero) by scoping
  // the page-chrome strip to direct body children + role markers.
  $("body > nav, body > header, body > footer, body > aside").remove();
  $(
    "nav, aside, footer, [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary'], .site-nav, .navbar, .site-menu, .site-header, .site-footer, .sidebar, script, style, noscript",
  ).remove();

  const title = extractTitle($);
  const subtitle = extractSubtitle($);
  const heroImageUrl = extractHero($, base);
  const items = extractListItems($, base);

  // Pull the logo bytes once, derive the brand accent from it, and embed it
  // as a data URL so the renderer doesn't have to refetch (which would hit
  // the same Cloudflare friction we already navigated to get here).
  await enrichBrandingFromLogo(branding);

  return { url, title, subtitle, heroImageUrl, items, branding, fetchedVia: via };
}

async function enrichBrandingFromLogo(branding: Branding): Promise<void> {
  if (!branding.logoUrl) return;
  const img = await fetchImageWithBytes(branding.logoUrl);
  if (!img) return;
  branding.logoDataUrl = img.dataUrl;
  const sampled = await dominantAccentFromImage(img.buffer);
  if (sampled) {
    // Logo color wins over theme-color / CSS sniff. The user can still override
    // in the brand panel, but the auto-pick now matches "what the logo looks
    // like" rather than whatever <meta theme-color> happened to be set to.
    branding.accentColor = sampled;
    branding.accentSource = "logo";
  }
}

function abs(href: string | undefined, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractTitle($: cheerio.CheerioAPI): string {
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  const og = $('meta[property="og:title"]').attr("content")?.trim();
  if (og) return og;
  return $("title").text().trim() || "Untitled";
}

function extractSubtitle($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content"),
    $(".article-header__deck").text(),
    $(".deck").first().text(),
    $("h2.subtitle").first().text(),
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && v.length > 10) return v;
  }
  return null;
}

function extractHero($: cheerio.CheerioAPI, base: URL): string | null {
  const og = $('meta[property="og:image"]').attr("content");
  if (og) return abs(og, base);
  const twitter = $('meta[name="twitter:image"]').attr("content");
  if (twitter) return abs(twitter, base);
  const firstImg = $("article img, main img").first().attr("src");
  return abs(firstImg, base);
}

function extractBranding($: cheerio.CheerioAPI, base: URL): Branding {
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    $('meta[name="application-name"]').attr("content")?.trim() ||
    base.hostname.replace(/^www\./, "");

  const themeColor =
    $('meta[name="theme-color"]').attr("content")?.trim() || null;

  // Prefer the on-page wordmark / header logo over apple-touch-icon, because
  // the on-page asset carries the brand's actual colors. Specific class names
  // and alt-text matches outrank generic "first img in header" — that catches
  // network/CMS icons (e.g. Valnet's master-brand mark) that sit above the
  // actual brand wordmark in the DOM.
  const siteHostStem = base.hostname
    .replace(/^www\./, "")
    .split(".")[0]
    .toLowerCase();
  const logoCandidates = [
    $('.header-logo img, [class*="site-logo"] img, [class*="brand-logo"] img')
      .first()
      .attr("src"),
    $(`img[alt*="${siteName}" i][alt*="logo" i]`).first().attr("src"),
    $('img[alt*="logo" i]').first().attr("src"),
    $('img[class*="logo" i]').first().attr("src"),
    $('a[class*="logo" i] img').first().attr("src"),
    $('header img').first().attr("src"),
    $('meta[property="og:logo"]').attr("content"),
    $('link[rel="apple-touch-icon"]').attr("href"),
    $('link[rel="apple-touch-icon-precomposed"]').attr("href"),
  ];
  // Reject candidates whose path looks like a parent/network mark rather than
  // the site's own brand. The site's logo asset usually carries the domain
  // stem (`tg-logo` for thegamer.com, `sr-logo` for screenrant.com).
  const logoUrl =
    logoCandidates
      .map((c) => abs(c, base))
      .find((c) => {
        if (!c) return false;
        const low = c.toLowerCase();
        if (siteHostStem && low.includes(`${siteHostStem}-logo`)) return true;
        if (siteHostStem && low.includes(`/${siteHostStem}`)) return true;
        // Filter generic network/CMS icons by name
        if (/valnet[-_]?(logo|icon|brand)/i.test(low)) return false;
        return true;
      }) ?? null;

  const faviconUrl =
    abs($('link[rel="icon"]').attr("href"), base) ||
    abs($('link[rel="shortcut icon"]').attr("href"), base) ||
    abs("/favicon.ico", base);

  const fontFamily = sniffFont($);

  // Accent: provisional — `enrichBrandingFromLogo()` later overrides this with
  // the actual dominant color sampled from the logo image, when one is found.
  const cssAccent = sniffAccent($);
  const accentColor = themeColor ?? cssAccent ?? null;
  const accentSource: Branding["accentSource"] = themeColor
    ? "theme-color"
    : cssAccent
      ? "css"
      : "default";

  return {
    domain: base.hostname,
    siteName,
    logoUrl,
    logoDataUrl: null,
    faviconUrl,
    themeColor,
    accentColor,
    accentSource,
    fontFamily,
  };
}

function sniffFont($: cheerio.CheerioAPI): string | null {
  // Look in <link href="fonts.googleapis.com/css?family=..."> first
  const gf = $('link[href*="fonts.googleapis.com"]').attr("href");
  if (gf) {
    const m = gf.match(/family=([^&:]+)/);
    if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  }
  // Inline @font-face / body font-family
  const styleText = $("style").text();
  const m = styleText.match(/body\s*\{[^}]*font-family\s*:\s*([^;}]+)/i);
  if (m) {
    return m[1]
      .split(",")[0]
      .replace(/['"]/g, "")
      .trim();
  }
  return null;
}

function sniffAccent($: cheerio.CheerioAPI): string | null {
  const styleText = $("style").text();
  const m = styleText.match(
    /(?:--brand|--accent|--primary)[^:]*:\s*(#[0-9a-f]{3,8})/i,
  );
  return m ? m[1] : null;
}

/**
 * Listicle item extraction.
 *
 * Listicles vary wildly. Strategy in order of preference:
 *   1) Headings inside the article body that look like rank entries
 *      (e.g. start with "1.", "1 ", "#1", "10:") — most modern publishers
 *      including Valnet sites use h2/h3 per entry.
 *   2) Any h2/h3 inside the article body, if there are >=4 of them and they
 *      aren't section dividers ("Related", "About the author", etc.).
 *   3) <ol>/<ul> with substantive items, as a last resort.
 *
 * The "body" for each item is the prose following its heading up to the next
 * heading (or a sensible cap).
 */
function extractListItems(
  $: cheerio.CheerioAPI,
  base: URL,
): ListItem[] {
  const root = pickArticleRoot($);
  if (!root) return [];

  const headings = root.find("h2, h3").toArray();
  const ranked: { el: Element; rank: number; clean: string }[] = [];
  const unranked: { el: Element; clean: string }[] = [];

  for (const el of headings) {
    const txt = $(el).text().trim().replace(/\s+/g, " ");
    if (!txt || txt.length < 3) continue;
    if (isJunkHeading(txt)) continue;
    const rankMatch = txt.match(/^#?\s*(\d{1,3})\s*[.:)\-–]\s*(.+)$/);
    if (rankMatch) {
      ranked.push({
        el,
        rank: parseInt(rankMatch[1], 10),
        clean: rankMatch[2].trim(),
      });
    } else {
      unranked.push({ el, clean: txt });
    }
  }

  // Prefer ranked entries if there are at least 3
  const headingsToUse =
    ranked.length >= 3
      ? ranked.map((r) => ({ el: r.el, rank: r.rank, heading: r.clean }))
      : unranked.length >= 4
        ? unranked.map((u, i) => ({ el: u.el, rank: i + 1, heading: u.clean }))
        : [];

  if (headingsToUse.length > 0) {
    return headingsToUse.map((h) => ({
      rank: h.rank,
      heading: h.heading,
      body: bodyAfter($, h.el),
      imageUrl: imageNear($, h.el, base),
    }));
  }

  // Fallback: ol/ul list
  const ol = root.find("ol li, ul li").toArray();
  if (ol.length >= 4) {
    return ol
      .map((el, i) => {
        const txt = $(el).text().trim().replace(/\s+/g, " ");
        if (!txt) return null;
        // First sentence as heading, rest as body
        const split = txt.match(/^(.{8,120}?[.!?])\s+(.+)$/);
        return {
          rank: i + 1,
          heading: split ? split[1] : txt.slice(0, 100),
          body: split ? split[2] : "",
          imageUrl: null,
        } as ListItem;
      })
      .filter((x): x is ListItem => !!x);
  }

  return [];
}

function pickArticleRoot($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> | null {
  const candidates = [
    "article",
    "main article",
    '[itemprop="articleBody"]',
    ".article-body",
    ".entry-content",
    ".post-content",
    "main",
  ];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el;
  }
  return $("body").first().length ? $("body").first() : null;
}

function isJunkHeading(txt: string): boolean {
  const low = txt.toLowerCase();
  return /^(related|recommended|read (more|also|next)|about the author|sources?|see also|share this|advertisement|sign up|newsletter|trending|popular|table of contents)/i.test(
    low,
  );
}

function bodyAfter(
  $: cheerio.CheerioAPI,
  el: Element,
): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let chars = 0;
  while (node) {
    const next: Element | undefined = (node as any).nextSibling;
    if (!next) break;
    node = next;
    const tag = (node as any).tagName?.toLowerCase?.();
    if (tag === "h1" || tag === "h2" || tag === "h3") break;
    if (tag === "p" || tag === "div" || tag === "ul" || tag === "ol" || tag === "blockquote") {
      const t = $(node).text().trim().replace(/\s+/g, " ");
      if (t) {
        parts.push(t);
        chars += t.length;
        if (chars > 600) break;
      }
    }
  }
  return parts.join(" ").slice(0, 600);
}

function imageNear(
  $: cheerio.CheerioAPI,
  el: Element,
  base: URL,
): string | null {
  // First image after this heading, before next heading
  let node: Element | null = el;
  for (let i = 0; i < 30 && node; i++) {
    const next: Element | undefined = (node as any).nextSibling;
    if (!next) break;
    node = next;
    const tag = (node as any).tagName?.toLowerCase?.();
    if (tag === "h1" || tag === "h2" || tag === "h3") break;
    const img = $(node).find("img").first().attr("src") || $(node).attr("src");
    if (img && tag === "img") return abs(img, base);
    if (img) return abs(img, base);
  }
  return null;
}
