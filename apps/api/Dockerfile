# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Base stage
# ─────────────────────────────────────────────
#FROM node:20-bookworm-slim AS base
FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"

RUN npm install --global pnpm@8.15.0

WORKDIR /app


# ─────────────────────────────────────────────
# Dependency installation stage
# ─────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json

RUN pnpm install --frozen-lockfile


# ─────────────────────────────────────────────
# Application build stage
# ─────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
COPY packages/tsconfig ./packages/tsconfig

# Merge resolution: origin/main's approach is kept. It already copies all three
# node_modules trees in the builder stage above (root, apps/api and
# packages/shared-types), which is what makes the `@flacroncv/shared-types`
# workspace link resolvable — pnpm puts a `workspace:*` dep in the DEPENDENT
# package's own node_modules, never in the hoisted root. It also copies
# pnpm-lock.yaml and installs with --frozen-lockfile, so builds are reproducible.
#
# Only this guard is carried over from the other side. It is nearly free and
# turns a missing link into one clear line instead of a wall of TS2307s — or,
# worse, a green build that dies at boot, because the import is a VALUE import
# (dist/modules/auth/auth.controller.js contains require("@flacroncv/shared-types")).
RUN test -f apps/api/node_modules/@flacroncv/shared-types/package.json \
      || (echo "ERROR: apps/api/node_modules is missing the @flacroncv/shared-types workspace link" && exit 1)

RUN pnpm --filter @flacroncv/shared-types build
RUN pnpm --filter api build


# ─────────────────────────────────────────────
# Production runtime stage
# ─────────────────────────────────────────────
#FROM node:20-bookworm-slim AS runner
FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS runner

ENV NODE_ENV="production"
ENV PORT="4000"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        chromium \
        ca-certificates \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd \
        --system \
        --uid 1001 \
        --gid nodejs \
        --create-home \
        nestjs

# Merge resolution: origin/main's side kept — same set of paths, but with
# --chown=nestjs:nodejs so the files are owned by the non-root user the image
# runs as (USER nestjs below). apps/api/node_modules is included because
# `require("@flacroncv/shared-types")` resolves through it at runtime, not
# through the hoisted root.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared-types/package.json ./packages/shared-types/package.json

# The runtime equivalent of the builder guard: resolve the package exactly as
# `node apps/api/dist/main.js` will (its package.json main is ./dist/index.js,
# so this also proves the compiled output actually landed). Catches a partial
# copy at IMAGE BUILD time instead of as a MODULE_NOT_FOUND crash loop on Render.
RUN node -e "require.resolve('@flacroncv/shared-types', { paths: ['/app/apps/api'] })" \
      || (echo "ERROR: @flacroncv/shared-types does not resolve in the runtime image" && exit 1)

USER nestjs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
