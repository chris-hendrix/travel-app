# Railway Deployment

Journiful runs on [Railway](https://railway.app) as three services from this monorepo.

## Project Topology

| Service            | Builder       | Start Command                                                            | Health check                     |
| ------------------ | ------------- | ------------------------------------------------------------------------ | -------------------------------- |
| **api**            | RAILPACK      | `node apps/api/dist/server.js`                                           | endpoint exists, none configured |
| **web**            | RAILPACK      | `node apps/web/.next/standalone/server.js`                               | endpoint exists, none configured |
| **static**         | RAILPACK      | `node apps/mobile/scripts/serve-static.mjs`                              | `/`, configured, 300s timeout    |
| **Postgres**       | Railway addon | —                                                                        | Built-in                         |
| **Storage Bucket** | Railway addon | —                                                                        | —                                |

## What's Codified vs Dashboard

### In the repo

| File            | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| `nixpacks.toml` | Config for the **Nixpacks** builder. The live services build with Railpack (the deploy driver is `railpack-v0.39.0`), so treat this as legacy; the per-service commands under [Build Commands](#build-commands) are what run. |

Railway's config-as-code (`railway.json`) only supports a single file at the repo root, which applies to all services sharing that root. Since our three services need different start commands, build commands and watch paths, per-service deploy settings live in the Railway dashboard.

### In the Railway dashboard (per service)

Each service must be configured with:

- **Root directory**: `/` (repo root — required for monorepo workspace resolution)
- **Build command override**: see [Build Commands](#build-commands) below
- **Start command**: see table above
- **Health check path and timeout**
- **Environment variables**
- **Public networking** (custom domains)

## Build Commands

All three services build with Railpack, which detects Node and pnpm from the repo root (`nodePackageManager: pnpm` in the deploy metadata). The differing build commands are set per service in the Railway dashboard:

| Service  | Build Command                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------ |
| **api**    | `pnpm install --frozen-lockfile && pnpm build:api`                                                     |
| **web**    | `pnpm install --frozen-lockfile && pnpm build:web`                                                     |
| **static** | `pnpm install --frozen-lockfile && pnpm --filter @journiful/mobile export:web`                        |

The `build:web` script includes copying static assets into the Next.js standalone output, which standalone mode doesn't include by default. The static service calls `export:web` rather than spelling out `expo export` so that `--clear` cannot be dropped: `EXPO_PUBLIC_API_URL` is inlined by Babel outside Metro's cache key, so a cached transform ships a previous build's API origin, and a Railway builder caches aggressively.

## Deploy Trigger

All three services deploy on merge to `main`. Each filters on watch paths, so a merge only rebuilds the
services whose files it touched — read from the live project config (production service instances,
2026-09-24):

| Service  | Watch paths                                                          |
| -------- | -------------------------------------------------------------------- |
| **api**    | `/apps/api/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`     |
| **web**    | `/apps/web/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`     |
| **static** | `/apps/mobile/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`  |

A service whose paths do not match is recorded as a **SKIPPED** deployment. That is the expected
outcome, not a failure: a mobile-only merge skips `web` and `api`, and an API-only merge skips
`static`.

To check what actually built, without the dashboard:

```bash
railway deployment list -s static -e production   # newest first, with status
```

The raw GraphQL path is not worth it here: `railway api` reads project and service config, but
deployments come back `Bad Access` for this token.

Three things this pattern does not cover, all of which need a manual redeploy:

- `pnpm-workspace.yaml` and `tsconfig.base.json` are not in any watch list, though a change to either
  can affect every build.
- `railway.json` is not used (see [What's Codified vs Dashboard](#whats-codified-vs-dashboard)), so
  these settings live in the dashboard and in this table, not in the repo.
- Railway's `healthcheckPath` is set only on **static** (`/`, 300s timeout). `api` and `web` have none,
  so a deploy there that starts but serves errors is not rolled back by the platform.

CI does not deploy anything. The `mobile-web-export` job is a check that runs on pull requests; the
merge to `main` is what ships, through Railway.

## Environment Variables

### API Service

#### Required

| Variable       | Example                      | Notes                                |
| -------------- | ---------------------------- | ------------------------------------ |
| `NODE_ENV`     | `production`                 |                                      |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway reference variable           |
| `JWT_SECRET`   | (generated)                  | Min 32 characters                    |
| `FRONTEND_URL` | `https://journiful.app`         | Comma-separated for multiple origins |
| `PUBLIC_API_ORIGIN` | `https://api.journiful.app` | Server-owned origin for absolute URLs handed to external clients (calendar webcal links). Leave unset in development to fall back to the request host |

#### Twilio Verify (production SMS auth)

| Variable                         | Example        | Notes                                                    |
| -------------------------------- | -------------- | -------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID`             | `ACxxxxxxxxxx` |                                                          |
| `TWILIO_AUTH_TOKEN`              | (secret)       |                                                          |
| `TWILIO_VERIFY_SERVICE_SID`      | `VAxxxxxxxxxx` |                                                          |
| `ENABLE_FIXED_VERIFICATION_CODE` | `false`        | **Must be false in production** (server crashes if true) |

#### Google Maps Platform

| Variable              | Example | Notes                                                                     |
| --------------------- | ------- | ------------------------------------------------------------------------- |
| `GOOGLE_MAPS_API_KEY` | (secret) | Required for Discover POIs, location autocomplete, geocoding + timezone. Server-side only. |

#### S3 Storage (Railway Storage Bucket)

| Variable                | Notes                                     |
| ----------------------- | ----------------------------------------- |
| `STORAGE_PROVIDER`      | `s3`                                      |
| `AWS_ENDPOINT_URL`      | Auto-set by Railway Storage Bucket preset |
| `AWS_S3_BUCKET_NAME`    | Auto-set by Railway Storage Bucket preset |
| `AWS_ACCESS_KEY_ID`     | Auto-set by Railway Storage Bucket preset |
| `AWS_SECRET_ACCESS_KEY` | Auto-set by Railway Storage Bucket preset |
| `AWS_DEFAULT_REGION`    | Auto-set by Railway Storage Bucket preset |

#### Security / Networking

| Variable               | Default        | Notes                                       |
| ---------------------- | -------------- | ------------------------------------------- |
| `TRUST_PROXY`          | `false`        | Set `true` behind Railway's proxy           |
| `COOKIE_SECURE`        | `true` (prod)  |                                             |
| `COOKIE_DOMAIN`        | —              | e.g. `.journiful.app` for cross-subdomain auth |
| `EXPOSE_ERROR_DETAILS` | `false` (prod) |                                             |
| `LOG_LEVEL`            | `info`         |                                             |

### Web Service

| Variable                     | Example                                | Notes                                                   |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`        | `https://api.journiful.app/api`           | Browser-side API URL                                    |
| `API_URL`                    | `http://api.railway.internal:8000/api` | Server-side (RSC) — use Railway private networking      |
| `NEXT_PUBLIC_SITE_URL`       | `https://journiful.app`                   | For SEO (robots.txt, sitemap)                           |
| `NEXT_PUBLIC_ENABLE_POLLING` | `false`                                | Disable TanStack Query polling to prevent rate limiting |
| `PORT`                       | `3000`                                 | Railway sets this automatically                         |

### Static Service (Expo web export)

| Variable              | Example                          | Notes                                        |
| --------------------- | -------------------------------- | -------------------------------------------- |
| `EXPO_PUBLIC_API_URL` | `https://api.journiful.app/api`  | Build-time, inlined into the export bundles  |
| `PORT`                | `8081`                           | Railway sets this automatically              |

The service builds and serves via the `apps/mobile` scripts `export:web`
(`expo export --platform web --clear`) and `serve:web`
(`node scripts/serve-static.mjs`, a dependency-free static server that
returns one file per route with real 404s). Live at
`https://journiful.app` and `https://beta.journiful.app` (and
`https://static-production-df7e.up.railway.app`).

Everything the export publishes beyond the app routes comes from
`apps/mobile/public/`, copied into `dist/` by the Expo build:
`manifest.json` and `icons/` (the install story) and
`.well-known/assetlinks.json` (App Links verification, whose
`sha256_cert_fingerprints` must match the certificate of the installed
APK — the upload key today, plus the Play app-signing key once a `.aab`
is uploaded). Read the key's fingerprint back with:

```bash
keytool -list -v -keystore ~/keys/journiful-upload.keystore \
  -alias journiful-upload -storepass "$(grep ^storePassword \
  ~/keys/journiful-upload.passwords | cut -d= -f2)" | grep SHA256
```

and compare it against the **deployed** file, not the repo copy:
`curl -s https://journiful.app/.well-known/assetlinks.json`. Checked
2026-09-26: deployed value and upload key agree
(`12:B8:5F:EE:…:E3:C2:41`), which is all that App Links needs while the
APK ships through Firebase. There is no EAS project — `eas.json` does not
exist, so `eas credentials` has nothing to show — and the Play app-signing
key becomes the second entry only once a `.aab` is uploaded. The manifest
link in each page's `<head>` comes from
`apps/mobile/app/+html.tsx`. `apps/mobile/scripts/check-export.mjs` is
the gate on all of it and runs in the `Mobile Web Export` CI job.

The API's `FRONTEND_URL` covers the static origins:
`https://journiful.app,https://static-production-df7e.up.railway.app,https://beta.journiful.app`.
That list is CORS: the API must name an origin before a browser on it can
sign in, so a new hostname goes into `FRONTEND_URL` and is redeployed
**before** it is pointed anywhere.

## Domains and Rollback

The apex `journiful.app` points at the **static** service (the Expo web
export). It was cut over from the **web** service (the frozen Next app) on
2026-09-26, and the rollback was drilled the same day: forward, back to
**web**, forward again. The swap is a custom-domain re-point — in the
Railway dashboard (service → Settings → Networking → Custom Domains) or
with the CLI, which is what the drill used:

```bash
# rollback — the apex goes back to the frozen Next app
railway domain delete journiful.app -s static -e production --yes
railway domain journiful.app -s web -e production -p 8080

# forward again — the apex returns to the Expo export
railway domain delete journiful.app -s web -e production --yes
railway domain journiful.app -s static -e production
```

The delete needs `--yes` under an agent or a script, or it refuses with
"Cannot prompt for confirmation in non-interactive mode".

No redeploy, and **no DNS change**. Each custom domain gets its own edge
hostname (`qj9c64km`, `hii0btpj`, `xoga8e15`, …) and Railway hands out a
fresh one on every re-add, so the required CNAME value changes on every
swap — ignore it. The old A record at the apex keeps answering because the
Railway edge is shared and routes by Host header, which was verified by
resolving `journiful.app` against each edge IP in turn: every IP served
whichever service held the binding, and the apex stayed up on the stale
record through all three re-points. The TXT `_railway-verify.journiful.app`
is the one record that must stay put — it is what lets a re-add verify
instantly instead of waiting on the 72-hour note.

What the swap does cost is a window with no apex:

| Phase                                              | Measured 2026-09-26        |
| -------------------------------------------------- | -------------------------- |
| delete + add                                       | ~4 s                       |
| apex answers again (404 from the edge until the new binding settles) | ~30 s |
| fully serving the new app                          | ~30 s (rollback and second forward) |
| fully serving, **first** move of a hostname        | **~2 min** — the edge issues a certificate and reports `CERTIFICATE_STATUS_TYPE_ISSUING`; expect a few seconds of TLS failure before it completes |

Only one service can hold a custom domain, so the two commands cannot
overlap: the apex 404s in between. Do it when a minute or two of 404 on
the apex is acceptable, and only after the **static** service has
redeployed from `main` — the export the apex starts serving is whatever
that service last built.

The **web** service stays deployed on
`https://web-production-e21e7.up.railway.app` as the rollback target. Its
admin console is at `/admin/users` (the Expo export has none). Note that
`COOKIE_DOMAIN=.journiful.app` means a sign-in on the `*.up.railway.app`
hostname will not stick in the browser, so a rollback that has to be *used*
— not merely confirmed — needs `admin.journiful.app` pointed at **web**
first: add the custom domain to the service, then add the CNAME and the
`_railway-verify` TXT it reports at the registrar.

### Rollback steps

Measured wall-clock on 2026-09-26, apex to `web` and back:

1. Drop the domain from **static**:
   `railway domain delete journiful.app -s static -e production --yes`
2. Add it to **web**, keeping the port it had before the cutover:
   `railway domain journiful.app -s web -e production -p 8080`
3. Confirm the frozen app is back. The first curl can 404 for ~30 s, so
   retry rather than reading one failure as a broken rollback:
   `curl -s -o /dev/null -w '%{http_code}' https://journiful.app/` is 200,
   the HTML contains `__next` where the Expo export has `id="root"`, and
   `https://journiful.app/login` renders the Next sign-in page.
4. Swap forward again by reversing steps 1-2 (delete from **web**, add to
   **static** with no `-p`).

## Health Checks

The API exposes three health endpoints:

| Endpoint                | Purpose         | Failure        |
| ----------------------- | --------------- | -------------- |
| `GET /api/health/`      | Full status     | 503 if DB down |
| `GET /api/health/live`  | Liveness probe  | Always 200     |
| `GET /api/health/ready` | Readiness probe | 503 if DB down |

Use `/api/health/ready` as the Railway health check — it returns 503 when the database is unreachable, preventing traffic to unhealthy instances.

## Database Migrations

Migrations run via `drizzle-kit migrate`. Options:

1. **Pre-deploy command** (recommended): Set in Railway dashboard for the API service: `cd apps/api && pnpm db:migrate`
2. **Manual**: `railway run -s api -- sh -c "cd apps/api && pnpm db:migrate"`

## Production Safety Guards

- `ENABLE_FIXED_VERIFICATION_CODE=true` + `NODE_ENV=production` → server exits with code 1
- Twilio env vars are validated when mock verification is disabled
- `COOKIE_SECURE` defaults to `true` in production
- Helmet security headers (CSP, HSTS, CORP) are enabled
