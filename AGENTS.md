# Journiful — AGENTS.md

## WHAT

Journiful is a collaborative trip planning platform. Monorepo managed with pnpm + Turbo:

- `apps/api` — Fastify 5 REST API, PostgreSQL 16 via Drizzle ORM, JWT auth. Pattern: `buildApp` factory, route → controller → service.
- `apps/web` — Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui. Wraps into a native Android app via Capacitor 8 static export. Pattern: App Router pages with TanStack Query for server state.
- `shared` — Cross-cutting types, Zod schemas, and pure utilities consumed by both apps.

Design system: **Vivid Capri** (Mediterranean aesthetic). Tokens live in `apps/web/src/app/globals.css`.

## WHY

Journiful helps groups plan trips together: phone-native invites, shared itineraries, group event scheduling with RSVP tracking, and member availability/logistics coordination.

## HOW

### Package manager

Use **pnpm** only. Never use `npm` or `yarn` — workspace features depend on pnpm.

### Common commands

```bash
# Setup (host)
pnpm install
pnpm docker:up        # Start PostgreSQL + MinIO

# Development (host)
make migrate          # Run pending migrations (after git pull with schema changes)
make dev              # Start both servers (web:3000, api:8000)
pnpm dev:web          # Frontend only
pnpm dev:api          # Backend only

# Mobile / Capacitor (host)
make cap-apk                  # Full pipeline: static export → cap sync → assembleDebug APK
make cap-install              # Install APK on emulator + launch
make cap-run                  # cap-apk + cap-install combined (requires live reload config)
make cap-logs                 # Tail WebView JS console (chromium) logs
make cap-crash                # Dump Android crash log buffer
make adb-reverse              # Forward emulator ports 8000 & 3000 to host (use -s emulator-XXXX if multiple)
make distribute-android       # Build, sync, and distribute to Firebase App Distribution
```

### Testing — devcontainer only

**All test, lint, and typecheck commands MUST run inside the devcontainer** via `make test-exec CMD="..."`. Never run them on the host. The devcontainer pins Node, PostgreSQL, and Playwright browser versions.

```bash
make test-up                          # Start container + auto-setup
make test-exec CMD="pnpm test"        # Unit/integration (Vitest)
make test-exec CMD="pnpm test:e2e"    # E2E (Playwright)
make test-exec CMD="pnpm lint"
make test-exec CMD="pnpm typecheck"
make test-down                        # Tear down
make test-static-smoke               # Verify static export integrity (no error pages, pages render)
```

`test-exec` wraps `CMD` in `bash -c`, so compound commands work: `make test-exec CMD="cd apps/api && pnpm db:migrate"`.

### Testing methodology

#### Philosophy — hybrid
Backend (Fastify/Drizzle) uses the classic Test Pyramid: broad pure-unit base, service + route integration middle, no API-level E2E. Frontend (Next.js) uses the Testing Trophy (Kent C. Dodds): heavy React Testing Library component-integration middle, small E2E cap. This hybrid model reflects the ratios observed in the 2026 Autonoma testing framework analysis (~60/25/15 unit/integration/e2e), where AI-assisted codebases shift confidence left to the middle layers.

Decision rule: **write every test at the lowest level that gives the confidence you need.** If a pure-unit test can verify the behavior, don't write a service test. If a component test renders the interaction, don't write an E2E test. Only reach for E2E when the user-observable outcome depends on the full stack.

#### Test level taxonomy
| Level | Definition | What it tests | Directory |
|-------|-----------|---------------|-----------|
| Pure unit | Isolated logic — no DB, network, or filesystem | Pure functions, Zod schemas, validation, calculations, utility transforms, middleware logic in isolation | `shared/__tests__/`, `apps/api/tests/unit/`, `apps/web/src/**/__tests__/` (pure utils only) |
| Service integration | Service class wired to **real Postgres** via test DB; external APIs (SMS, push, S3, geocoding) mocked | Query correctness, transaction boundaries, business logic with real data, service-to-service composition | `apps/api/tests/service/` |
| Route integration | Fastify `app.inject()` through the full route → controller → service chain | Middleware wiring, auth guards, request/response contracts, HTTP status codes, header behavior | `apps/api/tests/integration/` |
| Component integration | React Testing Library render + user interaction (`fireEvent`, `userEvent`); API client mocked | Component behavior as users interact, conditional rendering, form submission UX, loading/error/empty states, accessibility | `apps/web/src/**/__tests__/` |
| E2E | Playwright — full browser → frontend → API → DB stack | Critical user journeys across the entire system (see E2E inclusion criteria below) | `apps/web/tests/e2e/` |

