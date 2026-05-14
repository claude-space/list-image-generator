import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactNode } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export type SlideKind = "cover" | "item" | "outro";

/**
 * Per-image focal point, in percentage coordinates (0–100). Maps directly to
 * CSS object-position. (50, 50) is centered (default).
 */
export type ImagePosition = { x: number; y: number };

export type RenderConfig = {
  kind: SlideKind;
  // Cover fields
  title?: string;
  subtitle?: string | null;
  siteName?: string | null;
  totalCount?: number;
  heroImageDataUrl?: string | null;
  // Item fields
  rank?: number | null;
  heading?: string;
  body?: string;
  itemImageDataUrl?: string | null;
  // Outro fields
  ctaText?: string;
  sourceUrl?: string;
  // Crop focus for whichever image this slide uses (hero or itemImage)
  imagePosition?: ImagePosition | null;
  // Branding
  accentColor: string;
  textColor: string;
  bgColor: string;
  logoDataUrl?: string | null;
  fontFamily: string;
};

let cachedFonts: { name: string; data: ArrayBuffer; weight: number }[] | null =
  null;

/**
 * Loads Inter Regular/Bold/Black from public/fonts. Bundled locally so renders
 * work offline and don't depend on a third-party CDN being up.
 *
 * We always render with Inter regardless of the source site's font — keeping
 * satori reliable matters more than perfect font matching. The site's font
 * name appears in the brand panel so the user knows what differs.
 */
async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const dir = path.join(process.cwd(), "public", "fonts");
  const weights = [400, 700, 900] as const;
  const fonts = await Promise.all(
    weights.map(async (w) => {
      const buf = await readFile(path.join(dir, `Inter-${w}.woff`));
      return {
        name: "Inter",
        weight: w as number,
        data: buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer,
      };
    }),
  );
  cachedFonts = fonts;
  return fonts;
}

export async function renderSlide(cfg: RenderConfig): Promise<Buffer> {
  const fonts = await loadFonts();
  const tree = buildTree(cfg);
  const svg = await satori(tree, {
    width: SLIDE_W,
    height: SLIDE_H,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight as 400 | 700 | 900,
      style: "normal",
    })),
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: SLIDE_W },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

function buildTree(cfg: RenderConfig): ReactNode {
  if (cfg.kind === "cover") return Cover(cfg);
  if (cfg.kind === "outro") return Outro(cfg);
  return Item(cfg);
}

// Visual size shared by logo + rank number so they look like a matched pair.
const CHIP_H = 72;

function Cover(cfg: RenderConfig) {
  return FullBleedSlide({
    image: cfg.heroImageDataUrl ?? null,
    topRank: null,
    cfg,
    bottom: [
      {
        type: "div",
        props: {
          style: {
            fontSize: clampFontSize(cfg.title ?? "", 104, 80, 60),
            fontWeight: 900,
            lineHeight: 1.02,
            letterSpacing: -1.5,
          },
          children: cfg.title ?? "",
        },
      },
      cfg.subtitle && {
        type: "div",
        props: {
          style: {
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.35,
            opacity: 0.9,
            maxWidth: 880,
          },
          children: truncate(cfg.subtitle, 180),
        },
      },
    ].filter(Boolean) as ReactNode[],
  });
}

function Item(cfg: RenderConfig) {
  return FullBleedSlide({
    image: cfg.itemImageDataUrl ?? null,
    topRank: null,
    cfg,
    bottom: [
      {
        type: "div",
        props: {
          style: {
            fontSize: clampFontSize(cfg.heading ?? "", 96, 76, 56),
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: -1.2,
          },
          children: cfg.heading ?? "",
        },
      },
      cfg.body && {
        type: "div",
        props: {
          style: {
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.4,
            opacity: 0.9,
            maxWidth: 880,
          },
          children: truncate(cfg.body, 200),
        },
      },
    ].filter(Boolean) as ReactNode[],
  });
}

/**
 * Shared layout for cover + item slides: image full-bleed background, optional
 * rank chip + logo overlaid top, all body content anchored in the bottom
 * third behind a dark gradient scrim. When no image is supplied, a diagonal
 * accent-color stripe fills the right half so the slide still feels composed.
 */
