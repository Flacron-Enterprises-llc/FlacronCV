# FlacronCV API

NestJS backend for FlacronCV.

## Local development

```bash
cd apps/api
pnpm dev          # nest start --watch
```

The server reads configuration from environment variables (Firebase Admin,
Stripe, Brevo, etc.). `src/main.ts` validates the required ones at boot and
exits if any are missing.

## Build / dev-server notes

### `nest-cli.json` — `deleteOutDir` is intentionally `false`

Do **not** change `compilerOptions.deleteOutDir` back to `true` in
[`nest-cli.json`](./nest-cli.json). It is set to `false` on purpose.

**Why:** `tsconfig.json` enables `"incremental": true`, which makes the
TypeScript compiler keep a `tsconfig.tsbuildinfo` cache and only re-emit files
that changed. If Nest also deletes the output directory before every build
(`deleteOutDir: true`), the two settings conflict:

1. `deleteOutDir` removes `dist/` at the start of `nest start` / `nest build`.
2. Incremental `tsc` then reads the surviving `tsconfig.tsbuildinfo`, decides
   nothing has changed, prints `Found 0 errors`, and **emits nothing**.
3. `dist/main.js` is therefore missing, and the app fails to launch with:
   `Error: Cannot find module '.../apps/api/dist/main'`.

This is intermittent and confusing because `pnpm type-check` (which is
`tsc --noEmit`) still reports 0 errors — it never needs to produce `dist/`.
The failure surfaces on the *second* `pnpm dev` (or a `pnpm build` followed by
`pnpm dev`): the first run emits and writes the cache, and the next run deletes
`dist/` but skips re-emitting because the cache says the build is current.

Keeping `deleteOutDir: false` lets the incremental cache and the `dist/`
output stay consistent, so `dist/main.js` is always present and the dev server
starts reliably on every run.

**If you ever hit `Cannot find module .../dist/main` again:** clear the stale
cache once with `rm apps/api/tsconfig.tsbuildinfo` (or run `pnpm --filter=api
build`), then start normally. With `deleteOutDir: false` this should not recur.

> Alternatives that would also fix it but were deliberately *not* chosen, to
> avoid changing the TypeScript config / build architecture: disabling
> `incremental` in `tsconfig.json`, or adding a separate `tsconfig.build.json`.
