# Written in item 20. Build from the repository root:
#   docker build -f apps/career-worker/Dockerfile -t flacroncv-worker .
# Health: node dist/main.js --check

FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.career.base.json ./
COPY apps/career-worker/package.json apps/career-worker/
COPY packages/career-server/package.json packages/career-server/
COPY packages/career-shared/package.json packages/career-shared/
RUN pnpm install --frozen-lockfile --filter career-worker...
COPY apps/career-worker apps/career-worker
COPY packages/career-server packages/career-server
COPY packages/career-shared packages/career-shared
RUN pnpm --filter career-worker build
RUN pnpm --filter career-worker deploy --prod /app
RUN cp -r apps/career-worker/dist /app/dist

FROM public.ecr.aws/docker/library/node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# AWS RDS requires TLS; pg verifies the server certificate (sslmode=verify-full),
# so trust the official RDS certificate bundle.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/rds-global-bundle.pem
COPY --from=build /app ./
CMD ["node", "dist/main.js"]
