# FlacronCV — Deployment & Operations

> **Purpose.** The real deployment path, how to verify it, and the traps that have already cost hours.
> Infrastructure state is from operator verification on **2026-08-16**; everything attributed to a file
> in this repo was read on **2026-08-18**. Claims marked **⚠️ UNVERIFIED** were not confirmed against
> the running system by this pass — it was read-only, with no AWS, Stripe, Firebase or `gcloud` command
> run and no service contacted.
>
> **Never put a secret value in this file.** Names only.

Created: 2026-08-18

---

## 1. Live topology

| Layer | What | Where |
|---|---|---|
| DNS | Hostinger. `flacroncv.com` **and** `www.flacroncv.com` both point at the Amplify CloudFront distribution. Apex redirects to `https://www.flacroncv.com` | ⚠️ UNVERIFIED (operator-reported) |
| Frontend | AWS Amplify, app `FlacronCV`, branch `main`, auto-deploys on push | ⚠️ UNVERIFIED (operator-reported) — **see §3, there is a second frontend path in this repo** |
| Backend | ECS Fargate — cluster `flacroncv-production`, service `flacroncv-api`, container port **4000** | `us-east-1` |
| Load balancer | ALB `flacroncv-alb`, fronting `https://api.flacroncv.com` | `us-east-1` |
| Images | ECR repo `flacroncv-api`, tagged with the **12-char commit SHA** | `buildspec-api.yml:15` |
| Pipeline | CodePipeline `flacroncv-api-pipeline`: GitHub `main` push → CodeBuild `flacroncv-api-build` → ECS deploy | ⚠️ UNVERIFIED (operator-reported) |
| Data | Firestore, Firebase Auth, Firebase Storage — project `flacron-cv` | |

**Health check:** the ALB must target **`/health`**, not `/api/v1/health`. The route is mounted on the
raw HTTP adapter outside the global prefix (`apps/api/src/main.ts:143`) precisely so the load balancer
can reach it. **`/api/v1/health` returning 404 is correct behaviour — do not "fix" it.**

---

## 2. Backend deploy — the live path

Push to `main` → CodePipeline → CodeBuild (`buildspec-api.yml`) → ECS. **Fully automatic. Do not
hand-edit task definitions.**

What `buildspec-api.yml` does: logs in to ECR; sets `IMAGE_TAG` to the first 12 characters of
`CODEBUILD_RESOLVED_SOURCE_VERSION` (falling back to a `manual-<timestamp>` tag); builds
`apps/api/Dockerfile` for `linux/amd64`; pushes; then writes
`imagedefinitions.json` naming container **`flacroncv-api`** for the ECS deploy stage.

`apps/api/Dockerfile` is a four-stage build worth knowing about, because two of its guards exist to
catch failures that were previously silent:

- Installs with `pnpm install --frozen-lockfile`, then **asserts the workspace link exists** —
  `apps/api/node_modules/@flacroncv/shared-types/package.json` must be present (`:56`). pnpm puts a
  `workspace:*` dependency in the *dependent* package's `node_modules`, never in the hoisted root, and
  the import is a **value** import (`require(...)` in compiled output), so a missing link is a boot
  crash, not a type error.
- Builds `@flacroncv/shared-types` **before** the API (`:59-60`) — the API resolves it from `dist/`.
- Runtime stage installs **Chromium** for the Puppeteer export path and runs as non-root `nestjs`.
- Re-asserts at image-build time that `@flacroncv/shared-types` resolves the way
  `node apps/api/dist/main.js` will resolve it (`:106`), catching a partial `COPY` instead of a
  `MODULE_NOT_FOUND` crash loop in the cluster.

Stale detail: the comment at `:105` still says "crash loop on Render". Harmless; Render is dead (§6).

---

## 3. ⚠️ Frontend: two paths exist in this repo. Confirm which one is live.

The handoff notes say the frontend is on **Amplify**, auto-deploying from `main`. But this repo also
contains a complete, heavily hardened **container** path for the web app:

- `buildspec-web.yml` — builds `apps/web/Dockerfile`, pushes to ECR repo **`flacroncv-web`**, and
  writes `imagedefinitions.json` naming container **`flacroncv-web`** (i.e. an ECS deploy target).
