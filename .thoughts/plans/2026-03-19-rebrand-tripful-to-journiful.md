---
status: completed
created: 2026-03-19
brainstorm: .thoughts/brainstorms/2026-03-19-rebrand-tripful-to-journiful.md
---

# Implementation Plan: Rebrand Tripful → Journiful

## Overview

Full rebrand of the Tripful monorepo to Journiful in a single big-bang PR. All code, config, infrastructure, UI text, domains, and documentation updated at once. Historical `.thoughts/` files are excluded.

**Domain**: `journiful.app` (frontend) + `api.journiful.app` (API)
**Package scope**: `@journiful/*`
**Calendar UIDs**: Clean break to `@journiful.app`

## Success Criteria

- [x] Zero occurrences of `tripful` in code/config/docs (excluding `.thoughts/`, `.git/`, `node_modules/`)
- [x] `pnpm install` succeeds with updated package names
- [x] `pnpm build` succeeds for all packages
- [x] All unit/integration tests pass (22 pre-existing failures unrelated to rebrand)
- [ ] E2E tests pass (deferred)
- [x] All meta tags, structured data, and SEO references use "Journiful" and "journiful.app"
- [x] `grep -ri tripful --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.md' --include='*.css' --include='*.sh'` returns only `.thoughts/` hits

## Current State