> **Note:** The current `apps/api/tests/unit/` directory is in a transitional state. 26 of its 36 test files hit a real Postgres — they are service integration tests, mislabeled. These files will be moved to `apps/api/tests/service/`; the remaining ~15 true-pure-unit files will stay in `tests/unit/`. The taxonomy above reflects the post-rename target state.

#### Decision rules (which level to write)
Use this table to decide which test level to write for any new behavior:

| When you are testing... | Write at this level | Rationale |
|--------------------------|---------------------|-----------|
| A pure function — validation, calculation, data transform, Zod schema | **Pure unit** | Fast, isolated, catches logic errors at the source |
| A service method that queries or mutates real data, or spans a transaction boundary | **Service integration** (real DB) | Mocking the DB hides query bugs and constraint violations |
| Middleware wiring, auth guards, or request/response contracts between components | **Route integration** | `app.inject()` exercises the full HTTP layer at a fraction of E2E cost |
| Component behavior as users interact — clicks, typing, conditional rendering, form UX | **Component integration** (RTL) | Renders the real component tree; mocks only the API boundary |
| A user-observable outcome that depends on the full browser→frontend→API→DB stack | **E2E** (Playwright) | Reserved for critical journeys (see E2E inclusion criteria) |

Heuristic: **if mocking feels necessary to make a test fast, but the mock hides the failure mode you care about, write it at the next level down the pyramid.** Mocking the DB to make a service test fast? That test belongs in service integration with a real DB. Mocking the API to avoid E2E overhead? That test belongs in route integration with `app.inject()`.

#### Banned at each level
Each level has explicit bans — these are anti-patterns caught during code review:

| Level | Banned |
|-------|--------|
| **E2E** | Form validation, field-level error messages, edge-case re-verification, feature-flag toggles, anything already asserted by a Zod schema or RTL component test. **Fat journeys**: do not conflate multiple unrelated user goals into a single spec (e.g. a "trip journey" that validates the create form AND tests the edit dialog AND checks photo upload). Each spec must map to one critical flow. **Silent browser drops**: never remove a browser project (Firefox, WebKit, tablet viewport) for "flakiness" without a PR and linked issue — see Flakiness policy. |
| **Service integration** | Mocking the database under test. If a test imports `db` or a service that queries Postgres, it must hit the real test database. Mock the external boundary (SMS, push, S3, geocoding), not the DB. |
| **Route integration** | Mocking service-layer internals. Route tests wire through real controllers and services; mock only external APIs at the service boundary. Pure-business-logic edge cases belong in service integration, not route tests. |
| **Component integration** | Asserting CSS class strings or DOM structure as the primary behavior check. Prefer user-facing assertions: "the submit button is disabled", "the error message is visible", "the loading spinner appears." Class strings may be used as secondary selectors, never as the primary assertion target. |
| **Pure unit** | Mocking so heavily that real integration failures are hidden. A unit test with 5 mocks that all return hardcoded values isn't testing behavior — it's testing mocks. If the test needs that much isolation, move it to a higher level where the wiring is real. |

#### Target test shape

The target shape is defined by intent, not by strict numerical counts:

- **Backend (API):** Broad pure-unit base → service integration middle → route integration layer → no API-level E2E. Most new backend behavior should be covered at the service or route integration level.
- **Frontend (web):** Component integration (RTL) is the largest layer → pure unit for utilities → E2E is the smallest layer, capped by the critical-flow list below.

The E2E cap is defined by the **E2E inclusion criteria** (see below), not by a coverage percentage. Hard rule: **an E2E spec may only cover a critical user flow.** Everything else must be covered at a lower level. Any new E2E test added to the suite requires a one-line justification in the PR description citing which critical flow from the list it covers. This rule (M2) is the sustaining constraint that prevents the suite from silently regrowing — a pattern observed after the Feb 2026 optimization rounds.

#### Database isolation in tests

