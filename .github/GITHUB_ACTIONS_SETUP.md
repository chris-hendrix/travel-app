# GitHub Actions CI Setup

Source of truth: `.github/workflows/ci.yml`. If this doc and `ci.yml` disagree, `ci.yml` wins.

## Jobs

| Job | What it does | When it runs |
| --- | --- | --- |
| `changes` | Detects changed paths via `dorny/paths-filter` | Always |
| `quality` | Lint, typecheck (all on main, `--affected` on PRs), `pnpm audit` | Always (after `changes`) |
| `devcontainer` | Validates devcontainer config (`bash .github/scripts/test-devcontainer.test.sh`) | Only when devcontainer paths changed |
| `mobile-checks` | Lint, typecheck, test `@journiful/mobile` + `expo-doctor` | On main/master, or when mobile paths changed |
| `unit-tests` | API migrations + `@journiful/api` tests against Postgres 16 | On main/master, or when api/shared paths changed |
| `mobile-e2e-tests` | Mobile Playwright suite, 2 shards, chromium-only | On main/master, or when api/mobile/shared paths changed |
| `merge-mobile-e2e-reports` | Merges mobile blob reports into one HTML report | When `mobile-e2e-tests` was not skipped |
| `mobile-web-export` | Builds the Expo web export (`dist/`) and verifies it: shape assertions, export gate script, Playwright run against the export | On main/master, or when api/mobile/shared paths changed |

## Path filters (`changes` job)

- `api`: `apps/api/**`
- `mobile`: `apps/mobile/**`
- `shared`: `shared/**`, `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/**`, `tsconfig.base.json`, `eslint.config.js`
- `devcontainer`: `.devcontainer/**`, `Makefile`

No filter covers the retired web app: it was deleted from the repository (`DEPLOYMENT.md` keeps the recovery recipe). A change that touches only its former paths now matches nothing and no job runs.

## Local runs: use the devcontainer

All test, lint, and typecheck commands must run inside the devcontainer via `make test-exec CMD="..."`. Never run them on the host. Examples:

```bash
make test-exec CMD="pnpm test"
make test-exec CMD="pnpm lint"
make test-exec CMD="pnpm typecheck"
```

## Mobile E2E gate

`mobile-e2e-tests` shards the `@journiful/mobile` Playwright suite across 2 shards (chromium only) and uploads per-shard blob reports. `merge-mobile-e2e-reports` merges them into the `playwright-report-mobile` HTML artifact (30-day retention). Both run on main/master and on PRs touching api, mobile, or shared paths.

## Mobile Web Export gate

`mobile-web-export` builds `dist/` with `export:web` (baking in the local test API origin), runs the `web-export.test.ts` shape assertions, runs `node apps/mobile/scripts/check-export.mjs`, then runs the mobile Playwright suite against the export (`MOBILE_WEB_TARGET=export`) and uploads the `playwright-report-mobile-web-export` artifact (7-day retention).
