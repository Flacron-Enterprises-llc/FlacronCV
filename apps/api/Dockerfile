FROM node:20-alpine AS base

RUN apk add --no-cache chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm install -g pnpm@8.15.0

WORKDIR /app

# ── deps: install without mobile (avoids Expo/RN bloat + file: dep resolution error)
FROM base AS deps
COPY .npmrc pnpm-workspace.yaml package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# No --frozen-lockfile: lockfile was generated with mobile; omitting it causes mismatch
RUN pnpm install

# ── builder: compile shared-types then api
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN node_modules/.bin/tsc -p packages/shared-types/tsconfig.json
RUN cd apps/api && /app/node_modules/.bin/nest build

# ── runner: production image (chromium for puppeteer PDF export)
FROM node:20-alpine AS runner

RUN apk add --no-cache chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json

USER nestjs

EXPOSE 10000

CMD ["node", "apps/api/dist/main.js"]
