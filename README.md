# Listicle → Instagram

Paste a list-article URL, get a 1080×1350 Instagram carousel that matches the source site's branding.

## Running it (the way you'll actually use it)

Double-click **`start.bat`**.

A console window opens, the server starts, and your default browser opens to `http://localhost:3000`. Keep the console window open while you're using the app — closing it shuts down the server.

The first launch installs dependencies and downloads Chromium (~150MB, one-time). Subsequent launches start in about a second.

You can pin `start.bat` to the taskbar, send it to the desktop as a shortcut, or change its icon — same as any other launcher.

## What it does

1. **URL → article** — fetches the page with browser-shaped headers, falls back to a headless Chromium (Playwright) if Cloudflare blocks the plain fetch
2. **Pulls list items + branding** — title, list entries (numbered h2/h3, ranked lists, or `<ol>` items), hero image, site logo, dominant brand color sampled from the logo
3. **Lets you edit** — title, items, brand color, logo upload, focal point on each image (click anywhere on the small crop preview to retarget)
4. **Renders the carousel** — cover + one slide per item + summary + outro, all 1080×1350 PNGs zipped for download
5. **Generates Facebook copy** — three on-brand post variants via Claude (you supply your own Anthropic API key)

## Manual mode

If you'd rather just run the dev or production server directly:

```sh
npm install                        # one-time
npx playwright install chromium    # one-time
npm run dev                        # development (hot reload)
npm run build && npm start         # production
```

## Deploying to shellagent.io

The app deploys to a shellagent.io GCP VM via SSH + PM2. The `deploy-to-vm`
skill in the parent agent folder handles git pull, build, and PM2 restart.

**First-time setup** (per VM, one time):

```bash
ssh -i ~/.ssh/<key> trevor@shellagent.io \
  "git clone <repo> ~/list-image-generator && \
   cd ~/list-image-generator && \
   npm install && \
   npx playwright install --with-deps chromium"
```

**Subsequent deploys** (after each git push):

```bash
ssh -i ~/.ssh/<key> trevor@shellagent.io \
  "cd ~/list-image-generator && \
   git pull origin main && \
   npm install --production && \
   BASE_PATH=/trevor-ford/list-image-generator npm run build && \
   pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js"
```

Your app lands at `https://shellagent.io/trevor-ford/list-image-generator/`.

### Access control

The app has no built-in auth — anyone who can reach the URL can use it. If
you need to restrict access, do it at the deployment layer:

- Cloudflare Access in front of the service
- Company VPN / Tailscale
- shellagent.io's per-user URL prefix already provides some obscurity

## Project layout

- `app/page.tsx` — the UI
- `app/api/extract/route.ts` — POST a URL, returns parsed article + branding
- `app/api/render/route.ts` — POST slide configs, returns ZIP of PNGs (or single PNG)
- `app/lib/extract.ts` — listicle parser; strips nav/footer chrome before scanning
- `app/lib/render.ts` — satori cover/item/summary/outro layouts, Inter font, image positioning
- `app/lib/extractColor.ts` — sharp-based dominant-color extractor for logos (incl. SVG rasterization)
- `app/lib/fetchHtml.ts` — two-stage fetch (plain → Playwright fallback)
- `app/lib/rateLimit.ts` — in-memory per-IP throttle on /api/extract + /api/render
- `app/lib/ai/social-copy.ts` — Anthropic SDK call for Facebook copy variants
- `public/fonts/` — bundled Inter Regular/Bold/Black for satori
