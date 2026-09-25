# Journiful — AGENTS.md

## WHAT

Journiful is a collaborative trip planning platform. Monorepo managed with pnpm + Turbo:

- `apps/mobile` — Expo 57. **The product.** Wired to the API and shipped two ways: as the Android app (prebuild + gradle) and as the static web export at `journiful.app`. Lane rules live in `apps/mobile/AGENTS.md`.
- `apps/api` — Fastify 5 REST API, PostgreSQL 16 via Drizzle ORM, JWT auth. Pattern: `buildApp` factory, route → controller → service. The backend for both surfaces.
- `apps/web` — Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui. **Frozen** — the rollback target (its own Railway hostname) and the home of `/admin`. No Capacitor: the Android app is `apps/mobile` now.
- `shared` — Cross-cutting types, Zod schemas, and pure utilities consumed by both apps.

Design system: **Vivid Capri** (Mediterranean aesthetic). The source of truth is `apps/mobile`: its tokens in `global.css`, its components, and the lab at `/design` that documents them. `apps/web/src/app/globals.css` carries the web app's own tokens, which go with the web app.

### Direction — the product moved from the web app to the Expo app

Stated up front because it decides where work goes, and it is easy to infer the opposite from the repo as it stands:

| | Before | Now |
| --- | --- | --- |
| `apps/mobile` | design mockup, in-memory data | the product; wired to the API, the Android app, and the web export |
| `apps/web` | the shipped web app, and through Capacitor the shipped Android app | frozen; the rollback target and the home of `/admin` on its own Railway hostname |
| `apps/api` | the backend | unchanged; both surfaces talk to it |
| `shared` | cross-cutting types and schemas | unchanged |

This means:

- **New product work goes in `apps/mobile`.** `apps/web` is frozen: it stays deployed on its own Railway hostname as the rollback target and the home of `/admin`. Do not change it except to keep the rollback working.
- **Auth differs by surface.** The Expo web export keeps a bearer token in `localStorage` (`apps/mobile/lib/session.ts`); the Next app uses an httpOnly cookie session. The web-export token storage is the weaker of the two and is accepted for now; the follow-up is cookie auth on web or the native app.
- **The Capacitor pipeline is gone.** `make cap-*`, `apps/web/android/`, `capacitor.config.ts` and the `@capacitor/*` dependencies were deleted; the Android app is built from `apps/mobile` (`make android-apk`). `make build-mobile` still exists but is only the frozen web app's static export, kept because `test-static-smoke` builds it.
- **`journiful.app` serves the Expo web export.** The apex and `beta.journiful.app` point at the `static` service; the frozen `web` service answers on its own Railway hostname (and owns `/admin`). Re-pointing the apex is the rollback.

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
make mockup           # The design mockup in a browser (design system at /design)
pnpm dev:web          # Frontend only
pnpm dev:api          # Backend only

# Mobile / Android (host) — the Expo app in apps/mobile
make android-dev              # Prebuild (if needed) + run on the emulator
make android-apk              # Prebuild + assemble the signed release APK
make android-install          # Install the release APK on the emulator + launch
make android-logs             # Tail native logs
make adb-reverse              # Forward emulator ports 8000 & 3000 to host (use -s emulator-XXXX if multiple)

# Android builds run in CI: .github/workflows/distribute.yml prebuilds,
# signs with the upload key, and ships to Firebase App Distribution.
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

### Native (Android)

The Android app is a build of `apps/mobile` — Expo prebuild produces `android/`, gradle assembles it, and the APK is signed with the upload key. There is no Capacitor shell and no WebView wrapper any more; the details live in `apps/mobile/AGENTS.md`, and this section carries only what is repo-wide.

**One-time setup (host):**
- A JDK 21 (`apps/api/.env` `JAVA_HOME`, the same one the API's gradle path used)
- A WSL2 Android SDK (platform 36, build-tools 36) with `ANDROID_HOME` exported, or Android Studio on Windows with `adb.exe` — emulator interaction goes through `make adb-reverse` + `make android-install`
- The upload keystore at `~/keys/journiful-upload.keystore` with its four `JOURNIFUL_*` properties in `~/.gradle/gradle.properties` (never committed; CI reads the same values from GitHub secrets)
- `apps/mobile/google-services.json` (untracked; copy from `apps/web/android/app/` or let CI write it from `secrets.GOOGLE_SERVICES_JSON`)
- Firebase service account → `FIREBASE_SERVICE_ACCOUNT` in `apps/api/.env`, which is what actually sends FCM

**Env vars:**
| Var | Where | Purpose |
|-----|-------|---------|
| `EXPO_PUBLIC_API_URL` | build-time | API base URL inlined into the bundle. Distribution builds use `https://api.journiful.app/api`; a local build against `make dev` needs `make adb-reverse` (or `10.0.2.2`). |
| `JOURNIFUL_KEYSTORE`, `JOURNIFUL_KEY_ALIAS`, `JOURNIFUL_STORE_PASSWORD`, `JOURNIFUL_KEY_PASSWORD` | `~/.gradle/gradle.properties` / CI | The upload key the release build is signed with. |
| `FIREBASE_SERVICE_ACCOUNT` | `apps/api/.env` | Firebase Admin SDK JSON (single line) for FCM push. |

**Build pipeline:**
```
make android-apk → expo prebuild -p android --clean → android/ → ./gradlew assembleRelease → signed APK
CI: .github/workflows/distribute.yml does the same on ubuntu, then firebase appdistribution:distribute
```

**Architecture:**
- Push is FCM with the raw device token (`getDevicePushTokenAsync()`), registered against the API's existing `POST /push/subscribe {provider:"fcm"}`. No Expo push service and no EAS credentials are involved.
- Version identity lives in `app.json` (`version`, `android.versionCode`). Capacitor's `-PversionNameOverride` gradle property is gone and the generated gradle never read it; CI rewrites the two `app.json` fields before prebuild instead.
- Release signing comes from `apps/mobile/plugins/withAndroidSigning.js`, not a hand-edited `android/app/build.gradle`, because `expo prebuild --clean` regenerates that file.
- The frozen web app kept `assetPrefix: ''` and the `NEXT_EXPORT` guards (see Constraints); those are still what its static export needs.

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
- **Static export requires `assetPrefix: ''` (empty string), not `'./'`.** Next.js font loading rejects relative prefixes; empty string produces root-relative paths. The frozen web app's static export is what still depends on this.
- **Shared package imports use no file extensions**, despite the repo running NodeNext. Next.js `transpilePackages` requires extensionless imports; the resulting TS2835 warnings are cosmetic and must be ignored. Always import as `@journiful/shared/schemas`, never `'../../../shared/schemas/index.js'`.
- **No `[id]` dynamic route segments.** Static export can't render them at runtime. Use query params instead (`/trips?id=X`), read via `useSearchParams()` in client components. Server components in static export cannot `await searchParams` — all search param reading must be client-side, wrapped in `<Suspense>`.
- **`redirect()` must NEVER be inside `try/catch`.** Next.js's `redirect()` works by throwing `NEXT_REDIRECT` internally. Catching it suppresses the redirect and produces "unexpected end of stream" errors. Only wrap `cookies()` in try/catch; keep `redirect()` outside.
- **Layouts that check `cookies()` for auth need a `NEXT_EXPORT` guard.** During `next build --export`, `cookies()` returns empty — without a guard, `redirect("/login")` fires and all protected pages render as error pages (`__next_error__`). Check `process.env.NEXT_EXPORT === "true"` to skip the redirect during export; client-side auth handles it at runtime.
- **Deployment topology**: see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Railway services, environments, and dashboard configuration.
