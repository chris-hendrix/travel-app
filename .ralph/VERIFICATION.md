# Verification: Frontend Design Polish

## Environment Setup

All commands run inside the devcontainer via `make test-exec CMD="..."`.

```bash
# Start container (if not running)
make test-up

# Check status
make test-status
```

### Dev Servers (for manual testing)

Start both servers inside the container:

```bash
make test-exec CMD="bash -c 'pnpm --filter @tripful/api dev & pnpm --filter @tripful/web dev & wait'"
```

## Test Commands

All commands via `make test-exec CMD="..."`:

| Check | Command |
|-------|---------|
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit/Integration | `pnpm test` |
| E2E | `pnpm test:e2e` |
| Format | `pnpm format` |
| Full suite | `pnpm test && pnpm test:e2e` |

## Ports & URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000/api |
| PostgreSQL | localhost:5433 |
| MinIO | localhost:9000 (API), localhost:9001 (Console) |

## Manual Testing (Playwright CLI)

The devcontainer includes `playwright-cli`. All commands require the config flag.

```bash
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"

# Open browser
make test-exec CMD="$PW_CLI open http://localhost:3000"

# Snapshot (accessibility tree with element refs)
make test-exec CMD="$PW_CLI snapshot"

# Interact
make test-exec CMD="$PW_CLI click e5"
make test-exec CMD="$PW_CLI fill e1 'user@example.com'"

# Screenshot (saves to .playwright-cli/)
make test-exec CMD="$PW_CLI screenshot"

# Save/load auth state
make test-exec CMD="$PW_CLI state-save auth.json"
make test-exec CMD="$PW_CLI state-load auth.json"
```

### Dark Mode Emulation

Use Playwright's `emulateMedia` to test dark mode:

```bash
# In Playwright browser context, emulate dark color scheme
make test-exec CMD="$PW_CLI evaluate 'await page.emulateMedia({ colorScheme: \"dark\" })'"
```

### Reduced Motion Emulation

```bash
make test-exec CMD="$PW_CLI evaluate 'await page.emulateMedia({ reducedMotion: \"reduce\" })'"
```

## Test Data

Seed data already exists in the local dev database (trips, messages, itinerary items, notifications). No additional seeding required.

## Feature Flags

None required for this feature.

## Key Verification Scenarios

### Phase 1: Fonts
- Grep for removed font variables — zero matches expected
- No visual regressions (all fonts that matter are still loaded)

### Phase 2: Dark Mode
- All pages render correctly with `prefers-color-scheme: dark`
- Airmail stripes use CSS variables (no hardcoded `#faf5e8`)
- Gradient mesh, linen texture, card noise opacity adjusted for dark
- Sonner toasts match system theme
- Global error page supports dark mode

### Phase 3: Transitions
- Crossfade animation visible during page navigation
- No animation when `prefers-reduced-motion: reduce` is active
- Unsupported browsers get instant navigation (graceful degradation)

### Phase 4: Empty States
- All 5 empty state locations use `<EmptyState>` component
- Consistent styling in both light and dark modes
- Success toast shows checkPop animation on icon

## Screenshots

Save to `.ralph/screenshots/` with naming: `iteration-{NNN}-{description}.png`

Key states to capture:
- Trips list (light + dark)
- Trip detail (light + dark)
- Empty states (light + dark)
- Success toast with animation
- Page transition mid-crossfade
