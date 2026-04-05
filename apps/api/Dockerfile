# ─── Lynx API — Dockerfile ────────────────────────────────────────────────────
#
# Multi-stage build:
#   builder  → full monorepo build (turbo: core → monitor → api)
#              then `pnpm deploy` to produce a self-contained deployment dir
#              where workspace packages are COPIED (not symlinked) into
#              node_modules — so the runtime image needs no pnpm at all.
#   runtime  → lean Node 20 alpine; just the deploy dir + distroless user.
#
# Why pnpm deploy?
#   pnpm workspace node_modules use symlinks pointing to absolute builder
#   paths. Copying them to a differently-rooted runtime image breaks all
#   workspace imports. `pnpm deploy` resolves workspace packages and copies
#   them as real directories — making the result portable.
#
# Ollama is NOT containerised — it must run on the host (for GPU access).
# Set OLLAMA_BASE_URL=http://host.docker.internal:11434 (done in compose).

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm@9 --quiet

# Layer-cache: manifests first, then lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/core/package.json        ./packages/core/
COPY packages/monitor/package.json     ./packages/monitor/
COPY apps/api/package.json             ./apps/api/

RUN pnpm install --frozen-lockfile

# Copy all source needed for the build
COPY tsconfig.json ./
COPY packages/core/src           ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/monitor/src        ./packages/monitor/src
COPY packages/monitor/tsconfig.json ./packages/monitor/
COPY apps/api/src                ./apps/api/src
COPY apps/api/tsconfig.json      ./apps/api/
COPY apps/api/tsup.config.ts     ./apps/api/

# Build core → monitor → api (turbo handles dep order)
RUN pnpm turbo build --filter @lynx/api...

# Deploy: copies apps/api + all prod deps into /deploy.
# Workspace packages (@lynx/core, @lynx/monitor) are resolved and copied
# as real directories — no symlinks, fully portable.
RUN pnpm --filter @lynx/api deploy --prod /deploy

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# The /deploy directory is self-contained:
#   /deploy/dist/           ← built API
#   /deploy/node_modules/   ← all prod deps (workspace pkgs as real dirs)
COPY --from=builder /deploy ./

# Non-root user
RUN addgroup -g 1001 -S lynx && adduser -S lynx -u 1001 -G lynx
RUN chown -R lynx:lynx /app
USER lynx

EXPOSE 4747

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4747/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
