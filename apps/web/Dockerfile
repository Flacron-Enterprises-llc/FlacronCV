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

# See the API Dockerfile for the full explanation: pnpm puts a `workspace:*`
# link in the dependent package's own node_modules, and copying only
# /app/node_modules left @flacroncv/shared-types unresolvable, so `next build`
# below could never succeed.
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Fail fast on a broken layout rather than after a long compile. This directory
# holds the symlinks for every direct dependency of the web app — next, react,
# firebase, @tanstack — not only the workspace package.
RUN test -f apps/web/node_modules/@flacroncv/shared-types/package.json \
      || (echo "ERROR: apps/web/node_modules is missing the @flacroncv/shared-types workspace link" && exit 1)

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* is INLINED INTO THE CLIENT BUNDLE AT BUILD TIME. Setting these
# on the Render service only affects the runtime process, which is too late —
# the browser JavaScript has already been compiled with whatever was present
# during `next build`.
#
# Previously nothing supplied them here. `.env` is gitignored, so Render's build
# context has none either, and every `process.env.NEXT_PUBLIC_*` compiled to
# `undefined`: no Firebase config (auth cannot initialise), no API URL (every
# request goes nowhere). Docker does not inherit the host environment, so each
# value must be declared as an ARG and promoted to ENV before the build runs,
# and passed from render.yaml.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID
ARG NEXT_PUBLIC_ANALYTICS_PROVIDER

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID \
    NEXT_PUBLIC_ANALYTICS_PROVIDER=$NEXT_PUBLIC_ANALYTICS_PROVIDER

# Fail the BUILD, not the first user request, when the two values without which
# the app cannot function are missing. A silently misconfigured bundle looks
# like a successful deploy and breaks only in the browser.
RUN test -n "$NEXT_PUBLIC_FIREBASE_API_KEY" || (echo "ERROR: NEXT_PUBLIC_FIREBASE_API_KEY build arg is required" && exit 1)
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "ERROR: NEXT_PUBLIC_API_URL build arg is required" && exit 1)

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
