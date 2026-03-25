FROM node:20-alpine AS base

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

# ── builder: compile shared-types then web
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

ENV NEXT_TELEMETRY_DISABLED=1

RUN node_modules/.bin/tsc -p packages/shared-types/tsconfig.json
RUN cd apps/web && /app/node_modules/.bin/next build

# ── runner: standalone Next.js (only traced production deps, no node_modules bloat)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone output already contains its own minimal node_modules
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 10000

CMD ["node", "apps/web/server.js"]
