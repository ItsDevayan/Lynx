# ─── Lynx Dashboard — Dockerfile ──────────────────────────────────────────────
#
# Multi-stage build:
#   builder  → Vite production build (React + Framer Motion)
#   runtime  → nginx:alpine serving the static bundle
#
# nginx proxies /api/* and /ws to the API container.
# SPA routing: all 404s fall back to index.html.

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm@9 --quiet

# Layer-cache: manifests first
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/core/package.json    ./packages/core/
COPY packages/monitor/package.json ./packages/monitor/
COPY apps/dashboard/package.json   ./apps/dashboard/

RUN pnpm install --frozen-lockfile

# Copy source (dashboard only needs core types, not monitor)
COPY tsconfig.json ./
COPY packages/core/src           ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY apps/dashboard/src          ./apps/dashboard/src
COPY apps/dashboard/index.html   ./apps/dashboard/
COPY apps/dashboard/vite.config.ts     ./apps/dashboard/
COPY apps/dashboard/tsconfig.json      ./apps/dashboard/
COPY apps/dashboard/tailwind.config.js ./apps/dashboard/
COPY apps/dashboard/postcss.config.js  ./apps/dashboard/

# Build (vite build)
RUN pnpm --filter @lynx/dashboard build

# ─── Stage 2: nginx runtime ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config (injected at build time or via mount)
COPY infra/docker/nginx.conf /etc/nginx/conf.d/lynx.conf

# Copy Vite build output
COPY --from=builder /workspace/apps/dashboard/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
