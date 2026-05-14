# syntax=docker/dockerfile:1.7
# ---- builder ---------------------------------------------------------------
# Compiles the Next.js app. Native modules (sharp, @resvg/resvg-js) are
# installed against the same Debian + glibc as the runtime image below.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# System deps needed for native module prebuilds + Sharp.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

RUN npm run build

# ---- runtime --------------------------------------------------------------
# Runs the production server. We install Chromium and its OS deps for the
# Playwright fallback used to fetch bot-protected listicles.
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Minimal Chromium runtime deps. (We can't use Playwright's all-in-one base
# image because we need glibc compatibility with the builder for native modules.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget gnupg fonts-liberation \
    libgbm1 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libasound2 \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Install Chromium for Playwright. Stored under PLAYWRIGHT_BROWSERS_PATH so it
# survives container rebuilds in some envs and so `npx playwright` finds it.
RUN npx playwright install chromium

EXPOSE 3000

# `next start` honors PORT + HOSTNAME for Render's port forwarding.
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
