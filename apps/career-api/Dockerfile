# Written in item 20. Build from the repository root:
#   docker build -f apps/career-api/Dockerfile -t flacroncv-career-api .
# Do not bake secrets into the image. Pass DATABASE_URL at run time.

FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.career.base.json ./
COPY apps/career-api/package.json apps/career-api/
COPY packages/career-server/package.json packages/career-server/
COPY packages/career-shared/package.json packages/career-shared/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile --filter career-api...
COPY apps/career-api apps/career-api
COPY packages/career-server packages/career-server
COPY packages/career-shared packages/career-shared
COPY packages/shared-types packages/shared-types
RUN pnpm --filter @flacroncv/shared-types build
RUN pnpm --filter career-api build
RUN pnpm --filter career-api deploy --prod /app
RUN cp -r apps/career-api/dist /app/dist

# One-off migration image (docker build --target migrate). Runs as an ECS task
# that receives DATABASE_URL from Secrets Manager, so nobody handles the
# database password. Migrations never run when the API starts.
FROM build AS migrate
WORKDIR /repo
# AWS RDS requires TLS; pg verifies the server certificate (sslmode=verify-full),
# so trust the official RDS certificate bundle.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/rds-global-bundle.pem
CMD ["pnpm", "--filter", "career-api", "migrate"]

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# AWS RDS requires TLS; pg verifies the server certificate (sslmode=verify-full),
# so trust the official RDS certificate bundle.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/rds-global-bundle.pem
COPY --from=build /app ./
EXPOSE 4101
CMD ["node", "dist/main.js"]
