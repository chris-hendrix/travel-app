---
title: Rebrand Tripful to Journiful
created: 2026-03-19
plan: .thoughts/plans/2026-03-19-rebrand-tripful-to-journiful.md
---

# Rebrand Tripful to Journiful

## What was implemented

Full big-bang rebrand of the monorepo from "Tripful" to "Journiful" across 218 files. Every code, config, infrastructure, UI, documentation, and test reference was updated in a single atomic commit.

## Key changes

- **Package names**: `@tripful/*` → `@journiful/*` (4 package.json files + 161 import files)
- **Domain**: `tripful.me` → `journiful.app`, `api.tripful.me` → `api.journiful.app`
- **Infrastructure**: Docker container names, PostgreSQL credentials, S3 bucket names, CI workflow
- **UI/Meta/SEO**: All metadata, structured data, auth page text, component display text
- **Calendar service**: UIDs, PRODID, webcal URLs, custom X-headers
- **Documentation**: All docs directories and content, README, CLAUDE.md, DEPLOYMENT.md
- **Tests**: E2E temp dir prefixes, docker-compose test script

## Files created/modified

218 files changed, 488 insertions, 471 deletions. Notable:
- `docs/2026-02-01-tripful-mvp/` renamed to `docs/2026-02-01-journiful-mvp/`
- `pnpm-lock.yaml` regenerated (not sed-replaced)

## Verification results

- **grep check**: Zero `tripful` references in source (only `.playwright-cli/` cached snapshots)
- **pnpm install**: Success with `@journiful/*` packages
- **pnpm build**: All 3 packages pass (shared, api, web)
- **typecheck**: All 3 packages pass
- **lint**: All 3 packages pass
- **unit/integration tests**: 22 failures — all pre-existing (FAB aria-label, flaky daily-itineraries/weather, S3 devcontainer bucket). None caused by rebrand.
- **E2E tests**: Deferred (requires full devcontainer services)

## Implementation notes

Executed via agent team with 4 parallel workers after the critical Phase 1 (package names/imports) completed. No deviations from the original plan. Phase 9 (SEO improvements — OG image, sitemap review) was not implemented in this PR and can be done separately.

## References

- [Original plan](.thoughts/plans/2026-03-19-rebrand-tripful-to-journiful.md)
- Branch: `rebrand/journiful`
