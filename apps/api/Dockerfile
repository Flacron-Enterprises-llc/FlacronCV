# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Base stage
# ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"

RUN npm install --global pnpm@11.13.0

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

RUN pnpm --filter @flacroncv/shared-types build
RUN pnpm --filter api build


# ─────────────────────────────────────────────
# Production runtime stage
# ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

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

COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared-types/package.json ./packages/shared-types/package.json

USER nestjs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