- `apps/web/scripts/verify-public-env.mjs` — a checked-in verifier that greps the built client bundle
  for the Firebase config.

Both cannot be the canonical path. **This needs an operator answer before anyone edits either one**, and
it matters: if `buildspec-web.yml` is live then Amplify's env-var settings are irrelevant, and if
Amplify is live then every guard in `buildspec-web.yml` is protecting nothing. I did not resolve it —
resolving it requires reading the AWS console.

`buildspec-web.yml` is worth reading regardless, because its comments are the clearest record of the
`NEXT_PUBLIC_` regression and it encodes four guards learned the hard way:

1. **A provenance marker.** It echoes `BUILDSPEC-MARKER buildspec-web.yml@repo is running`. If that
   line is absent from the CodeBuild log, **the project is running an inline buildspec pasted into the
   console** — a frozen copy that no edit to this repo can ever affect. There is deliberately no
   `buildspec.yml` at the repo root, so a project left on CodeBuild's default name cannot be using a
   file from this repo at all.
2. **A checkout-currency assertion.** It fails if `apps/web/Dockerfile` or the verifier script is
   absent, or if the Dockerfile predates the build-arg guards — i.e. it refuses to build source older
   than `main`.
3. **A presence table + fail-fast** for the eight required `NEXT_PUBLIC_*`, printing `SET`/`EMPTY` and
   warning about surrounding quote characters or embedded whitespace — **never a value or a length**.
   Pasting a value *with* its quotes produces a bundle containing `"\"AIza…\""`, which Firebase rejects
   at runtime with a symptom that looks nothing like a build problem.
4. **Post-build bundle verification against the final image**, then `docker push … || exit 1`. That
   `|| exit 1` is load-bearing: CodeBuild takes the exit status of the *last* statement in a `- |`
   block and there is no `set -e`, so an unchecked push failure once wrote an `imagedefinitions.json`
   naming an image that was never uploaded, logged "Image pushed successfully", and exited 0 — after
   which every ECS task died with `CannotPullContainerError` while the log claimed success.

---

## 4. The rule that causes most production-only failures

**`NEXT_PUBLIC_*` is inlined into the browser bundle by `next build`.** A value supplied only to the
running container — task environment, ECS task definition, Parameter Store at runtime — **never reaches
the compiled JavaScript.** It compiles to `undefined`.

Consequences:

- Changing any `NEXT_PUBLIC_*` requires a **rebuild**, not a redeploy.
- On Amplify the variables must be set on the branch **before** the build, with the prefix intact.
  Dropping the prefix is what put `[firebase] NOT INITIALISED — Missing at BUILD time: …` into
  production: Firebase never initialised, so sign-in failed with an **empty Network tab** — no request
  was ever sent. Localhost worked the whole time.
- In the container path every one must be a `--build-arg` (`buildspec-web.yml:138-147`) with a matching
  `ARG` in `apps/web/Dockerfile`. **The two lists must stay in sync.**
