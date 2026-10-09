# Journiful — AGENTS.md

## WHAT

Journiful is a collaborative trip planning platform. Monorepo managed with pnpm + Turbo:

- `apps/mobile` — Expo 57. **The product.** Wired to the API and shipped two ways: as the Android app (prebuild + gradle) and as the static web export at `journiful.app`. Lane rules live in `apps/mobile/AGENTS.md`.
- `apps/api` — Fastify 5 REST API, PostgreSQL 16 via Drizzle ORM, JWT auth. Pattern: `buildApp` factory, route → controller → service. The backend for the app.
- `shared` — Cross-cutting types, Zod schemas, and pure utilities consumed by the app and the API.

Design system: **Vivid Capri** (Mediterranean aesthetic). The source of truth is `apps/mobile`: its tokens in `global.css`, its components, and the lab at `/design` that documents them.

### Direction — the product moved from the web app to the Expo app

Stated up front because it decides where work goes, and it is easy to infer the opposite from the repo as it stands:

| | Before | Now |
| --- | --- | --- |
| `apps/mobile` | design mockup, in-memory data | the product; wired to the API, the Android app, and the web export |
| The retired web app (removed 2026-09) | the frozen web app, rollback target and home of `/admin` | deleted; the recovery recipe in `DEPLOYMENT.md` is the only surviving record |
| `apps/api` | the backend | unchanged; both surfaces talk to it |
| `shared` | cross-cutting types and schemas | unchanged |

This means:

- **New product work goes in `apps/mobile`.** The retired web app is gone (see `DEPLOYMENT.md` for the recovery recipe). Do not reintroduce a second product surface.
- **Auth differs by surface.** The Expo web export keeps a bearer token in `localStorage` (`apps/mobile/lib/session.ts`); the native app uses SecureStore. The web-export token storage is the weaker of the two and is accepted for now; the follow-up is cookie auth on web or the native app.
- **The Capacitor pipeline is gone.** `make cap-*`, `capacitor.config.ts` and the `@capacitor/*` dependencies were deleted; the Android app is built from `apps/mobile` (`make android-apk`).
- **`journiful.app` serves the Expo web export.** The apex points at the `web` service (called `static` until 2026-09-29); `beta.journiful.app` was retired the same day. `/admin` lives in the app.

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
make dev              # Start dev servers (api:8000, expo:8081)
make mockup           # The design mockup in a browser (design system at /design)
pnpm dev:api          # Backend only

# Mobile / Android (host) — the Expo app in apps/mobile
make android-dev              # Prebuild (if needed) + run on the emulator
make android-apk              # Prebuild + assemble the signed release APK
make android-install          # Install the release APK on the emulator + launch
make android-logs             # Tail native logs
make adb-reverse              # Forward emulator ports 8000 & 8081 to host (use -s emulator-XXXX if multiple)

