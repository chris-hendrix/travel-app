# GitHub Actions CI/CD Setup

This repository uses GitHub Actions for continuous integration and deployment. The CI workflow automatically runs quality checks, tests, and E2E tests on every push and pull request.

## Features

- **Smart Path Filtering** - Only runs tests for changed code
- **Full Suite on Main** - Ensures production quality with sharded E2E tests
- **Smoke Tests on PRs** - Fast feedback with @smoke-tagged critical path tests
- **Turborepo Optimization** - Caches build outputs for faster runs
- **Playwright E2E Tests** - Automated browser testing with report merging
- **PostgreSQL Service** - Tests run against real database
- **Concurrency Control** - Cancels outdated runs automatically

## Workflow Overview

### Jobs

1. **Detect Changes** - Identifies which packages changed using path filters
2. **Quality Checks** - Runs ESLint, TypeScript checks, and dependency audit
3. **Unit Tests** - Runs API unit tests (if API or shared files changed, or on main)
4. **E2E Smoke Tests** (PRs only) - Runs @smoke-tagged tests for fast PR feedback
5. **E2E Tests** (main only) - Runs the full E2E suite across 2 shards
6. **Merge E2E Reports** (main only) - Merges sharded Playwright blob reports into a single HTML report

### Test Tiers

E2E tests are organized into two tiers using Playwright tags:

- **@smoke** (6 tests) - Critical path tests that run on every PR. Cover authentication, trip CRUD, and core navigation flows.
- **@regression** (15 tests) - Extended tests covering edge cases, error handling, and less critical flows. Run on main branch only.

All 21 tests run on main. Only the 6 @smoke tests run on PRs.

### Conditional Execution

**On Pull Requests:**

- Only affected packages are linted/typechecked (`--affected` flag)
- Unit tests run only if `apps/api/**` or shared config changed
- E2E smoke tests run only if `apps/api/**`, `apps/web/**`, or shared config changed
- Smoke tests use `--grep @smoke` to run only critical path tests

**On Main Branch:**

- Full suite always runs (quality gates for production)
- All packages linted and typechecked
- All unit tests run regardless of changes
- Full E2E suite runs across 2 parallel shards (all @smoke + @regression tests)
- Sharded blob reports are merged into a single HTML report

### Path Filters

Changes in these paths trigger specific jobs:

- `apps/api/**` - Unit tests + E2E tests
- `apps/web/**` - E2E tests
- `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/**`, config files - All tests

## Setup Instructions

### 1. No Additional Configuration Required

The workflow is ready to use! It will automatically run on:

- Push to `main` or `master` branches
- Pull requests targeting `main` or `master`

### 2. (Optional) Enable Turborepo Remote Caching

For faster builds across team members:

1. Sign up for Vercel (free tier): https://vercel.com
2. Link your repository:
   ```bash
   npx turbo login
   npx turbo link
   ```
3. Add GitHub repository secrets:
   - `TURBO_TOKEN` - Get from Vercel dashboard
   - `TURBO_TEAM` - Your team slug (add as repository variable)

4. Uncomment remote cache env vars in `.github/workflows/ci.yml`:
   ```yaml
   env:
     TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
     TURBO_TEAM: ${{ vars.TURBO_TEAM }}
   ```

**Benefits:**

- 80%+ cache hit rate for unchanged packages
- 3-5x faster CI runs
- Shared cache between developers and CI

### 3. (Optional) Require Status Checks

Protect your main branch by requiring CI to pass:

1. Go to repository **Settings** > **Branches**
2. Add branch protection rule for `main`
3. Enable **Require status checks to pass before merging**
4. Select these required checks:
   - Quality Checks
   - Unit Tests
   - E2E Smoke Tests

Note: "E2E Tests" and "Merge E2E Reports" only run on main, so they should not be required status checks for PRs.

## CI Performance

**Expected Run Times:**

| Scenario                | Time    | Description                          |
| ----------------------- | ------- | ------------------------------------ |
| PR (API + Web changes)  | 3-4 min | Quality + Unit + Smoke tests         |
| PR (Web only)           | 2-3 min | Quality + Smoke tests                |
| PR (No changes to apps) | 1-2 min | Quality checks only                  |
| Main branch             | 5-7 min | Full suite with 2 shards + reporting |

**With Remote Cache:**

- PR builds: 1-2 min (most tasks cached)
- Main builds: 3-4 min (selective caching)

## Debugging Failed Builds

### View Logs

1. Go to **Actions** tab in GitHub
2. Click on failed workflow run
3. Click on failed job to see logs

### Download Playwright Reports

**For PRs (smoke tests):**

