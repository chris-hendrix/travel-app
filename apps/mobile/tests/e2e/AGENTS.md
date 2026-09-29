# E2E Tests — Playwright (mobile)

6 Playwright specs cover 6 critical user flows across the full
browser→Expo-export→API→DB stack. Ported from the retired web E2E policy
(its `tests/e2e/AGENTS.md`) after the web app was removed; the mechanics
differ (the suite drives the Expo web export, not a Next.js server) but the
policy is the same.

All E2E commands run in the devcontainer via `make test-exec CMD="..."`.
Never run Playwright on the host. E2E runs take file paths, never `--grep`
(swallowed by `test-exec`'s `bash -c`).

## Critical flows

A flow is E2E-worthy only if it meets both criteria:

1. **User-observable outcome across the full stack** — cannot be verified by
   injecting an HTTP request or testing a service method in isolation.
2. **On the approved critical-flow list** — auth, money, or core
   value-delivery for the product.

Any spec NOT on this list is an audit candidate for SPLIT / CUT / CONVERT.
New E2E tests require a one-line PR justification citing which critical flow
they cover.

| # | Critical flow | Spec | Notes |
|---|---------------|------|-------|
| 1 | **Auth** | `auth-journey.spec.ts` | Signup, logout, route guards; seeds the bearer token into `localStorage` (`lib/session.ts`) via `authenticateViaAPI` |
| 2 | **Trip CRUD** | `trip-journey.spec.ts` | CRUD chain, promote/demote, nav |
| 3 | **Invitation + RSVP + deep-link** | `invitation-journey.spec.ts` | RSVP + deep-link variants |
| 4 | **Itinerary CRUD** | `itinerary-journey.spec.ts` | Event CRUD + deleted-items restore |
| 5 | **Admin** | `admin-journey.spec.ts` | Admin user management (moved into the app; the retired web app's `/admin` is gone) |
| 6 | **Notifications** | `notifications.spec.ts` | Notification center UX (badge, tap-to-navigate, mark as read) |

## Banned at E2E level

- Form validation, field-level error messages, edge-case re-verification
- Feature-flag toggles
- Anything already asserted by a Zod schema or a Vitest unit test
- **Fat journeys:** one spec must map to one critical flow — do not conflate multiple unrelated user goals
- **Silent project drops:** never remove a project (chromium, phone) for "flakiness" without a PR and linked issue explaining the root cause

## Flakiness policy

A flaky test is a test failure — never silently ignored or worked around.

1. **Quarantine rule:** If a test fails 3 times within a 7-day window with no code changes to the test or code under test, mark it `test.skip` with an inline comment containing the owner's GitHub handle and a link to the tracking issue. The test stays skipped until the root cause is fixed — it is tracked, not forgotten.
2. **Retry cap:** Maximum 1 retry per test in CI (`retries: 1` in `playwright.config.ts`). If a test requires the retry to pass, it qualifies for quarantine under rule 1. Do not increase the retry limit to mask flakiness.
3. **Projects are never silently dropped.** Removing a project (chromium, phone) because of "flakiness" is banned without a reviewed PR and a linked GitHub issue explaining the root cause.
4. **Root-cause diagnosis is mandatory.** When a test flakes, the immediate response is diagnosis, not deletion. Check for: async race conditions, missing `waitFor` guards, shared mutable state between tests, or DB state leakage. If the root cause is unclear after 30 minutes of investigation, quarantine the test under rule 1 — do not delete it.

## Projects

Two projects share one spec tree (`playwright.config.ts`):

| Project | Viewport | Device profile |
|---------|----------|----------------|
| `chromium` | 1280×1080 | Desktop Chrome |
| `phone` | 390×844 (pinned) | Pixel 7 touch/DPR/user-agent — Pixel 7's own viewport is 412×915; pinned to 390×844, the narrowest layout the UI checks cover |

## CI gates

| Gate | Runs on | Status |
|------|---------|--------|
| Mobile Checks (lint + typecheck + unit) | Every PR | Blocking |
| Mobile E2E Tests (Playwright, 2-way sharded) | Every PR | **Blocking** — must pass to merge |
| Mobile Web Export (`export:web` → `check-export.mjs` → specs against the export via `MOBILE_WEB_TARGET=export`) | Every PR | Blocking |

## Running E2E tests

All commands run inside the devcontainer:

```bash
make test-up                          # Start container + auto-setup
make test-exec CMD="pnpm --filter @journiful/mobile test:e2e"    # Full suite (dev-server target)

# Single spec (file paths, never --grep)
make test-exec CMD="pnpm --filter @journiful/mobile test:e2e tests/e2e/auth-journey.spec.ts"

# Against the built export instead of the dev server
make test-exec CMD="MOBILE_WEB_TARGET=export pnpm --filter @journiful/mobile test:e2e"

# Playwright UI (for debugging)
make test-exec CMD="pnpm --filter @journiful/mobile exec playwright test --ui-host=0.0.0.0 --ui-port=9323"

make test-down                        # Tear down
```

`MOBILE_WEB_TARGET=export` serves the already-built `dist/` production
export, so the same specs verify the artifact users get. The E2E suite
drives the Expo web export, so it covers the web `localStorage` session
path — SecureStore and native deep links are not covered by it.

## Test data

When `ENABLE_FIXED_VERIFICATION_CODE=true` (default in dev), SMS
verification uses a fixed code **`123456`** — no real SMS is sent. Any phone
number containing "555" passes validation.

| Purpose | Phone | Code |
|---------|-------|------|
| Admin user (pre-seeded) | `+15550000001` | `123456` |
| New test user | `+1555` + any 9 digits | `123456` |

## Manual browser testing (playwright-cli)

The devcontainer ships `playwright-cli` for interactive browser sessions.
All commands require `--config .devcontainer/playwright-cli.config.json`.

```bash
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"
make test-exec CMD="$PW_CLI open http://localhost:8081"
make test-exec CMD="$PW_CLI snapshot"          # accessibility tree with element refs
make test-exec CMD="$PW_CLI click e5"
make test-exec CMD="$PW_CLI fill e1 'user@example.com'"
make test-exec CMD="$PW_CLI screenshot"        # saved to .playwright-cli/
make test-exec CMD="$PW_CLI state-save auth.json"  # reuse auth across runs
```

Auth is handled by driving the UI, not hardcoded tokens.

## Debugging

- Screenshots and videos are captured on failure in `test-results/`
- View HTML report after test run: `make test-exec CMD="npx playwright show-report"`
- Use `--ui` for interactive Playwright UI debugging