**Current policy:** Each test that creates records uses `generateUniquePhone()` (or equivalent unique-key strategy) to avoid collisions. Global setup (`tests/global-setup.ts`) clears only three utility tables once per suite run. Cleanup helpers are imported per-test-file, not applied automatically.

**Known limitation:** State accumulates across test files within a run — which means test ordering can matter and latent order-dependence is possible. This is not a blocking issue for the current suite size but must be fixed before scaling.

**Future improvement (documented, not implemented):** Per-test transactional rollback (`BEGIN` / `ROLLBACK`) so that every test starts with a clean slate and leaves no side effects. This is the documented remediation path; do not address flakiness by adding more manual cleanup calls in individual tests.

#### Flakiness policy

A flaky test is a test failure — never silently ignored or worked around.

1. **Quarantine rule:** If a test fails 3 times within a 7-day window with no code changes to the test or the code under test, mark it `test.skip` with an inline comment containing the owner's GitHub handle and a link to the tracking issue. The test stays skipped until the root cause is fixed — it is tracked, not forgotten.

2. **Retry cap:** Maximum 1 retry per test in CI. If a test requires the retry to pass, it qualifies for quarantine under rule 1. Do not increase the retry limit to mask flakiness.

3. **Browser projects are never silently dropped.** Removing a browser project (Firefox, WebKit) or a viewport (tablet, mobile) because of "flakiness" is banned without a reviewed PR and a linked GitHub issue explaining the root cause. This rule directly overrides the precedent set by commit `1f7fa72`, which dropped Firefox, WebKit, and iPad with the comment "flakiness, not real bugs."

4. **Root-cause diagnosis is mandatory.** When a test flakes, the immediate response is diagnosis, not deletion. Check for: async race conditions, missing `waitFor` guards, shared mutable state between tests, or DB state leakage. If the root cause is unclear after 30 minutes of investigation, quarantine the test under rule 1 — do not delete it.

#### E2E inclusion criteria (critical flows)

A flow is E2E-worthy only if it meets both criteria:

1. **User-observable outcome across the full stack** — the behavior cannot be verified by rendering a component, injecting an HTTP request, or testing a service method in isolation. It requires the real browser→frontend→API→DB pipeline.
2. **On the approved critical-flow list** — the flow represents auth, money, or core value-delivery for the product.

Everything else is covered at a lower test level. The critical-flow list is the cap on the E2E suite; no spec outside this list may remain in `apps/web/tests/e2e/`.

**Approved critical-flow list (Aug 2026):**

| # | Critical flow | What it verifies | Current spec |
|---|---------------|------------------|-------------|
| 1 | **Auth** | Phone verification → complete profile → dashboard access, logout, route guards | `auth-journey.spec.ts` |
| 2 | **Trip CRUD** | Create trip → edit details → delete trip, member-permission boundaries | `trip-journey.spec.ts` |
| 3 | **Invitation + RSVP + deep-link join** | Receive invitation → RSVP (accept/decline) → deep-link join (unauthenticated & authenticated flows) | `invitation-journey.spec.ts` |
| 4 | **Itinerary CRUD** | Event create → edit → delete on a real trip | `itinerary-journey.spec.ts` |
| 5 | **Messaging** | Send message → receive message → organizer actions | `messaging.spec.ts` |
| 6 | **Settle** | Create expense → verify balance accuracy (money path — correctness is critical) | `settle-journey.spec.ts` |
| 7 | **Notifications** | Bell badge → tap to open notification center → tap notification to navigate → mark as read. Notification *triggers* (badge appearance after invite, message, etc.) may be asserted inline within flows 1-5; the standalone spec covers the notification center UX itself. | `notifications.spec.ts` |

Any E2E spec NOT on this list is an audit candidate for SPLIT / CUT / CONVERT. The Phase 2 audit (separate plan) will produce a verdict table for all 13 current spec files.

#### CI testing policy

**Current state (Aug 2026):**

| Gate | Runs on | Status |
|------|---------|--------|
| E2E (Playwright) | Every PR, 4-way sharded | **Blocking** — must pass to merge |
| API tests (Vitest) | Every PR (api path filter) | Blocking |
| Web RTL + shared unit (Vitest) | Local only | **Not in CI** |
| Lint + typecheck | Every PR | Blocking |

