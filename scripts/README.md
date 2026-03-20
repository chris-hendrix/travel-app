# Development Scripts

This directory contains scripts for testing and verifying the Journiful development environment.

## Available Scripts

### test-acceptance-criteria.sh

Tests all acceptance criteria from Task 5.1 in TASKS.md.

```bash
./scripts/test-acceptance-criteria.sh
```

Verifies:

1. Docker Compose starts PostgreSQL successfully
2. Database is healthy (pg_isready passes)
3. API connects to database (health check shows "connected")
4. `pnpm dev` starts both web (3000) and api (8000) in parallel
5. Hot reload is configured for both apps
6. CORS allows frontend to call backend API

### test-docker-compose.sh

Unit tests for the Docker Compose configuration.

```bash
./scripts/test-docker-compose.sh
```

Tests:

- docker-compose.yml file exists
- No obsolete 'version' field
- Valid YAML syntax
- PostgreSQL service is defined with correct image
- Container name is set correctly
- Environment variables are configured
- Port mapping is correct (5433:5432)
- Persistent volume is defined
- Health check is configured with correct user

### verify-dev-setup.sh

Comprehensive integration test that verifies the complete development setup.

```bash
./scripts/verify-dev-setup.sh
```

Tests:

1. Docker Compose configuration validity
2. PostgreSQL container health
3. Database readiness (pg_isready)
4. Database connection
5. Environment files exist (.env, .env.local)
6. Turbo.json persistent tasks configuration
7. Docker convenience scripts in package.json
8. Parallel dev servers start correctly
9. API health endpoint responds
10. CORS headers are configured

**Note:** This script will start and stop the dev servers. Ensure no other processes are using ports 3000 and 8000.

### test-hot-reload.sh

Displays hot reload configuration status and manual testing instructions.

```bash
./scripts/test-hot-reload.sh
```

Verifies:

- Turbo.json persistent dev tasks
- API tsx watch mode
- Web Next.js dev mode

### test-git-hooks.sh

Tests Git hooks (Husky) and pre-commit configuration.

```bash
./scripts/test-git-hooks.sh
```

Verifies:

- Husky installation and configuration
- Pre-commit hook exists and is executable
- lint-staged configuration
- Hook integration with Prettier and ESLint

### test-workflow.sh

**Comprehensive end-to-end test** of the complete monorepo workflow from clean state through build verification and Turbo caching.

```bash
./scripts/test-workflow.sh
```

Tests complete workflow:

1. **Clean State**: Removes node_modules, .turbo cache, build outputs
2. **Install**: Runs `pnpm install` and verifies workspace linking
3. **Docker**: Starts PostgreSQL and verifies health
4. **Dev Servers**: Starts both web and API servers, tests health endpoint
5. **Tests**: Runs `pnpm test` and verifies all tests pass
6. **Lint**: Runs `pnpm lint` and verifies no errors
7. **Typecheck**: Runs `pnpm typecheck` and verifies no TypeScript errors
8. **Build**: Runs first `pnpm build` and verifies outputs
9. **Turbo Cache**: Runs second build and verifies cache hits (FULL TURBO)
10. **Cross-Package Imports**: Verifies @journiful/shared resolves correctly
11. **Workspace Commands**: Verifies all workspace commands work

This is the most comprehensive test that validates:

- All workspace commands work without errors
- Turbo caching works (second build faster)
- All tests pass (backend integration tests)
- Linting and type checking pass for all packages
- Both apps build successfully
- Shared package imports resolve correctly

**Note:** This script takes several minutes to run as it performs a full clean install and double build. It will clean up processes and Docker containers on exit.

See [WORKFLOW-TEST.md](WORKFLOW-TEST.md) for detailed documentation.

### test-workflow-quick.sh

**Quick workflow test** for faster iteration during development. Skips clean state and install steps.

```bash
./scripts/test-workflow-quick.sh
```

Tests:

1. **Lint**: Runs `pnpm lint`
2. **Typecheck**: Runs `pnpm typecheck`
3. **Test**: Runs `pnpm test`
4. **Build**: Clears cache and runs first build
5. **Cache**: Runs second build and verifies Turbo caching

**Duration**: 1-2 minutes (vs 5-10 minutes for full test)

Use this when:

- Iterating on code changes
- Verifying cache behavior
- Quick validation before commit

## Usage in CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions usage
- name: Test Docker Compose Config
  run: ./scripts/test-docker-compose.sh

- name: Verify Dev Setup
  run: ./scripts/verify-dev-setup.sh
```

## Quick Start

To verify your complete development environment:

```bash
# Quick verification (unit tests only)
./scripts/test-docker-compose.sh

# Standard verification (integration tests)
./scripts/verify-dev-setup.sh

# Comprehensive workflow test (end-to-end)
./scripts/test-workflow.sh
```

For a complete validation of the monorepo from clean state through caching:

```bash
# Run the comprehensive workflow test (takes 5-10 minutes)
./scripts/test-workflow.sh
```

## Requirements

- Docker and Docker Compose v2+
- Node.js 22+
- pnpm 10+
- curl
- netcat (nc)
