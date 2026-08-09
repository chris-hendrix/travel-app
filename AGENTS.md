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

**All test, lint, and typecheck commands run in the devcontainer** via `make test-exec CMD="..."` (see commands above). The devcontainer pins Node, PostgreSQL, and Playwright browser versions.

#### Philosophy — hybrid
Backend (Fastify/Drizzle) uses the classic Test Pyramid: broad pure-unit base, service + route integration middle, no API-level E2E. Frontend (Next.js) uses the Testing Trophy (Kent C. Dodds): heavy RTL component-integration middle, small E2E cap.

Decision rule: **write every test at the lowest level that gives the confidence you need.** If a pure-unit test can verify the behavior, don't write a service test. If a component test renders the interaction, don't write an E2E test. Only reach for E2E when the user-observable outcome depends on the full stack.

Heuristic: **if mocking hides the failure mode you care about, write at the next level down.** Mocking the DB to make a service test fast? That belongs in service integration with a real DB. Mocking the API to avoid E2E overhead? That belongs in route integration with `app.inject()`.

#### Test level taxonomy
| Level | What it tests | Directory |
|-------|---------------|-----------|
| Pure unit | Pure functions, Zod schemas, calculations, transforms | `shared/__tests__/`, `apps/api/tests/unit/`, `apps/web/src/**/__tests__/` (pure utils only) |
| Service integration | Real Postgres; external APIs (SMS, push, S3, geocoding) mocked | `apps/api/tests/service/` |
| Route integration | Fastify `app.inject()` through route → controller → service | `apps/api/tests/integration/` |
| Component integration | RTL render + interaction; API client mocked | `apps/web/src/**/__tests__/` |
| E2E | Playwright full-stack — **critical flows only** (see `apps/web/tests/e2e/AGENTS.md`) | `apps/web/tests/e2e/` |

> **Note:** `apps/api/tests/unit/` is transitional — 22 DB-backed files were moved to `tests/service/` in Aug 2026; ~15 true-pure-unit files remain.

#### Banned at each level
- **Service integration:** No mocking the database under test. Mock external boundaries (SMS, push, S3), not the DB.
- **Route integration:** No mocking service-layer internals. Mock only external APIs at the service boundary.
- **Component integration:** No asserting CSS class strings as primary behavior check. Prefer user-facing assertions.
- **Pure unit:** No 5-mock towers that test the mocks, not behavior — move up a level.
- **E2E:** Form validation, field-level errors, edge-case re-verification, feature-flag toggles — anything already asserted by Zod/RTL. Fat journeys banned (one spec = one critical flow). **No silent browser project drops** without a PR + linked issue. Full rules, critical-flow list, flakiness policy, and CI gates in `apps/web/tests/e2e/AGENTS.md`.

#### Target shape
Backend: broad unit → service middle → route layer → no API-level E2E. Frontend: RTL is largest → pure unit utilities → E2E is smallest, capped by the 7 critical flows listed in `apps/web/tests/e2e/AGENTS.md`. New E2E test requires a one-line PR justification citing which critical flow it covers.

#### Database isolation
Each test that creates records uses `generateUniquePhone()` (or equivalent unique-key strategy). Global setup (`tests/global-setup.ts`) clears three utility tables once per suite run. Known limitation: state accumulates across test files within a run. Documented future improvement: per-test transactional rollback (`BEGIN`/`ROLLBACK`).

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