This means the slowest, most expensive layer gates PRs while the fast, broad coverage layers (1,224 web RTL + 331 shared unit cases) have no CI presence. This is a known gap — the immediate policy is unchanged (E2E stays blocking) to avoid destabilizing the merge gate.

**Documented follow-ups (deferred, not in this plan):**

1. Add web RTL + shared unit Vitest to CI as a cheap, fast gate that runs before E2E.
2. Split the E2E suite into `@smoke` (PR gate, ~5 min) vs. full (runs on main, ~60 min).
3. Set a flakiness budget: if E2E flake rate exceeds 5% in a rolling 7-day window, no new E2E tests may be added until the budget recovers.
4. Consider enabling Playwright tracing-on-failure for CI artifacts.

### Native (Capacitor)

`apps/web` wraps into an Android APK via Capacitor 8 static export. The web PWA and server-rendered deployment remain untouched. Push uses FCM on native, VAPID on web.

**One-time setup:**
- Android Studio on Windows (not in WSL2) — SDK 33+, create a Pixel emulator
- WSL2 ADB interop: set `ANDROID_HOME` to the Windows SDK path, `alias adb='adb.exe'`
- Port forwarding: run `make adb-reverse` before starting the emulator (forwards localhost:8000 and :3000 to host)
- Firebase project with Cloud Messaging → `google-services.json` → `apps/web/android/app/`
- Firebase service account → `FIREBASE_SERVICE_ACCOUNT` in `apps/api/.env`

**Env vars:**
| Var | Where | Purpose |
|-----|-------|---------|
| `NEXT_EXPORT=true` | build-time | Triggers static export (set by `make build-mobile`) |
| `CAPACITOR_LIVE_RELOAD=true` | `.env.local` | Dev mode — loads from `http://10.0.2.2:3000` on emulator |
| `FIREBASE_SERVICE_ACCOUNT` | `apps/api/.env` | Firebase Admin SDK JSON (single line) for FCM push |
| `NEXT_PUBLIC_API_URL` | build-time / CI | API base URL for browser-side requests. Must be set to `https://api.journiful.app/api` for distribution builds. Local dev defaults to `http://localhost:8000/api` via `.env.local`. |
| `make adb-reverse` | host setup | Forwards emulator ports 8000 & 3000 to host (required for dev API access) |

**Dev workflow (with Android Studio):**
```
# Terminal 1: Start API + web with hot reload
make dev

# Terminal 2: Sync + launch on emulator with live reload
make cap-dev
# Then open apps/web/android/ in Android Studio, press ▶ Run
```
Code changes to the web app are hot-reloaded instantly in the emulator.

**CLI-only QA (no Android Studio):**
```bash
# Windows PowerShell: start emulator
& "$env:ANDROID_HOME\emulator\emulator" -avd <avd_name> -no-boot-anim

# WSL2: build, sync, and launch
make dev                              # Terminal 1: API + web
make adb-reverse                      # Forward ports
make cap-dev                          # Sync with live reload
adb shell am start -n com.journiful.app/.MainActivity   # Launch app

# WSL2: watch logs
adb logcat chromium:V *:S             # JS console output
adb logcat AndroidRuntime:E *:S       # Crash logs
```

**Build pipeline:**
```
make build-mobile → out/ → npx cap sync → android/ assets
                                        → ./gradlew assembleDebug → APK
```

**WebView debugging (Chrome DevTools):**

1. `WebView.setWebContentsDebuggingEnabled(true)` is enabled in `MainActivity.java`
2. Forward the DevTools socket: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` (get PID from `adb shell pidof com.journiful.app`)
3. On Windows (as Administrator), bridge the port from WSL2:
   ```
   netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
   ```
4. Access from Windows Chrome at `chrome://inspect` or `http://localhost:9222`
5. To access from WSL2, find the Windows host IP: `ip route show default | awk '{print $3}'` — then use `http://<WINDOWS_IP>:9222/json`

**Architecture:**
- Export uses `assetPrefix: ''` for `file://` asset resolution in Capacitor WebView.
- Server-side `cookies()`/`headers()` skipped in export mode via `NEXT_EXPORT` guard; client-side auth provider handles authentication at runtime.
- Push routes by platform: Capacitor FCM plugin on native, Web Push API on web.
- `CapacitorHttp` fetch patching (`{ enabled: true }`) routes all `window.fetch()` calls through native HTTP on Android, bypassing CORS entirely. On web, falls back to normal `fetch()`. Configured in `capacitor.config.ts`.

