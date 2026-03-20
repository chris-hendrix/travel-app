# Railway Deployment

Journiful runs on [Railway](https://railway.app) as two services from this monorepo.

## Project Topology

| Service            | Type          | Start Command                              | Health Check        |
| ------------------ | ------------- | ------------------------------------------ | ------------------- |
| **api**            | Nixpacks      | `node apps/api/dist/server.js`             | `/api/health/ready` |
| **web**            | Nixpacks      | `node apps/web/.next/standalone/server.js` | `/`                 |
| **Postgres**       | Railway addon | —                                          | Built-in            |
| **Storage Bucket** | Railway addon | —                                          | —                   |

## What's Codified vs Dashboard

### In the repo

| File            | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| `nixpacks.toml` | Shared build phases: `corepack enable`, `pnpm install`, `pnpm build` |

Railway's config-as-code (`railway.json`) only supports a single file at the repo root, which applies to all services sharing that root. Since our two services need different start commands and health checks, per-service deploy settings live in the Railway dashboard.

### In the Railway dashboard (per service)

Each service must be configured with:

- **Root directory**: `/` (repo root — required for monorepo workspace resolution)
- **Build command override**: see [Build Commands](#build-commands) below
- **Start command**: see table above
- **Health check path and timeout**
- **Environment variables**
- **Public networking** (custom domains)

## Build Commands

Both services share `nixpacks.toml` for the setup phase (`corepack enable`), but need different build commands configured in the Railway dashboard:

| Service | Build Command                                      |
| ------- | -------------------------------------------------- |
| **api** | `pnpm install --frozen-lockfile && pnpm build:api` |
| **web** | `pnpm install --frozen-lockfile && pnpm build:web` |

The `build:web` script includes copying static assets into the Next.js standalone output, which standalone mode doesn't include by default.

## Environment Variables

### API Service

#### Required

| Variable       | Example                      | Notes                                |
| -------------- | ---------------------------- | ------------------------------------ |
| `NODE_ENV`     | `production`                 |                                      |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway reference variable           |
| `JWT_SECRET`   | (generated)                  | Min 32 characters                    |
| `FRONTEND_URL` | `https://journiful.app`         | Comma-separated for multiple origins |

#### Twilio Verify (production SMS auth)

| Variable                         | Example        | Notes                                                    |
| -------------------------------- | -------------- | -------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID`             | `ACxxxxxxxxxx` |                                                          |
| `TWILIO_AUTH_TOKEN`              | (secret)       |                                                          |
| `TWILIO_VERIFY_SERVICE_SID`      | `VAxxxxxxxxxx` |                                                          |
| `ENABLE_FIXED_VERIFICATION_CODE` | `false`        | **Must be false in production** (server crashes if true) |

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