- The eight names are: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, and the six
  `NEXT_PUBLIC_FIREBASE_*` (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`,
  `MESSAGING_SENDER_ID`, `APP_ID`). `NEXT_PUBLIC_GA4_MEASUREMENT_ID` and
  `NEXT_PUBLIC_ANALYTICS_PROVIDER` are optional.
- **These are not secrets.** Firebase web config ships in the client bundle by design; access is
  controlled by Firestore/Storage rules and App Check, not by hiding the API key. They are still read
  from the environment so one repo can build for more than one target.
- CI enforces the same rule: the `docker` job in `.github/workflows/ci.yml` passes all eight as build
  args and **fails fast if any is missing**.

---

## 5. Verification

### After every backend deploy — CORS preflight

Origin alone is not enough. A 204 with `Access-Control-Allow-Origin` can still leave
every real browser request blocked if a custom request header is missing from
`Access-Control-Allow-Headers` (2026-08-19: `X-Device-Token` / `Idempotency-Key`).

```
curl.exe -i -X OPTIONS https://api.flacroncv.com/api/v1/app-config ^
  -H "Origin: https://www.flacroncv.com" ^
  -H "Access-Control-Request-Method: GET" ^
  -H "Access-Control-Request-Headers: authorization,content-type,x-device-token,idempotency-key"
```

Expect **`204`** plus:

- **`Access-Control-Allow-Origin: https://www.flacroncv.com`**
- **`Access-Control-Allow-Headers`** containing at least `authorization`, `content-type`,
  `x-device-token`, and `idempotency-key` (header names are case-insensitive)

In PowerShell use **`curl.exe`**, not `curl` — the latter is an alias for `Invoke-WebRequest` and
rejects `-H`.

Repeat with `-H "Origin: https://flacroncv.com"` (apex). Both must pass: the apex→www redirect means
either can be the browser's `Origin`.

**How CORS is built** (`apps/api/src/main.ts`): origin allowlist = `FRONTEND_URL` + comma-split
`ADDITIONAL_ORIGINS` (**no spaces**), plus localhost outside production. Header allowlist =
`CORS_ALLOWED_HEADERS` in `apps/api/src/cors-allowed-headers.ts` (explicit — never reflect
arbitrary headers). An **empty origin allowlist is a fatal boot error** by design. An unlisted
origin is denied by *omitting* the header rather than throwing, because throwing surfaced to the
browser as a 500. Client header ↔ allowlist parity is gated by
`apps/web/src/lib/api-cors-headers.test.ts`.

### Other checks

| Check | Expect |
|---|---|
| `curl.exe -i https://api.flacroncv.com/health` | `200` + `{"status":"ok","timestamp":…}` |
| `curl.exe -i https://api.flacroncv.com/api/v1/health` | **`404` — correct, by design** |
| Deployed image is the intended commit | ECS task definition image tag == first 12 chars of the commit SHA |
| Frontend Firebase config landed | Browser console shows no `[firebase] NOT INITIALISED`; or run `apps/web/scripts/verify-public-env.mjs` against the built bundle |
| Which buildspec ran | `BUILDSPEC-MARKER buildspec-web.yml@repo is running` present in the CodeBuild log (web path only) |

---

## 6. Dead paths — do not follow

| Artefact | Status |
|---|---|
| `RENDER_DEPLOYMENT.md` | **Dead.** Describes a Render.com Blueprint deploy from a `render.yaml` that **does not exist in this repo**. Superseded by the CodePipeline path |
| `docker/` (compose + nginx) | Pre-AWS local/self-hosted path |
| "Render's proxy" comment, `apps/api/src/main.ts:42` | Stale comment, harmless |
| "crash loop on Render", `apps/api/Dockerfile:105` | Stale comment, harmless |
| `PRICING_UPDATE.md` | **Contains a Stripe webhook signing secret in plaintext.** Delete it and rotate that secret. Also documents superseded price ids and presents the ~18× overcharge design as working |

---

## 7. The regressions, and what now guards each

| # | Regression | Symptom | Guard |
|---|---|---|---|
| 1 | `www` DNS pointed at a dead ALB | `ERR_SSL_PROTOCOL_ERROR` on the canonical host | Both apex and www must target the **Amplify CloudFront** distribution. Verify DNS after any hostname change |
| 2 | Firebase env vars lacked `NEXT_PUBLIC_` in Amplify | Sign-in failed in production with an **empty Network tab**; localhost fine | CI `docker` job build-arg check; `buildspec-web.yml` presence table + fail-fast; bundle verifier. §4 |
| 3 | ECS ran a **month-old image** | Source far ahead of behaviour; "force new deployment" re-pulled the *same* immutable SHA tag. Hours of misdiagnosis | The pipeline registers a new task-definition revision per build. **Never hand-edit task definitions** |
| 4 | CORS allowlist had **no production origin** | Browser calls blocked | §5 preflight check after every deploy, both origins |
| 5 | CORS `allowedHeaders` omitted client custom headers (2026-08-19) | Preflight rejected `x-device-token` (then would have rejected `idempotency-key`); `/health` still ok; origin-only OPTIONS returned **204** | Explicit `CORS_ALLOWED_HEADERS`; client catalog + `api-cors-headers.test.ts`; §5 OPTIONS must include `Access-Control-Request-Headers` |

---

## 8. Operational rules

- **Never point local dev at production.** `FIRESTORE_EMULATOR_HOST` is the **only** thing stopping
  `firebase-admin` from falling back to service-account credentials and connecting to **production
  Firestore**. The tell in the log is `Firestore connection verified`. This has happened once already.
- The Firestore emulator needs **JDK 21+** (firebase-tools 15.x refuses lower). The Auth-only fallback
  is pure Node and needs no Java. `pnpm emulators` + `apps/api/scripts/seed-emulator.mjs` give a safe
  local Auth+Firestore with a seeded super-admin.
- **Do not hand-edit ECS task definitions.** The pipeline owns them.
- **Never echo an env var value** in a buildspec, a log, a document, or a chat. Report presence and
  shape only — `buildspec-web.yml:85-106` is the pattern to copy.
- `STRIPE_WEBHOOK_SECRET` is `.trim()`ed in `apps/api/src/config/configuration.ts:23` because a
  trailing space or stray carriage return is invisible in a dashboard field but changes the HMAC key,
  and the resulting signature mismatch gives no hint that the secret is malformed.
- Stripe webhook path is `POST /api/v1/webhooks/stripe`. Local forwarding:
  `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe`
  (`/api/v1/payments/webhook` is not a route; a bootstrap spec 404s it).

---

## 9. Troubleshooting

| Symptom | Look here first |
|---|---|
| **Any 500 from the API** | `AllExceptionsFilter` maps every non-`HttpException` to a bare `"Internal server error"`, logging the real cause as **`Internal error details: …`** first (`apps/api/src/common/filters/all-exceptions.filter.ts:30`). **Read that log line before theorising.** A raw 500 does *not* imply an unhandled path |
| Email verification 500 | Currently open, handled outside the codebase. The FROM address comes from `SES_FROM_EMAIL` and **defaults to `no-reply@flacronenterprises.com`** — the *parent* domain (`configuration.ts:40`). Verifying `flacroncv.com` in SES changes nothing unless that variable is also set on the task. Candidate causes: SES sandbox (`MessageRejected`), sending paused, credential-chain failure when the two AWS key vars are absent, or Firebase link generation (`auth.service.ts:247`, `:329-332`) — all indistinguishable from the status code alone |
| Sign-in does nothing, empty Network tab | `NEXT_PUBLIC_FIREBASE_*` missing at **build** time. §4 |
| Browser calls blocked | CORS **origin** missing (regression 4) **or** custom **request header** missing from `allowedHeaders` (regression 5). §5 — OPTIONS must include `Access-Control-Request-Headers` |
| Deployed behaviour doesn't match `main` | Stale image (regression 3), or CodeBuild running an **inline** buildspec (§3 guard 1), or building an older commit (§3 guard 2) |
| ECS tasks die with `CannotPullContainerError` | An `imagedefinitions.json` naming an image that was never pushed. §3 guard 4 |
| `pnpm build` exits 0 but emits nothing | The `tsbuildinfo` trap — see `ARCHITECTURE_MAP.md` §9 gotcha 1 |
| API type-check or tests fail to resolve `@flacroncv/shared-types` | `packages/shared-types/dist` is missing. Build it first; until then every type error is an artefact |
| `MODULE_NOT_FOUND` for shared-types at boot | The pnpm workspace link, not the hoisted root. `apps/api/Dockerfile:56` and `:106` assert both ends |
| Monthly usage not reset after a restart | The `onApplicationBootstrap` catch-up and the `system/usage_reset` marker. Do not move that hook back to `onModuleInit` |

---

## 10. Open items handled outside the codebase

**Do not attempt to fix these in code.**

- 🔴 **Email verification 500** — SES identity and sandbox status under investigation.
- **Stripe still in test mode** — live keys pending (client).
- **Secrets rotation in progress** — includes the webhook secret exposed in `PRICING_UPDATE.md` (§6).
- ⚠️ **UNVERIFIED: whether the two Stripe *yearly* price ids are genuinely `interval=year`** in the
  deployed account. Yearly billing **is enabled** in code. `apps/api/scripts/verify-yearly-prices.mjs`
  settles it; it was not run here because it reaches Stripe. Given that a month-interval price once sat
  in `stripePriceIdYearly` and billed ~18× the displayed amount, this is worth running before anyone
  markets annual plans.