### Mock auth for local testing

When `ENABLE_FIXED_VERIFICATION_CODE=true` (default in dev), SMS verification uses a fixed code **`123456`** — no real SMS is sent. Any phone number containing "555" passes validation (e.g., `+1 555 123 4567`).

**Test credentials:**

| Purpose | Phone | Code |
|---------|-------|------|
| Admin user (pre-seeded) | `+15550000001` | `123456` |
| New test user | `+1555` + any 9 digits | `123456` |

### Manual browser testing (playwright-cli)

The devcontainer ships `playwright-cli` for interactive browser sessions. All commands require `--config .devcontainer/playwright-cli.config.json`.

```bash
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"
make test-exec CMD="$PW_CLI open http://localhost:3000"
make test-exec CMD="$PW_CLI snapshot"          # accessibility tree with element refs
make test-exec CMD="$PW_CLI click e5"
make test-exec CMD="$PW_CLI fill e1 'user@example.com'"
make test-exec CMD="$PW_CLI screenshot"        # saved to .playwright-cli/
make test-exec CMD="$PW_CLI state-save auth.json"  # reuse auth across runs
```

Auth is handled by driving the UI, not hardcoded tokens.

### Database changes

1. Edit schema in `apps/api/src/db/schema/`
2. `cd apps/api && pnpm db:generate` — generates migration SQL
3. Review generated SQL in `apps/api/src/db/migrations/`
4. `pnpm db:migrate` — apply

### Shared code

Place cross-cutting code in `shared/` (`types/`, `schemas/`, `utils/`), exported through barrel `index.ts` files. Import via the workspace package:

- Use: `import { ... } from '@journiful/shared/schemas'`
- Available: `@journiful/shared`, `@journiful/shared/types`, `@journiful/shared/schemas`, `@journiful/shared/utils`

### Environment

Copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.local.example` → `apps/web/.env.local`. Required: `DATABASE_URL` and `JWT_SECRET` (min 32 chars).

Google Maps Platform (Discover, Autocomplete, Geocoding, Timezone) replaces the former Foursquare integration. See `GOOGLE_MAPS_API_KEY` in `apps/api/.env.example`.

### Ports

Frontend `3000`, API `8000`, PostgreSQL `5433` → container `5432`, MinIO API `9000`, MinIO Console `9001`, Playwright UI `9323`, Android emulator `adb` over TCP `5037`.

## Constraints

- **Tailwind v4 `@theme` colors must be hex, never `hsl()`.** Tailwind v4 strips the `hsl()` wrapper, leaving raw channel values like `0 0% 100%` which are invalid CSS. Browsers fall back to `transparent` and every background goes see-through. See `apps/web/src/app/globals.css`.
- **Static export requires `assetPrefix: ''` (empty string), not `'./'`.** Next.js font loading rejects relative prefixes; empty string produces root-relative paths that Capacitor's WebView resolves correctly from `file:///android_asset/`.
- **Shared package imports use no file extensions**, despite the repo running NodeNext. Next.js `transpilePackages` requires extensionless imports; the resulting TS2835 warnings are cosmetic and must be ignored. Always import as `@journiful/shared/schemas`, never `'../../../shared/schemas/index.js'`.
- **No `[id]` dynamic route segments.** Static export can't render them at runtime. Use query params instead (`/trips?id=X`), read via `useSearchParams()` in client components. Server components in static export cannot `await searchParams` — all search param reading must be client-side, wrapped in `<Suspense>`.
- **`redirect()` must NEVER be inside `try/catch`.** Next.js's `redirect()` works by throwing `NEXT_REDIRECT` internally. Catching it suppresses the redirect and produces "unexpected end of stream" errors. Only wrap `cookies()` in try/catch; keep `redirect()` outside.
- **Layouts that check `cookies()` for auth need a `NEXT_EXPORT` guard.** During `next build --export`, `cookies()` returns empty — without a guard, `redirect("/login")` fires and all protected pages render as error pages (`__next_error__`). Check `process.env.NEXT_EXPORT === "true"` to skip the redirect during export; client-side auth handles it at runtime.
- **Deployment topology**: see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Railway services, environments, and dashboard configuration.
