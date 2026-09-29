# Railway Deployment

Journiful runs on [Railway](https://railway.app) as two services from this monorepo.

## Project Topology

| Service            | Builder       | Start Command                                                            | Health check                     |
| ------------------ | ------------- | ------------------------------------------------------------------------ | -------------------------------- |
| **api**            | RAILPACK      | `node apps/api/dist/server.js`                                           | endpoint exists, none configured |
| **web**            | RAILPACK      | `node apps/mobile/scripts/serve-static.mjs`                              | `/`, configured, 300s timeout    |
| **Postgres**       | Railway addon | —                                                                        | Built-in                         |
| **Storage Bucket** | Railway addon | —                                                                        | —                                |

## What's Codified vs Dashboard

### In the repo

| File            | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| `nixpacks.toml` | Config for the **Nixpacks** builder. The live services build with Railpack (the deploy driver is `railpack-v0.39.0`), so treat this as legacy; the per-service commands under [Build Commands](#build-commands) are what run. |

Railway's config-as-code (`railway.json`) only supports a single file at the repo root, which applies to all services sharing that root. Since our two services need different start commands, build commands and watch paths, per-service deploy settings live in the Railway dashboard.

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
| **web**    | `pnpm install --frozen-lockfile && pnpm --filter @journiful/mobile export:web`                        |

The web service calls `export:web` rather than spelling out `expo export` so that `--clear` cannot be dropped: `EXPO_PUBLIC_API_URL` is inlined by Babel outside Metro's cache key, so a cached transform ships a previous build's API origin, and a Railway builder caches aggressively.

## Deploy Trigger

Both services deploy on merge to `main`. Each filters on watch paths, so a merge only rebuilds the
services whose files it touched — read from the live project config (production service instances,
2026-09-24):

| Service  | Watch paths                                                          |
| -------- | -------------------------------------------------------------------- |
| **api**    | `/apps/api/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`     |
| **web**    | `/apps/mobile/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`  |

A service whose paths do not match is recorded as a **SKIPPED** deployment. That is the expected
outcome, not a failure: a mobile-only merge skips `api`, and an API-only merge skips
`web`.

To check what actually built, without the dashboard:

```bash
railway deployment list -s web -e production   # newest first, with status
```

The raw GraphQL path is not worth it here: `railway api` reads project and service config, but
deployments come back `Bad Access` for this token.

Three things this pattern does not cover, all of which need a manual redeploy:

- `pnpm-workspace.yaml` and `tsconfig.base.json` are not in any watch list, though a change to either
  can affect every build.
- `railway.json` is not used (see [What's Codified vs Dashboard](#whats-codified-vs-dashboard)), so
  these settings live in the dashboard and in this table, not in the repo.
- Railway's `healthcheckPath` is set only on **web** (`/`, 300s timeout). `api` has none,
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

### Web Service (Expo web export)

| Variable              | Example                          | Notes                                        |
| --------------------- | -------------------------------- | -------------------------------------------- |
| `EXPO_PUBLIC_API_URL` | `https://api.journiful.app/api`  | Build-time, inlined into the export bundles  |
| `PORT`                | `8081`                           | Railway sets this automatically              |

The service builds and serves via the `apps/mobile` scripts `export:web`
(`expo export --platform web --clear`) and `serve:web`
(`node scripts/serve-static.mjs`, a dependency-free static server that
returns one file per route with real 404s). Live at
`https://journiful.app` (and
`https://static-production-df7e.up.railway.app` — a hostname Railway minted
when this service was still called `static`; renaming it to `web` on
2026-09-29 left the generated domain alone).

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

The API's `FRONTEND_URL` covers the web origins:
`https://journiful.app,https://static-production-df7e.up.railway.app`.
That list is CORS: the API must name an origin before a browser on it can
sign in, so a new hostname goes into `FRONTEND_URL` and is redeployed
**before** it is pointed anywhere.

## Domains and Recovery of the Retired Web App

The apex `journiful.app` belongs to the **web** service (the Expo web
export). `/admin` lives in the app — there is
no separate admin hostname. The 2026-09-26 apex re-point drill (cut over
from the retired Next app, back, and forward again) is historical; there is
no live rollback target any more, so a bad deploy is fixed by rolling the
**web** service back to its previous deployment, not by re-pointing a
domain.

`beta.journiful.app` was a second custom domain on the same service until
2026-09-29, when it was removed (`railway domain delete beta.journiful.app -s web
-e production --yes`) and dropped from the API's `FRONTEND_URL` in the same
change. One loose end is owed at the registrar: the beta CNAME still points at a
Railway edge hostname, so the hostname answers **404** from the edge instead of
failing to resolve. Deleting that CNAME — and the
`_railway-verify.beta.journiful.app` TXT, which only exists to make a re-add
verify instantly — is a DNS change, not a Railway one. The apex's own
`_railway-verify` TXT must stay.

The service was called `static` until 2026-09-29, when it was renamed to
`web` through the CLI (`serviceUpdate`); nothing else about it changed —
same service ID, same custom domains, same deployment, same watch paths.
The retired app's record is still present as a service named
`retired-next-app`, which survives only in the PR-fork environments
(`tripful-pr-59`, `travel-app-pr-216`); it was renamed out of the way to
free the name `web`, and disappears when those environments do.

What follows is the recovery recipe for the retired web app (`apps/web`,
the frozen Next.js app, deleted 2026-09). It is the only surviving record
of how to bring the old app back, so it keeps naming the deleted paths on
purpose. The name `web` now belongs to the Expo export, so a recreated
legacy service has to take another name — `web-legacy` — and the retired
references to a `RAILWAY_SERVICE_WEB_URL` below are that old app's, not
the live service's.

### Recovery of the retired web app

Find the last commit that still contained the app, then step one earlier:

```bash
git log --diff-filter=D --format=%H -1 -- apps/web/package.json
# the recovery ref is that commit's parent (^). Confirm the shape today
# returns nothing while the file exists; after the deletion it anchors
# the tree to recreate the service from.
```

Recreate a Railway service from that ref with:

- **Root directory**: `/` (repo root — required for monorepo workspace resolution)
- **Build command**: `pnpm install --frozen-lockfile && pnpm build:web`
- **Start command**: `node apps/web/.next/standalone/server.js`
- **Watch paths**: `/apps/web/**`, `/shared/**`, `package.json`, `pnpm-lock.yaml`
- **Health check**: endpoint exists, none configured (as before)
- **Port**: `3000` (Railway sets `PORT` automatically)

Environment keys the old `web` service carried (key names captured
2026-09-28 via `railway variable list -s web -e production --json`;
values are secrets and live nowhere in the repo):

```text
API_URL
HOSTNAME
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_ENABLE_POLLING
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
RAILWAY_ENVIRONMENT
RAILWAY_ENVIRONMENT_ID
RAILWAY_ENVIRONMENT_NAME
RAILWAY_PRIVATE_DOMAIN
RAILWAY_PROJECT_ID
RAILWAY_PROJECT_NAME
RAILWAY_PUBLIC_DOMAIN
RAILWAY_SERVICE_API_URL
RAILWAY_SERVICE_ID
RAILWAY_SERVICE_NAME
RAILWAY_SERVICE_S3_EXPLORER_URL
RAILWAY_SERVICE_STATIC_URL
RAILWAY_SERVICE_WEB_URL
RAILWAY_STATIC_URL
```

The `RAILWAY_*` entries are auto-injected references that reappear on
their own; the six app-level keys to set by hand are `API_URL`
(`http://api.railway.internal:8000/api`, server-side via Railway private
networking), `NEXT_PUBLIC_API_URL` (`https://api.journiful.app/api`),
`NEXT_PUBLIC_SITE_URL` (`https://journiful.app`, for SEO),
`NEXT_PUBLIC_ENABLE_POLLING` (`false`, to prevent rate limiting),
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `HOSTNAME`. The retired hostname was
`https://web-production-e21e7.up.railway.app`.

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
