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

# pnpm places a `workspace:*` dependency as a symlink in the DEPENDENT package's
# own node_modules, never in the hoisted root — verified on this repo:
# `apps/api/node_modules/@flacroncv/shared-types -> packages/shared-types`
# exists while `node_modules/@flacroncv` does not (shamefully-hoist=true hoists
# the virtual store, not workspace links).
#
# Copying only /app/node_modules therefore left `@flacroncv/shared-types`
# unresolvable: `nest build` below failed with TS2307 across the ~51 source
# files that import it. It is a VALUE import, not type-only — the emitted
# dist/modules/auth/auth.controller.js contains require("@flacroncv/shared-types")
# — so even a forced build would die at boot with MODULE_NOT_FOUND.
#
# This is why the API image could never be produced. Copy the per-package link
# tree too, after the source copy so it is not shadowed.
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Prove the layout before spending time compiling. Without this a broken copy
# surfaces as a wall of TS2307s (or, worse, a green build that dies at boot),
# and it is not obvious that the cause is a missing directory rather than the
# source. apps/api/node_modules holds the symlinks for EVERY direct dependency
# of the API — @nestjs, firebase-admin, stripe, puppeteer, @aws-sdk — not just
# the workspace package, so losing it breaks far more than shared-types.
RUN test -f apps/api/node_modules/@flacroncv/shared-types/package.json \
      || (echo "ERROR: apps/api/node_modules is missing the @flacroncv/shared-types workspace link" && exit 1)

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
# Same reason as the builder stage: `require("@flacroncv/shared-types")` at
# runtime resolves through apps/api/node_modules, not the hoisted root. The
# symlink target (packages/shared-types + its dist) is copied just below.
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json

# The runtime equivalent of the builder guard: resolve the package exactly as
# `node apps/api/dist/main.js` will (its package.json main is ./dist/index.js,
# so this also proves the compiled output actually landed). Catches a partial
# copy at IMAGE BUILD time instead of as a MODULE_NOT_FOUND crash loop on Render.
RUN node -e "require.resolve('@flacroncv/shared-types', { paths: ['/app/apps/api'] })" \
      || (echo "ERROR: @flacroncv/shared-types does not resolve in the runtime image" && exit 1)

USER nestjs

EXPOSE 10000

CMD ["node", "apps/api/dist/main.js"]
