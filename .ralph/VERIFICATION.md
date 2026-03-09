# Verification: Weather Feature

## Environment Setup

All tests run inside the devcontainer. Start it first:

```bash
make test-up          # Start container + auto-setup (deps, migrations, env)
make test-status      # Verify container is running
```

## Test Commands

All commands via `make test-exec CMD="..."`:

### Type Check
```bash
make test-exec CMD="pnpm typecheck"
```

### Lint
```bash
make test-exec CMD="pnpm lint"
```

### Unit & Integration Tests
```bash
# All tests
make test-exec CMD="pnpm test"

# API tests only
make test-exec CMD="pnpm --filter @tripful/api test"

# Web tests only
make test-exec CMD="pnpm --filter @tripful/web test"

# Shared tests only
make test-exec CMD="pnpm --filter @tripful/shared test"

# Specific test file
make test-exec CMD="pnpm --filter @tripful/api test -- src/services/__tests__/weather.service.test.ts"
```

### E2E Tests
```bash
make test-exec CMD="pnpm test:e2e"
```

### Full Suite
```bash
make test-run    # Runs unit + E2E
```

### Format
```bash
make test-exec CMD="pnpm format"
```

## Database

Migrations run automatically during `make test-up` setup. For manual migration:

```bash
make test-exec CMD="cd apps/api && pnpm db:generate"
make test-exec CMD="cd apps/api && pnpm db:migrate"
```

## Manual Testing (Playwright CLI)

Start dev servers inside the container, then use playwright-cli:

```bash
# Start servers
make test-exec CMD="bash -c 'pnpm --filter @tripful/api dev & pnpm --filter @tripful/web dev & wait'"

# Navigate and interact
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"
make test-exec CMD="$PW_CLI open http://localhost:3000"
make test-exec CMD="$PW_CLI snapshot"
make test-exec CMD="$PW_CLI screenshot"

# Save/restore auth
make test-exec CMD="$PW_CLI state-save auth.json"
make test-exec CMD="$PW_CLI state-load auth.json"
```

## Ports

| Service | Port |
|---------|------|
| Frontend (Next.js) | 3000 |
| Backend (Fastify) | 8000 |
| PostgreSQL | 5432 (inside container) |
| MinIO | 9000 |

## Feature Flags

None — this feature has no feature flags. Weather is visible to all trip members once a trip has coordinates and dates.

## Third-Party Services

**Open-Meteo** (no API key required):
- Geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Forecast: `https://api.open-meteo.com/v1/forecast`

Both are free, public APIs. No setup or credentials needed. The devcontainer has internet access for these calls.

## Test Data

For manual testing, create a trip via the UI:
- Destination: "San Diego, CA" (or any real location)
- Start date: within 16 days of today
- End date: a few days after start

Verify:
1. Weather forecast card appears above itinerary
2. Day badges show in day-by-day view headers
3. Changing destination updates weather
4. Setting dates >16 days shows "available closer to trip" message
5. °C/°F toggle in profile settings changes temperature display
