# Verification: Trip Photo Upload Service

## Environment Setup

All commands run inside the devcontainer via `make test-exec CMD="..."`.

```bash
# Start container (auto-installs deps, runs migrations, sets up env)
make test-up

# Verify container is running
make test-status
```

## Test Commands

```bash
# Full test suite (unit + integration)
make test-exec CMD="pnpm test"

# Unit tests only (API)
make test-exec CMD="cd apps/api && pnpm vitest run tests/unit"

# Integration tests only (API)
make test-exec CMD="cd apps/api && pnpm vitest run tests/integration"

# Frontend tests
make test-exec CMD="cd apps/web && pnpm vitest run"

# E2E tests (Playwright)
make test-exec CMD="pnpm test:e2e"

# Linting
make test-exec CMD="pnpm lint"

# Type checking
make test-exec CMD="pnpm typecheck"

# Format check
make test-exec CMD="pnpm format"
```

## Database

```bash
# Generate migration after schema changes
make test-exec CMD="cd apps/api && pnpm db:generate"

# Apply migrations
make test-exec CMD="cd apps/api && pnpm db:migrate"

# Visual DB browser
make test-exec CMD="cd apps/api && pnpm db:studio"
```

## Manual Testing

Start dev servers inside container, then use Playwright CLI:

```bash
# Start dev servers (background)
make test-exec CMD="bash -c 'pnpm --filter @tripful/api dev & pnpm --filter @tripful/web dev & wait'"

# Playwright CLI shorthand
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"

# Open browser
make test-exec CMD="$PW_CLI open http://localhost:3000"

# Take snapshot (accessibility tree with element refs)
make test-exec CMD="$PW_CLI snapshot"

# Interact
make test-exec CMD="$PW_CLI click e5"
make test-exec CMD="$PW_CLI fill e1 'text'"
make test-exec CMD="$PW_CLI press Enter"

# Screenshot (saves to .playwright-cli/)
make test-exec CMD="$PW_CLI screenshot"

# Auth: save/load state
make test-exec CMD="$PW_CLI state-save auth.json"
make test-exec CMD="$PW_CLI state-load auth.json"
```

## Ports

| Service            | Port                           |
| ------------------ | ------------------------------ |
| Frontend (Next.js) | 3000                           |
| Backend (Fastify)  | 8000                           |
| PostgreSQL         | 5433 (host) → 5432 (container) |
| MinIO API          | 9000                           |
| MinIO Console      | 9001                           |

## Test Credentials

Auth is handled by navigating the UI (phone number login). No hardcoded tokens. Use `state-save`/`state-load` to persist auth across sessions.

## Feature Flags

None — no feature flags for this feature.

## Key Verification Points

1. **Upload flow**: Upload a photo via the trip detail page dropzone, verify it appears in the grid with a processing skeleton, then transitions to the actual image once pg-boss processes it
2. **Multi-file**: Upload 3+ photos at once, verify all appear and process
3. **Lightbox**: Click a photo, verify full-size display, test arrow navigation and swipe
4. **Caption**: Edit a caption inline, verify it persists after page refresh
5. **Delete**: Delete a photo, verify it disappears from grid and S3 objects are cleaned up
6. **Limit**: Upload 20 photos, verify the dropzone disables and shows "0 remaining"
7. **Permissions**: Non-uploaders (non-organizers) cannot edit/delete others' photos
8. **Storage**: Verify both local storage (dev) and S3/MinIO backends work
