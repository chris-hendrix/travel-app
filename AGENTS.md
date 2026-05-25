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
make build-mobile                                     # Static export for Android APK
cd apps/web && npx cap sync                           # Sync web assets into Android project
cd apps/web/android && ./gradlew assembleDebug       # Build debug APK
make distribute-android                               # Build, sync, and distribute to Firebase App Distribution
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
```

`test-exec` wraps `CMD` in `bash -c`, so compound commands work: `make test-exec CMD="cd apps/api && pnpm db:migrate"`.

### Native (Capacitor)

`apps/web` wraps into an Android APK via Capacitor 8 static export. The web PWA and server-rendered deployment remain untouched. Push uses FCM on native, VAPID on web.

**One-time setup:**
- Android Studio on Windows (not in WSL2) — SDK 33+, create a Pixel emulator
- WSL2 ADB interop: set `ANDROID_HOME` to the Windows SDK path, `alias adb='adb.exe'`
- Firebase project with Cloud Messaging → `google-services.json` → `apps/web/android/app/`
- Firebase service account → `FIREBASE_SERVICE_ACCOUNT` in `apps/api/.env`

**Env vars:**
| Var | Where | Purpose |
|-----|-------|---------|
| `NEXT_EXPORT=true` | build-time | Triggers static export (set by `make build-mobile`) |
| `CAPACITOR_LIVE_RELOAD=true` | `.env.local` | Dev mode — loads from `http://10.0.2.2:3000` on emulator |
| `FIREBASE_SERVICE_ACCOUNT` | `apps/api/.env` | Firebase Admin SDK JSON (single line) for FCM push |

**Build pipeline:**
```
make build-mobile → out/ → npx cap sync → android/ assets
                                        → ./gradlew assembleDebug → APK
```

**Architecture:**
- Export uses `assetPrefix: ''` for `file://` asset resolution in Capacitor WebView.
- Server-side `cookies()`/`headers()` skipped in export mode; `<AuthGuard>` client component guards authenticated routes instead.
- Push routes by platform: Capacitor FCM plugin on native, Web Push API on web.

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

### Ports

Frontend `3000`, API `8000`, PostgreSQL `5433` → container `5432`, MinIO API `9000`, MinIO Console `9001`, Playwright UI `9323`, Android emulator `adb` over TCP `5037`.

## Constraints

- **Tailwind v4 `@theme` colors must be hex, never `hsl()`.** Tailwind v4 strips the `hsl()` wrapper, leaving raw channel values like `0 0% 100%` which are invalid CSS. Browsers fall back to `transparent` and every background goes see-through. See `apps/web/src/app/globals.css`.
- **Static export requires `assetPrefix: ''` (empty string), not `'./'`.** Next.js font loading rejects relative prefixes; empty string produces root-relative paths that Capacitor's WebView resolves correctly from `file:///android_asset/`.
- **Shared package imports use no file extensions**, despite the repo running NodeNext. Next.js `transpilePackages` requires extensionless imports; the resulting TS2835 warnings are cosmetic and must be ignored. Always import as `@journiful/shared/schemas`, never `'../../../shared/schemas/index.js'`.
- **Deployment topology**: see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Railway services, environments, and dashboard configuration.
