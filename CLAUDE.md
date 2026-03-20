# Journiful

A collaborative trip planning platform enabling groups to organize travel together.

## What (Technology Stack)

**Monorepo Structure** (pnpm + Turbo):

- `apps/api` - Fastify REST API with PostgreSQL (Drizzle ORM)
- `apps/web` - Next.js 16 App Router frontend with React 19
- `shared` - Shared types, Zod schemas, and utilities

**Key Technologies**:

- **Backend**: Fastify 5, Drizzle ORM, PostgreSQL 16, JWT auth
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, TanStack Query
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Validation**: Zod schemas (shared across frontend/backend)
- **DevOps**: Docker Compose (PostgreSQL), Husky + lint-staged, GitGuardian

## Why (Project Purpose)

Journiful helps groups plan trips together by coordinating:

- Group travel itineraries and accommodations
- Event scheduling with RSVP tracking
- Member availability and travel logistics

**Current Status**: Phase 6 (Advanced Itinerary) complete. See `docs/2026-02-01-journiful-mvp/ARCHITECTURE.md` for implementation progress.

## How (Development Workflow)

### Package Manager

Use **pnpm** (required for workspace features). Never use `npm` or `yarn`.

### Common Commands

```bash
# Setup (host)
pnpm install
pnpm docker:up        # Start PostgreSQL + MinIO for local dev

# Development (host)
pnpm dev              # Both servers (web:3000, api:8000)
pnpm dev:web          # Frontend only
pnpm dev:api          # Backend only

# Database (host, from apps/api)
cd apps/api
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Run pending migrations
pnpm db:studio        # Visual database browser (Drizzle Studio)
```

### Environment Setup

Copy example files and configure:

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.local.example` → `apps/web/.env.local`

Required: `DATABASE_URL` and `JWT_SECRET` (minimum 32 characters).

### Code Quality Standards

- **TypeScript**: Strict mode enabled across all packages
- **Formatting**: Prettier runs automatically via pre-commit hooks
- **Linting**: ESLint with TypeScript plugin (auto-fix available)
- **Dependency Audit**: `pnpm audit --audit-level=high` runs in CI; Dependabot creates PRs for vulnerable dependencies
- **Pre-commit**: GitGuardian scans for secrets (requires Docker running)

### Testing Requirements

- **Unit tests** for new services/utilities (Vitest)
- **Integration tests** for API endpoints (Vitest)
- **E2E tests** for user flows (Playwright)
- Tests must pass before merging

### Container-First Testing

**All test, lint, and typecheck commands MUST run inside the devcontainer** via `make test-exec CMD="..."`. Never run these directly on the host. The devcontainer provides the correct Node, PostgreSQL, and Playwright browser versions.

`test-exec` wraps CMD in `bash -c`, so compound commands like `cd apps/api && pnpm db:migrate` work directly.

```bash
# Container lifecycle
make test-up                          # Start container + auto-setup (deps, migrations, env)
make test-setup                       # Re-run setup manually (idempotent)
make test-status                      # Check if container is running
make test-down                        # Tear down when done

# Run commands inside container
make test-exec CMD="pnpm test"        # Unit/integration tests
make test-exec CMD="pnpm test:e2e"    # E2E tests (Playwright)
make test-run                         # Full suite (unit + E2E)
make test-exec CMD="pnpm lint"        # Lint
make test-exec CMD="pnpm typecheck"   # Type check
make test-exec CMD="pnpm format"      # Prettier format

# Maintenance
make test-clean                       # Remove dist/, .next/, .turbo/, *.tsbuildinfo
```

### Manual Testing (Playwright CLI)

The devcontainer includes `playwright-cli` for interactive browser testing. Start the dev servers inside the container, then use CLI commands to navigate, interact, and screenshot. All `playwright-cli` commands require the config flag: `--config .devcontainer/playwright-cli.config.json`.

```bash
# Start dev servers inside container (background)
make test-exec CMD="bash -c 'pnpm --filter @journiful/api dev & pnpm --filter @journiful/web dev & wait'"

# Open browser and navigate (PW_CLI is a shorthand for the full command)
PW_CLI="playwright-cli --config .devcontainer/playwright-cli.config.json"
make test-exec CMD="$PW_CLI open http://localhost:3000"

# See the page (returns accessibility tree with element refs)
make test-exec CMD="$PW_CLI snapshot"

# Interact with elements by ref from snapshot
make test-exec CMD="$PW_CLI click e5"
make test-exec CMD="$PW_CLI fill e1 'user@example.com'"
make test-exec CMD="$PW_CLI press Enter"

# Take a screenshot (saves to .playwright-cli/ in workspace)
make test-exec CMD="$PW_CLI screenshot"

# Save/restore auth state to skip login on subsequent runs
make test-exec CMD="$PW_CLI state-save auth.json"
make test-exec CMD="$PW_CLI state-load auth.json"
```

Auth is handled by navigating the UI — no hardcoded tokens. Use `snapshot` to read element refs, then `fill`/`click`/`press` to interact. Save auth state with `state-save` to reuse across sessions. Screenshots are saved to `.playwright-cli/` and can be viewed with the Read tool.

### Shared Code Pattern

Place code shared between web/api in `shared/`:

- **Types**: `shared/types/` (interfaces, type definitions)
- **Schemas**: `shared/schemas/` (Zod validation schemas)
- **Utils**: `shared/utils/` (pure functions)

Always export through barrel files (`index.ts`).

**Importing from shared package:**

- ✅ Use workspace package: `import { ... } from '@journiful/shared/schemas'`
- ❌ Never use relative paths: `import { ... } from '../../../../shared/schemas/index.js'`
- Available exports: `@journiful/shared`, `@journiful/shared/types`, `@journiful/shared/schemas`, `@journiful/shared/utils`

### Database Changes

1. Update schema in `apps/api/src/db/schema/`
2. Generate migration: `cd apps/api && pnpm db:generate`
3. Review generated SQL in `apps/api/src/db/migrations/`
4. Apply migration: `pnpm db:migrate`

### Documentation

- **API Architecture**: See `docs/2026-02-01-journiful-mvp/ARCHITECTURE.md`
- **Setup Guide**: See `README.md` and `DEVELOPMENT.md`
- **Test Scripts**: See `scripts/README.md` for verification utilities

### Port Assignments

- Frontend: `3000` (Next.js dev server)
- Backend: `8000` (Fastify API)
- PostgreSQL: `5433` (external) → `5432` (container)
- MinIO API: `9000` (S3-compatible endpoint)
- MinIO Console: `9001` (web UI)
- Playwright UI: `9323` (when using `pnpm test:e2e:ui`)

### Troubleshooting

- **Devcontainer won't start**: Check `docker` and `devcontainer` CLI are installed (`make test-status` for diagnostics)
- **Hot reload not working**: Check file watchers limit (Linux: `sysctl fs.inotify.max_user_watches`)
- **Pre-commit hook fails**: Ensure Docker is running (GitGuardian uses Docker)
- **Type errors in shared package**: Run `pnpm build` in `shared/` first
- **Port conflicts**: Each directory gets an isolated container with random ports — use `make test-status` to see assigned ports
