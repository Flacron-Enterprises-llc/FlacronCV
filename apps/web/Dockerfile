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
# on the ECS task definition only affects the runtime process, which is too late
# — the browser JavaScript has already been compiled with whatever was present
# during `next build`.
#
# Previously nothing supplied them here. `.env` is gitignored AND excluded by
# .dockerignore, so the build context has none either, and every
# `process.env.NEXT_PUBLIC_*` compiled to `undefined`: no Firebase config (auth
# cannot initialise), no API URL (every request goes nowhere). Docker does not
# inherit the host environment, so each value must be declared as an ARG and
# promoted to ENV before the build runs.
#
# THE LIVE PIPELINE IS AWS: CodeBuild (buildspec-web.yml) → ECR → ECS. These
# values come from the CodeBuild project's environment variables. render.yaml is
# a dormant reference file that nothing in the AWS path reads — editing it does
# not change any build. Keep this ARG list in sync with buildspec-web.yml.
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

# Fail the BUILD, not the first user request, when a value the app cannot
# function without is missing. A silently misconfigured bundle looks like a
# successful deploy and breaks only in the browser.
#
# This used to guard NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_API_URL only —
# two of the ten. That is precisely the wrong two-thirds to leave open: the
# production console reported NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
# NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_APP_ID missing, and
# none of them was checked, so a build with only the API key set produced a
# green pipeline and an unusable sign-in page.
#
# One RUN, not eight, so a misconfigured pipeline is fixed in ONE round trip:
# every missing name is listed at once instead of surfacing the next one only
# after another full build. Names only — never a value.
RUN missing=""; \
    [ -n "$NEXT_PUBLIC_API_URL" ]                        || missing="$missing NEXT_PUBLIC_API_URL"; \
    [ -n "$NEXT_PUBLIC_SITE_URL" ]                       || missing="$missing NEXT_PUBLIC_SITE_URL"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_API_KEY" ]               || missing="$missing NEXT_PUBLIC_FIREBASE_API_KEY"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" ]           || missing="$missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_PROJECT_ID" ]            || missing="$missing NEXT_PUBLIC_FIREBASE_PROJECT_ID"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" ]        || missing="$missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" ]   || missing="$missing NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"; \
    [ -n "$NEXT_PUBLIC_FIREBASE_APP_ID" ]                || missing="$missing NEXT_PUBLIC_FIREBASE_APP_ID"; \
    if [ -n "$missing" ]; then \
      echo "ERROR: these --build-arg values are empty or were never passed:$missing"; \
      echo "next build INLINES NEXT_PUBLIC_* into the browser bundle, so supplying them to the"; \
      echo "running container (ECS task definition, docker run --env) has NO effect. They must be"; \
      echo "passed to 'docker build' as --build-arg. See buildspec-web.yml for the full command."; \
      exit 1; \
    fi; \
    echo "All 8 required NEXT_PUBLIC_* build args are present (values intentionally not printed)."

RUN node_modules/.bin/tsc -p packages/shared-types/tsconfig.json
RUN cd apps/web && /app/node_modules/.bin/next build

# Proving the values were SET is not the same as proving they were INLINED, and
# only the second one is what the browser depends on. The check above cannot
# catch a variable the app stopped reading, a `process.env[name]` lookup webpack
# cannot statically replace, or ARGs declared in the wrong stage — all of which
# still yield `undefined` in the bundle from a build whose environment looked
# perfect. This reads the emitted chunks and fails here, so a bundle without
# Firebase config can never become an image at all — not merely "an image we
# decline to push". It prints names and match counts, never values.
RUN node apps/web/scripts/verify-public-env.mjs

# Which commit is actually serving? Fetch https://<host>/build-info.json.
#
# "Deployed successfully but the browser still shows the old error" is otherwise
# unfalsifiable from the outside — a stale CloudFront/browser copy of the HTML
# and a genuinely stale image look identical. Both ARGs default, so a caller
# that does not pass them (the current CodeBuild command, docker-compose, a
# local build) still builds normally.
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
RUN printf '{"sha":"%s","builtAt":"%s","firebaseInlined":true}\n' \
      "$BUILD_SHA" "$BUILD_TIME" > apps/web/public/build-info.json

# ── runner: standalone Next.js (only traced production deps, no node_modules bloat)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
# MUST match EXPOSE below and the ECS task definition's containerPort.
#
# The standalone server Next generates binds `parseInt(process.env.PORT,10) || 3000`.
# With no PORT set it therefore listened on 3000 while this image advertised
# 10000, so an ECS target group pointing at 10000 would have failed every health
# check with connection refused — a green build that never serves traffic.
ENV PORT=10000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone output already contains its own minimal node_modules
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Carried into the runtime image so the SHIPPED artefact can be re-verified from
# outside, which catches a different failure than the builder-stage run: that
# the three COPYs above put .next/static somewhere the server does not serve
# from. buildspec-web.yml runs it against this image before pushing. A few KB of
# ES module, no dependencies, no effect at runtime — nothing executes it unless
# the entrypoint is overridden.
COPY --from=builder /app/apps/web/scripts/verify-public-env.mjs ./apps/web/scripts/verify-public-env.mjs

USER nextjs

EXPOSE 10000

CMD ["node", "apps/web/server.js"]