function FullBleedSlide(opts: {
  image: string | null;
  topRank: number | null;
  cfg: RenderConfig;
  bottom: ReactNode[];
}): ReactNode {
  const { image, topRank, cfg, bottom } = opts;
  const hasImage = !!image;
  const pos = cfg.imagePosition ?? { x: 50, y: 50 };

  const backdrop = hasImage
    ? {
        type: "img",
        props: {
          src: image,
          width: SLIDE_W,
          height: SLIDE_H,
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: SLIDE_W,
            height: SLIDE_H,
            objectFit: "cover",
            objectPosition: `${pos.x}% ${pos.y}%`,
          },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            position: "absolute",
            top: 0,
            right: 0,
            width: SLIDE_W * 0.55,
            height: SLIDE_H,
            backgroundColor: cfg.accentColor,
            display: "flex",
            transform: "skewX(-8deg) translateX(60px)",
            transformOrigin: "top right",
            opacity: 0.95,
          },
        },
      };

  const scrim = {
    type: "div",
    props: {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        background: hasImage
          ? "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.92) 100%)"
          : "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)",
        display: "flex",
      },
    },
  };

  return {
    type: "div",
    props: {
      style: {
        width: SLIDE_W,
        height: SLIDE_H,
        display: "flex",
        flexDirection: "column",
        backgroundColor: cfg.bgColor,
        color: "#fff",
        fontFamily: "Inter",
        position: "relative",
      },
      children: [
        backdrop,
        scrim,
        {
          type: "div",
          props: {
            style: {
              position: "relative",
              padding: "60px 70px 80px",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "space-between",
              color: "#fff",
            },
            children: [
              TopBar(cfg, { rank: topRank, onDark: true }),
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 22,
                  },
                  children: bottom,
                },
              },
            ],
          },
        },
      ],
    },
  } as ReactNode;
}

function Outro(cfg: RenderConfig) {
  return {
    type: "div",
    props: {
      style: {
        width: SLIDE_W,
        height: SLIDE_H,
        display: "flex",
        flexDirection: "column",
        backgroundColor: cfg.accentColor,
        color: "#fff",
        fontFamily: "Inter",
        padding: "60px 70px 80px",
        justifyContent: "space-between",
      },
      children: [
        TopBar(cfg, { rank: null, onDark: true }),
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 24,
            },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 80, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 },
                  children: cfg.ctaText ?? "Read the full article",
                },
              },
              cfg.siteName && {
                type: "div",
                props: {
                  style: { fontSize: 36, opacity: 0.9 },
                  children: cfg.siteName,
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  } as ReactNode;
}

/**
 * Top bar: rank chip on the left, logo on the right. Both are sized to CHIP_H
 * so they read as a balanced pair — the rank number is the same visual weight
 * as the logo, not a giant number competing with it.
 *
 * On the cover and outro slides there's no rank, so the left side is an
 * invisible spacer that keeps the logo pinned to the top-right.
 */
function TopBar(
  cfg: RenderConfig,
  opts: { rank: number | null; onDark: boolean },
) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: CHIP_H,
      },
      children: [
        opts.rank != null
          ? RankChip(cfg, opts.rank, opts.onDark)
          : {
              type: "div",
              props: { style: { display: "flex", width: 1, height: CHIP_H } },
            },
        Logo(cfg, opts.onDark),
      ],
    },
  };
}

function RankChip(cfg: RenderConfig, rank: number, onDark: boolean) {
  // Use a circular badge in the accent color — square-ish so it visually
  // matches the logo footprint regardless of whether the logo is wide or square.
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: CHIP_H,
        minWidth: CHIP_H,
        padding: "0 18px",
        borderRadius: CHIP_H / 2,
        backgroundColor: cfg.accentColor,
        color: "#fff",
        fontSize: 38,
        fontWeight: 900,
        letterSpacing: -0.5,
      },
      children: `${rank}`,
    },
  };
}

function Logo(cfg: RenderConfig, onDark: boolean) {
  if (cfg.logoDataUrl) {
    // satori does not support width:"auto" on <img>; both dims must be numeric.
    // We wrap the image in a fixed-size flex box and let objectFit:contain
    // scale the actual logo (whether square favicon or wide wordmark) inside.
    return {
      type: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          width: 260,
          height: CHIP_H,
        },
        children: [
          {
            type: "img",
            props: {
              src: cfg.logoDataUrl,
              width: 260,
              height: CHIP_H,
              style: {
                width: 260,
                height: CHIP_H,
                objectFit: "contain",
                objectPosition: "right center",
              },
            },
          },
        ],
      },
    };
  }
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        height: CHIP_H,
        fontSize: 32,
        fontWeight: 700,
        color: onDark ? "#fff" : cfg.accentColor,
        textTransform: "uppercase",
        letterSpacing: 2,
      },
      children: cfg.siteName ?? "",
    },
  };
}

function isDark(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length !== 6) return true;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

function clampFontSize(text: string, large: number, mid: number, small: number) {
  const len = text.length;
  if (len < 30) return large;
  if (len < 70) return mid;
  return small;
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

export async function urlToDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: {
        // Bot-protected publishers (Cloudflare-fronted Valnet sites, etc.)
        // reject bare UAs on image endpoints just like they do on HTML.
        // Send a full browser header set so image hotlinks actually resolve.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        // satori only renders PNG/JPEG reliably; AVIF/WebP/SVG cause failures.
        // Ordering matters — content-negotiating CDNs serve the first format
        // they support that we'll accept.
        Accept: "image/png,image/jpeg;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        Referer: new URL(url).origin + "/",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      sniffMime(buf) ||
      "image/png";
    if (
      mime === "image/svg+xml" ||
      mime === "image/svg" ||
      mime === "image/avif" ||
      mime === "image/webp"
    ) {
      // satori can't render these. Some CDNs ignore the Accept header and
      // serve modern formats anyway, so we double-check the response and
      // drop the image rather than crashing the whole slide.
      return null;
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF") return "image/webp";
  return null;
}