1. Scroll to bottom of workflow run
2. Download **smoke-report** artifact (retained for 7 days)
3. This is a Playwright blob report (not HTML). To view locally:
   ```bash
   mkdir smoke-results && cd smoke-results
   unzip ../smoke-report.zip
   npx playwright merge-reports --reporter html .
   open playwright-report/index.html
   ```

**For main (full suite):**

1. Scroll to bottom of workflow run
2. Download **playwright-report** artifact (retained for 30 days)
3. Extract and open `index.html` in browser

This merged report combines results from all shards into a single view.

### Run Locally

Reproduce CI environment locally:

```bash
# Set test environment variables
export TEST_MODE=true
export NODE_ENV=test
export DATABASE_URL=postgresql://tripful:tripful123@localhost:5432/tripful
export JWT_SECRET=test-jwt-secret-minimum-32-characters-long-for-testing-purposes-only

# Start database
pnpm db:up

# Run migrations
pnpm --filter @tripful/api db:migrate

# Run tests
pnpm test
pnpm test:e2e

# Run only smoke tests (like PR CI)
pnpm --filter @tripful/web exec playwright test --grep @smoke
```

## Cost Estimation

**GitHub Actions Free Tier:**

- Public repos: Unlimited minutes
- Private repos: 2,000 minutes/month

**Estimated Usage:**

- 20 PRs/month x 4 min = 80 minutes/month
- 40 commits to main x 7 min = 280 minutes/month
- **Total: ~360 minutes/month** (well within free tier)

## OpenCode PR Review Workflow

An automated AI code review powered by **OpenCode** and **DeepSeek V4 Flash** via the OpenCode Go subscription. Every pull request gets reviewed for code quality, security, and project convention compliance — running in parallel alongside the CI pipeline.

### Triggers

- PR `opened`, `synchronize`, `reopened` — reviews on each update
- PR `ready_for_review` — reviews when a draft is marked ready
- **Draft PRs are skipped** (no noise while work is in progress)

### Required Secret

| Secret | Source | Notes |
|--------|--------|-------|
| `OPENCODE_API_KEY` | [opencode.ai/auth](https://opencode.ai/auth) | OpenCode Go subscription key (~$10/month, ~31,650 requests/5h window for DeepSeek V4 Flash) |

### Setup

1. Subscribe to **OpenCode Go** at [opencode.ai/auth](https://opencode.ai/auth) to get an API key
2. In GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**
3. Add a new repository secret: `OPENCODE_API_KEY` with your subscription key
4. The `GITHUB_TOKEN` is auto-provided by the Actions runner (no setup needed)

The workflow is ready to use — no additional configuration required.

### What It Reviews

- Code quality and TypeScript safety
- Security: auth flows, cookie handling, secrets exposure
- Database query patterns (Drizzle ORM)
- Tailwind v4 constraints (`@theme` colors must be hex, never `hsl()`)
- Shared package import conventions (`@journiful/shared/schemas` only)
- React/Fastify best practices specific to this project

The review is posted as a PR comment with actionable feedback. It is **advisory only** — not a required status check.

### Workflow File

`.github/workflows/opencode-review.yml`

## Workflow File Location

`.github/workflows/ci.yml`

## Troubleshooting

### Playwright Installation Fails

**Solution:** The workflow uses `playwright install --with-deps` which automatically installs Ubuntu dependencies. No action needed.

### Database Connection Fails

**Solution:** The PostgreSQL service includes health checks. Wait for service to be ready before running tests.

### Turbo Cache Not Working

**Solution:**

1. Check `.turbo` directory is cached (should see "Cache restored" in logs)
2. Verify `turbo.json` includes correct task outputs
3. For remote cache, verify `TURBO_TOKEN` is set correctly

### Tests Pass Locally but Fail in CI

**Solution:**

1. Check environment variables match between local and CI
2. Verify database migrations ran successfully
3. Check for timing issues (CI is slower - adjust timeouts)
4. Download Playwright report artifact for details

### Shard Reports Not Merging

**Solution:**

1. Verify both shard jobs completed (even if one failed, merge still runs)
2. Check that `blob-report-*` artifacts were uploaded successfully
3. The merge job uses `merge-multiple: true` to combine all shard artifacts

## Next Steps

1. **Test the workflow**: Create a PR and verify CI runs correctly
2. **Add status badge**: Add CI status badge to README.md
3. **Enable remote cache**: Set up Turborepo remote caching for faster builds
4. **Branch protection**: Require CI checks before merging

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright CI Guide](https://playwright.dev/docs/ci-intro)
- [Playwright Sharding Guide](https://playwright.dev/docs/test-sharding)
- [Turborepo CI Guide](https://turborepo.com/docs/crafting-your-repository/constructing-ci)
- [Full Strategy Document](.thoughts/research/2026-02-03-github-actions-ci-strategy.md)