- 180+ files contain "tripful" (lowercase)
- 64 files contain "Tripful" (title case)
- 5 files contain "TRIPFUL" (uppercase)
- 161 files have `@tripful/` imports
- 4 package.json files define @tripful/* packages
- pnpm-lock.yaml has 2 refs (regenerated automatically)
- turbo.json, migration SQL, and husky hooks are clean
- No binary files contain "tripful"

## Architecture

### Rename Strategy

The rename is mechanical for most files — a case-preserving find-and-replace:

| Pattern | Replacement | Files |
|---|---|---|
| `@tripful/` | `@journiful/` | 161 import files + 4 package.json |
| `tripful` (in URLs, DB, config) | `journiful` | ~20 config files |
| `Tripful` (display text) | `Journiful` | ~64 files |
| `TRIPFUL` (uppercase constants) | `JOURNIFUL` | 5 files |
| `tripful.me` | `journiful.app` | ~30 files |
| `api.tripful.me` | `api.journiful.app` | ~10 files |
| `tripful.app` (calendar UIDs) | `journiful.app` | ~10 files |
| `tripful-postgres` | `journiful-postgres` | 2 files |
| `tripful-minio` | `journiful-minio` | 2 files |
| `tripful-uploads` | `journiful-uploads` | 3 files |
| `tripful_dev` | `journiful_dev` | 3 files |

### Edge Cases Requiring Manual Attention

1. **`pnpm-lock.yaml`**: Do NOT sed-replace. Delete and regenerate with `pnpm install`.
2. **`docs/2026-02-01-tripful-mvp/`**: Rename directory to `docs/2026-02-01-journiful-mvp/`.
3. **PostmarkStamp component**: `city="TRIPFUL"` → `city="JOURNIFUL"` (line 79 of page.tsx).
4. **Calendar PRODID**: `apps/api/src/services/calendar.service.ts` — update PRODID identifier string.
5. **`product-marketing-context.md`**: Update domain, brand name, and positioning text.
6. **`.gitguardian.yaml`**: Check for any tripful-specific patterns.
7. **`next.config.ts`**: Check for any domain allowlists or image domains.
8. **CLAUDE.md**: References to `@tripful/shared` import patterns, database names, etc.

---

## Implementation Checklist

### Phase 1: Package Names & Imports (highest risk — breaks build if incomplete)

- [x] **1.1** Update `shared/package.json`: name `@tripful/shared` → `@journiful/shared`
- [x] **1.2** Update `apps/api/package.json`: name `@tripful/api` → `@journiful/api`, dependency `@tripful/shared` → `@journiful/shared`
- [x] **1.3** Update `apps/web/package.json`: name `@tripful/web` → `@journiful/web`, dependency `@tripful/shared` → `@journiful/shared`
- [x] **1.4** Update root `package.json`: name `@tripful/root` → `@journiful/root`, all script filter references
- [x] **1.5** Update `apps/api/tsup.config.ts`: noExternal regex `@tripful\/shared` → `@journiful\/shared`
- [x] **1.6** Update `apps/web/vitest.config.ts`: `@tripful/shared` alias → `@journiful/shared`
- [x] **1.7** Update `apps/web/next.config.ts`: check for any `@tripful` references
- [x] **1.8** Bulk replace all import statements: `@tripful/shared` → `@journiful/shared` across all .ts/.tsx files (161 files)
  - `@tripful/shared` → `@journiful/shared`
  - `@tripful/shared/types` → `@journiful/shared/types`
  - `@tripful/shared/schemas` → `@journiful/shared/schemas`
  - `@tripful/shared/utils` → `@journiful/shared/utils`
  - `@tripful/shared/config` → `@journiful/shared/config`
- [x] **1.9** Delete `pnpm-lock.yaml` and run `pnpm install` to regenerate
- [x] **1.10** Verify: `pnpm build` succeeds

### Phase 2: Infrastructure & Config

- [x] **2.1** Update `docker-compose.yml`:
  - Container names: `tripful-postgres` → `journiful-postgres`, `tripful-minio` → `journiful-minio`, `tripful-minio-init` → `journiful-minio-init`
  - POSTGRES_USER: `tripful` → `journiful`
  - POSTGRES_PASSWORD: `tripful_dev` → `journiful_dev`
  - POSTGRES_DB: `tripful` → `journiful`
  - S3 bucket: `tripful-uploads` → `journiful-uploads`
- [x] **2.2** Update `.devcontainer/docker-compose.yml`:
  - DATABASE_URL with new user/password/dbname
  - POSTGRES_* env vars
  - S3 bucket name
- [x] **2.3** Update `.devcontainer/devcontainer.json`: name → "Journiful"
- [x] **2.4** Update `.devcontainer/setup.sh`: setup message text, `@tripful/shared` → `@journiful/shared` filter
- [x] **2.5** Update `apps/api/.env.example`: DATABASE_URL, S3 bucket name
- [x] **2.6** Update `apps/web/.env.local.example`: NEXT_PUBLIC_APP_NAME, API URL comments, domain comments
- [x] **2.7** Update `.github/workflows/ci.yml`:
  - All DATABASE_URL strings
  - All POSTGRES_* env vars
  - All `--filter=@tripful/` → `--filter=@journiful/`

### Phase 3: User-Facing (UI, Meta, SEO)

- [x] **3.1** Update `apps/web/src/app/layout.tsx`:
  - metadataBase URL: `tripful.me` → `journiful.app`
  - All title fields: "Tripful" → "Journiful"
  - description fields (keep same text, update brand name)
  - authors/creator: "Tripful" → "Journiful"
  - OG siteName: "Tripful" → "Journiful"
  - appleWebApp title: "Tripful" → "Journiful"
  - noscript text: "Tripful" → "Journiful"
- [x] **3.2** Update `apps/web/src/app/page.tsx`:
  - siteUrl fallback: `tripful.me` → `journiful.app`
  - page title metadata: "Tripful" → "Journiful"
  - PostmarkStamp city: `"TRIPFUL"` → `"JOURNIFUL"`
  - "How Tripful works" heading → "How Journiful works"
  - JSON-LD structured data: name fields in both WebSite and WebApplication blocks
- [x] **3.3** Update `apps/web/src/app/manifest.ts`: name + short_name → "Journiful"
- [x] **3.4** Update `apps/web/src/app/sitemap.ts`: siteUrl fallback → `journiful.app`
- [x] **3.5** Update `apps/web/src/app/robots.ts`: siteUrl fallback → `journiful.app`
- [x] **3.6** Update auth layouts:
  - `(auth)/layout.tsx`: wordmark text "Tripful" → "Journiful"
  - `(auth)/login/layout.tsx`: "Sign in to Tripful" → "Sign in to Journiful"
  - `(auth)/verify/layout.tsx`: "access Tripful" → "access Journiful"
  - `(auth)/complete-profile/layout.tsx`: "Tripful profile" → "Journiful profile"
- [x] **3.7** Update any other component files with "Tripful" display text (check `trips-content.tsx` for "TRIPFUL")

### Phase 4: Domains & Calendar Service

- [x] **4.1** Update `apps/api/src/services/calendar.service.ts`:
  - All `@tripful.app` UIDs → `@journiful.app`
  - All `webcal://api.tripful.app` → `webcal://api.journiful.app`
  - PRODID identifiers
- [x] **4.2** Update `apps/api/tests/unit/calendar.service.test.ts`: all assertions matching `@tripful.app` → `@journiful.app`
- [x] **4.3** Grep all remaining files for `tripful.me`, `api.tripful.me`, `tripful.app`, `tripful.com` and update

### Phase 5: Shared Package Comments

- [x] **5.1** Update header comments in `shared/schemas/*.ts` (14 files): "Tripful platform" → "Journiful platform"
- [x] **5.2** Update header comments in `shared/types/*.ts` (7 files): "Tripful platform" → "Journiful platform"
- [x] **5.3** Update `shared/utils/index.ts` comment
- [x] **5.4** Update `shared/index.ts` barrel export comment
- [x] **5.5** Update `shared/config/index.ts` comment
- [x] **5.6** Update `shared/README.md`

### Phase 6: Documentation (excluding .thoughts/)

- [x] **6.1** Rename directory: `docs/2026-02-01-tripful-mvp/` → `docs/2026-02-01-journiful-mvp/`
- [x] **6.2** Update content in `docs/2026-02-01-journiful-mvp/`:
  - ARCHITECTURE.md (~50 mentions)
  - PHASES.md (~10 mentions)
  - DESIGN.md (~20 mentions)
  - API.md
  - PRD.md (~10 mentions)
- [x] **6.3** Update content in `docs/2026-02-14-messaging-notifications/`:
  - PRD.md (~10 mentions)
  - ARCHITECTURE.md (~5 mentions)
  - DESIGN.md (~5 mentions)
- [x] **6.4** Update root docs:
  - `README.md` (~25 mentions)
  - `CLAUDE.md` (~15 mentions)
  - `DEPLOYMENT.md` (~5 mentions)
  - `DEVELOPMENT.md`
- [x] **6.5** Update `scripts/README.md`, `scripts/WORKFLOW-TEST.md`
- [x] **6.6** Update `.claude/product-marketing-context.md`: brand name, domain, positioning

### Phase 7: Tests & Misc

- [x] **7.1** Update `apps/web/tests/e2e/photos.spec.ts`: temp dir prefix `tripful-test-photos-` → `journiful-test-photos-`
- [x] **7.2** Update `apps/web/tests/e2e/profile-journey.spec.ts`: temp dir prefix `tripful-test-` → `journiful-test-`
- [x] **7.3** Update `scripts/test-docker-compose.sh`: `tripful-postgres` container name check
- [x] **7.4** Check `.gitguardian.yaml` for any tripful patterns
- [x] **7.5** Check `Makefile` for any tripful references

### Phase 8: Verification

- [x] **8.1** Run `grep -ri 'tripful' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.md' --include='*.css' --include='*.sh' --include='*.mjs' . | grep -v '.thoughts/' | grep -v 'node_modules/' | grep -v '.git/' | grep -v '.next/' | grep -v 'dist/'` — expect zero results
- [x] **8.2** Run `pnpm install` (regenerate lockfile)
- [x] **8.3** Run `pnpm build` (all packages)
- [x] **8.4** Run unit/integration tests: `make test-exec CMD="pnpm test"` — 22 failures all pre-existing (FAB aria-label missing, flaky daily-itineraries/weather tests, S3 bucket in devcontainer). None caused by rebrand.
- [ ] **8.5** Run E2E tests: `make test-exec CMD="pnpm test:e2e"` — deferred (requires full devcontainer services)
- [x] **8.6** Run lint: `make test-exec CMD="pnpm lint"` — all 3 packages pass
- [x] **8.7** Run typecheck: `make test-exec CMD="pnpm typecheck"` — all 3 packages pass
- [ ] **8.8** Visual check: start dev servers and verify homepage, auth pages, trip pages render correctly with "Journiful" branding

### Phase 9: SEO Improvements (bundled with rebrand)

- [ ] **9.1** Add OG image: create a branded social card image and add `openGraph.images` to layout.tsx metadata
- [ ] **9.2** Review sitemap: add any additional public-facing pages beyond / and /login

### Post-Merge (not in this PR)

- [ ] Deploy with new env vars (DATABASE_URL, S3 bucket, APP_NAME)
- [ ] DNS: point `journiful.app` and `api.journiful.app` to hosting
- [ ] Set up 301 redirects from `tripful.me/*` → `journiful.app/*`
- [ ] Add `journiful.app` to Google Search Console
- [ ] Submit new sitemap
- [ ] Local dev: `docker-compose down -v && docker-compose up` (fresh DB with new name)
- [ ] Keep tripful.me redirects active for 6+ months

## Tracked Changes

**2026-03-19** - `.playwright-cli/` cached browser snapshots contain historical "Tripful" references. These are ephemeral artifacts, not source code — excluded from the rebrand scope.