# Android builds run in CI: .github/workflows/distribute.yml prebuilds,
# signs with the upload key, and ships to Firebase App Distribution.
```

### Testing — devcontainer only

**All test, lint, and typecheck commands MUST run inside the devcontainer** via `make test-exec CMD="..."`. Never run them on the host. The devcontainer pins Node, PostgreSQL, and Playwright browser versions.

```bash
make test-up                          # Start container + auto-setup
make test-exec CMD="pnpm test"        # Unit/integration (Vitest)
make test-exec CMD="pnpm test:e2e"    # E2E (Playwright, the mobile suite)
make test-exec CMD="pnpm lint"
make test-exec CMD="pnpm typecheck"
make test-down                        # Tear down
```

`test-exec` wraps `CMD` in `bash -c`, so compound commands work: `make test-exec CMD="cd apps/api && pnpm db:migrate"`.

### Testing methodology

**All test, lint, and typecheck commands run in the devcontainer** via `make test-exec CMD="..."` (see commands above). The devcontainer pins Node, PostgreSQL, and Playwright browser versions.

#### Philosophy — hybrid
Backend (Fastify/Drizzle) uses the classic Test Pyramid: broad pure-unit base, service + route integration middle, no API-level E2E. The mobile app (Expo, no renderer) covers logic with Vitest unit tests and user-observable outcomes with Playwright E2E against the web export.

Decision rule: **write every test at the lowest level that gives the confidence you need.** If a pure-unit test can verify the behavior, don't write a service test. If a unit test covers the logic, don't write an E2E test. Only reach for E2E when the user-observable outcome depends on the full stack.

Heuristic: **if mocking hides the failure mode you care about, write at the next level down.** Mocking the DB to make a service test fast? That belongs in service integration with a real DB. Mocking the API to avoid E2E overhead? That belongs in route integration with `app.inject()`.

#### Test level taxonomy
| Level | What it tests | Directory |
|-------|---------------|-----------|
| Pure unit | Pure functions, Zod schemas, calculations, transforms | `shared/__tests__/`, `apps/api/tests/unit/`, `apps/mobile/__tests__/` |
| Service integration | Real Postgres; external APIs (SMS, push, S3, geocoding) mocked | `apps/api/tests/service/` |
| Route integration | Fastify `app.inject()` through route → controller → service | `apps/api/tests/integration/` |
| E2E | Playwright full-stack — **critical flows only** (see `apps/mobile/tests/e2e/AGENTS.md`) | `apps/mobile/tests/e2e/` |

> **Note:** `apps/api/tests/unit/` is transitional — 22 DB-backed files were moved to `tests/service/` in Aug 2026; ~15 true-pure-unit files remain.

#### Banned at each level
- **Service integration:** No mocking the database under test. Mock external boundaries (SMS, push, S3), not the DB.
- **Route integration:** No mocking service-layer internals. Mock only external APIs at the service boundary.
- **Pure unit:** No 5-mock towers that test the mocks, not behavior — move up a level.
- **E2E:** Form validation, field-level errors, edge-case re-verification, feature-flag toggles — anything already asserted by Zod or a unit test. Fat journeys banned (one spec = one critical flow). **No silent browser project drops** without a PR + linked issue. Full rules, critical-flow list, flakiness policy, and CI gates in `apps/mobile/tests/e2e/AGENTS.md`.

#### Target shape
Backend: broad unit → service middle → route layer → no API-level E2E. Mobile: Vitest unit tests are the base → E2E is smallest, capped by the critical flows listed in `apps/mobile/tests/e2e/AGENTS.md` (the suite has no renderer — `apps/mobile/vitest.config.ts` is plain node). New E2E test requires a one-line PR justification citing which critical flow it covers.

#### Database isolation
Each test that creates records uses `generateUniquePhone()` (or equivalent unique-key strategy). Global setup (`tests/global-setup.ts`) clears three utility tables once per suite run. Known limitation: state accumulates across test files within a run. Documented future improvement: per-test transactional rollback (`BEGIN`/`ROLLBACK`).

### Native (Android)

The Android app is a build of `apps/mobile` — Expo prebuild produces `android/`, gradle assembles it, and the APK is signed with the upload key. There is no Capacitor shell and no WebView wrapper any more; the details live in `apps/mobile/AGENTS.md`, and this section carries only what is repo-wide.

**One-time setup (host):**
- A JDK 21 (`apps/api/.env` `JAVA_HOME`, the same one the API's gradle path used)
- A WSL2 Android SDK (platform 36, build-tools 36) with `ANDROID_HOME` exported, or Android Studio on Windows with `adb.exe` — emulator interaction goes through `make adb-reverse` + `make android-install`
- The upload keystore at `~/keys/journiful-upload.keystore` with its four `JOURNIFUL_*` properties in `~/.gradle/gradle.properties` (never committed; CI reads the same values from GitHub secrets)
- `apps/mobile/google-services.json` (untracked; copy from the Firebase console or ask a maintainer, or let CI write it from `secrets.GOOGLE_SERVICES_JSON`)
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

CI builds two ABIs rather than four (`-PreactNativeArchitectures=arm64-v8a,x86_64`), and `x86_64` is in that list for one reason: a PR's APK artifact is how the app reaches the Windows emulator, since `make android-apk` cannot run against a Windows `ANDROID_HOME`. It also keeps a `ccache` directory between runs, because the native C++ is two thirds to three quarters of that job and no gradle cache can hold it — `prebuild --clean` plus a fresh install leaves every `.cxx` directory empty, and AGP does not mark its CMake tasks cacheable. `make android-apk` still builds all four ABIs.

**Architecture:**
- Push is FCM with the raw device token (`getDevicePushTokenAsync()`), registered against the API's existing `POST /push/subscribe {provider:"fcm"}`. No Expo push service and no EAS credentials are involved.
- Version identity lives in `app.json` (`version`, `android.versionCode`). Capacitor's `-PversionNameOverride` gradle property is gone and the generated gradle never read it; CI rewrites the two `app.json` fields before prebuild instead.
- Release signing comes from `apps/mobile/plugins/withAndroidSigning.cjs`, not a hand-edited `android/app/build.gradle`, because `expo prebuild --clean` regenerates that file.

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
make test-exec CMD="$PW_CLI open http://localhost:8081"
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

Copy `apps/api/.env.example` → `apps/api/.env`. Required: `DATABASE_URL` and `JWT_SECRET` (min 32 chars).

Google Maps Platform (Discover, Autocomplete, Geocoding, Timezone) replaces the former Foursquare integration. See `GOOGLE_MAPS_API_KEY` in `apps/api/.env.example`.

### Ports

Expo web / mockup `8081`, API `8000`, PostgreSQL `5433` → container `5432`, MinIO API `9000`, MinIO Console `9001`, Playwright UI `9323`, Android emulator `adb` over TCP `5037`.

## Constraints

- **Tailwind v4 `@theme` colors must be hex, never `hsl()`.** Tailwind v4 strips the `hsl()` wrapper, leaving raw channel values like `0 0% 100%` which are invalid CSS. Browsers fall back to `transparent` and every background goes see-through. See `apps/mobile/global.css`.
- **Shared package imports use no file extensions**, despite the repo running NodeNext. Metro and NativeWind require extensionless imports; the resulting TS2835 warnings are cosmetic and must be ignored. Always import as `@journiful/shared/schemas`, never `'../../../shared/schemas/index.js'`.
- **No `[id]` dynamic route segments.** The Expo export has no server components: screens read query params (`/trips/detail?id=X`) via `useLocalSearchParams()` inside a `<Suspense>` boundary.
- **Deployment topology**: see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Railway services, environments, and dashboard configuration.
- **Scope every filesystem search; never run `find /`.** This workspace is on WSL2, where `/mnt/c` makes an unscoped `find` effectively unbounded — it hangs agents for minutes on a command that should take milliseconds. Use `grep -rn`, `git ls-files`, or `find <dir> -maxdepth N`, and never lean on `find / … || fallback` chains, because a mistyped path silently promotes to a full-disk scan. pnpm nests packages at `node_modules/.pnpm/<name>@<version>/node_modules/`, so a bare `node_modules/<name>/` path usually does not exist.
