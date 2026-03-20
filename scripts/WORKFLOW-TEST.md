# Workflow Test Documentation

## Overview

The `test-workflow.sh` script provides comprehensive end-to-end testing of the complete Journiful monorepo workflow, from clean state through build verification and Turbo caching.

## Purpose

This script validates Task 7.1: "Test complete monorepo workflow" from TASKS.md, ensuring:

- All workspace commands work without errors
- Turbo caching works correctly (second build faster)
- All tests pass (including backend integration tests)
- Linting and type checking pass for all packages
- Both apps build successfully
- Shared package imports resolve correctly

## Usage

### Full Workflow Test

```bash
./scripts/test-workflow.sh
```

**Duration**: 5-10 minutes (performs full clean install and double build)

**What it does**:

1. Establishes clean state (removes node_modules, .turbo, build outputs)
2. Runs `pnpm install` and verifies workspace linking
3. Starts PostgreSQL via Docker Compose
4. Starts both dev servers (web:3000, api:8000)
5. Tests API health endpoint and database connection
6. Runs `pnpm test` (all test suites)
7. Runs `pnpm lint` (all packages)
8. Runs `pnpm typecheck` (all packages)
9. Runs first `pnpm build` (cold cache)
10. Runs second `pnpm build` (warm cache, verifies FULL TURBO)
11. Verifies cross-package imports (@journiful/shared)
12. Validates all workspace commands exist

### Quick Test (Development)

```bash
./scripts/test-workflow-quick.sh
```

**Duration**: 1-2 minutes (skips clean/install steps)

**What it does**:

1. Runs lint, typecheck, and test
2. Clears Turbo cache
3. Runs build twice and verifies caching works

Use this for faster iteration during development.

## Test Output

The script provides color-coded output:

- **BLUE**: Section headers
- **YELLOW**: Test descriptions and info messages
- **GREEN**: Passed tests
- **RED**: Failed tests

### Example Output

```
========================================
Step 8: pnpm build (both apps build)
========================================
TEST: Run first 'pnpm build' (cold cache)
  PASS
[INFO] First build completed in 8s
TEST: Verify API dist directory created
  PASS
TEST: Verify Web .next directory created
  PASS
...

========================================
Step 9: Verify Turbo Caching
========================================
TEST: Run second 'pnpm build' (warm cache)
  PASS
[INFO] Second build completed in 1s
TEST: Verify Turbo cache hits detected
  PASS
[INFO] Cache hits detected in second build
TEST: Verify second build faster than first
  PASS
[INFO] Second build 7s faster (87% improvement)
```

## Acceptance Criteria Verification

The script validates all acceptance criteria from Task 7.1:

### ✅ All workspace commands work without errors

Tests:

- `pnpm install`
- `pnpm docker:up`
- `pnpm dev` (both servers)
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Verifies workspace commands exist:

- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm build:web`
- `pnpm build:api`

### ✅ Turbo caching works (second build faster)

- First build with cold cache
- Second build shows "FULL TURBO" or "cache hit"
- Timing comparison shows significant speedup
- `.turbo/cache/` directory created

### ✅ All tests pass (backend integration tests)

- Runs `pnpm test` across all packages
- Verifies `health.integration.test.ts` executed
- Checks for "passed" in test output

### ✅ Linting and type checking pass for all packages

- Runs `pnpm lint` with turbo
- Runs `pnpm typecheck` with turbo
- Verifies no ESLint errors
- Verifies no TypeScript errors

### ✅ Both apps build successfully

- API: `dist/server.js` created
- Web: `.next/` directory created
- Shared: package built before consumers

### ✅ Shared package imports resolve correctly

- Verifies `shared/types/index.ts` exists
- Verifies `shared/schemas/index.ts` exists
- Runs typecheck on API (potential types consumer)
- Runs typecheck on Web (uses @journiful/shared)
- Checks for "Cannot find module" errors

## Exit Codes

- **0**: All tests passed
- **1**: One or more tests failed

## Cleanup

The script automatically cleans up on exit:

- Kills dev server processes (next dev, tsx watch)
- Stops Docker Compose containers
- Removes temporary log files

Cleanup runs via `trap cleanup EXIT`, ensuring it happens even if the script is interrupted.

## Temporary Files

The script creates temporary files in `/tmp/`:

- `/tmp/journiful-install.log` - Install output
- `/tmp/journiful-dev.log` - Dev servers output
- `/tmp/journiful-test.log` - Test output
- `/tmp/journiful-lint.log` - Lint output
- `/tmp/journiful-typecheck.log` - Typecheck output
- `/tmp/journiful-build-1.log` - First build output
- `/tmp/journiful-build-2.log` - Second build output
- `/tmp/journiful-api-typecheck.log` - API typecheck
- `/tmp/journiful-web-typecheck.log` - Web typecheck

All files are automatically removed on script exit.

## Requirements

- Docker and Docker Compose v2+
- Node.js 22+
- pnpm 10+
- curl
- netcat (nc)
- 10+ GB free disk space (for clean install)

## Troubleshooting

### Script hangs during dev server startup

The script waits up to 45 seconds for each server. If they don't start:

1. Check ports 3000 and 8000 are not in use
2. Review `/tmp/journiful-dev.log` for errors
3. Ensure `.env` files exist in `apps/api/` and `apps/web/`

### PostgreSQL health check fails

The script waits 30 seconds for PostgreSQL. If it fails:

1. Check Docker is running
2. Ensure port 5433 is not in use
3. Run `docker compose ps` to check container status
4. Run `docker compose logs postgres` for details

### Build fails on first run

Check:

1. All dependencies installed (`pnpm install` succeeded)
2. TypeScript configuration is valid
3. Review build logs in `/tmp/journiful-build-1.log`

### No cache hits on second build

This could indicate:

1. Files changed between builds (expected)
2. Turbo cache configuration issue
3. Check `turbo.json` has proper `outputs` configuration
4. Verify `.turbo/cache/` directory was created

### Tests fail

Common issues:

1. Database not running (check PostgreSQL health)
2. Port conflicts (8000 or 3000 in use)
3. Missing environment variables
4. Review test output in `/tmp/journiful-test.log`

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Workflow Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  workflow-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run workflow test
        run: ./scripts/test-workflow.sh
```

## Development

To add new tests to the workflow script:

1. Follow existing patterns (use `log_test`, `log_pass`, `log_fail`)
2. Use dynamic path resolution (`$PROJECT_ROOT`)
3. Add cleanup for any processes or files
4. Use `|| true` for increment operations
5. Redirect output to `/tmp/` for analysis
6. Add test to structure validation in `__tests__/test-workflow.test.sh`

## Related Scripts

- `test-workflow-quick.sh` - Quick version (skips clean/install)
- `test-acceptance-criteria.sh` - Task 5.1 acceptance criteria
- `verify-dev-setup.sh` - Development setup verification
- `test-docker-compose.sh` - Docker Compose unit tests
- `__tests__/test-workflow.test.sh` - Script structure validation

## See Also

- [scripts/README.md](README.md) - Overview of all development scripts
- [TASKS.md](../TASKS.md) - Full task requirements (Task 7.1)
