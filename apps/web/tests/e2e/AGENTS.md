# E2E Tests — Playwright

7 Playwright specs cover 7 critical user flows across the full browser→frontend→API→DB stack. The suite was triaged from 13 specs / 36 tests in Aug 2026 (6 CUT/CONVERTED, 6 SPLIT). See `.thoughts/audits/2026-08-08-e2e-triage.md` for the full audit.

All E2E commands run in the devcontainer via `make test-exec CMD="..."`. Never run Playwright on the host.

## Critical flows (Aug 2026)

A flow is E2E-worthy only if it meets both criteria:

1. **User-observable outcome across the full stack** — cannot be verified by rendering a component, injecting an HTTP request, or testing a service method in isolation.
2. **On the approved critical-flow list** — auth, money, or core value-delivery for the product.

Any spec NOT on this list is an audit candidate for SPLIT / CUT / CONVERT. New E2E tests require a one-line PR justification citing which critical flow they cover.

| # | Critical flow | Spec | Tests |
|---|---------------|------|-------|
| 1 | **Auth** | `auth-journey.spec.ts` | 3 (signup, logout, route guards) |
| 2 | **Trip CRUD** | `trip-journey.spec.ts` | 3 (CRUD chain, promote/demote, FAB nav) |
| 3 | **Invitation + RSVP + deep-link** | `invitation-journey.spec.ts` | 4 (RSVP + 3 deep-link variants) |
| 4 | **Itinerary CRUD** | `itinerary-journey.spec.ts` | 2 (event CRUD + deleted items restore) |
| 5 | **Messaging** | `messaging.spec.ts` | 2 (send+receive + organizer moderate) |
| 6 | **Settle** | `settle-journey.spec.ts` | 1 (balance accuracy — money correctness) |
| 7 | **Notifications** | `notifications.spec.ts` | 1 (notification center UX) |

## Banned at E2E level

- Form validation, field-level error messages, edge-case re-verification
- Feature-flag toggles
- Anything already asserted by a Zod schema or RTL component test
- **Fat journeys:** one spec must map to one critical flow — do not conflate multiple unrelated user goals
- **Silent browser drops:** never remove a browser project (Firefox, WebKit) or viewport (tablet) for "flakiness" without a PR and linked issue explaining the root cause. This overrides the precedent set by commit `1f7fa72`.

## Flakiness policy

A flaky test is a test failure — never silently ignored or worked around.

1. **Quarantine rule:** If a test fails 3 times within a 7-day window with no code changes to the test or code under test, mark it `test.skip` with an inline comment containing the owner's GitHub handle and a link to the tracking issue. The test stays skipped until the root cause is fixed — it is tracked, not forgotten.
2. **Retry cap:** Maximum 1 retry per test in CI. If a test requires the retry to pass, it qualifies for quarantine under rule 1. Do not increase the retry limit to mask flakiness.
3. **Browser projects are never silently dropped.** Removing a browser project (Firefox, WebKit) or a viewport (tablet, mobile) because of "flakiness" is banned without a reviewed PR and a linked GitHub issue explaining the root cause.
4. **Root-cause diagnosis is mandatory.** When a test flakes, the immediate response is diagnosis, not deletion. Check for: async race conditions, missing `waitFor` guards, shared mutable state between tests, or DB state leakage. If the root cause is unclear after 30 minutes of investigation, quarantine the test under rule 1 — do not delete it.

## CI testing policy

| Gate | Runs on | Status |
|------|---------|--------|
| E2E (Playwright) | Every PR, 4-way sharded | **Blocking** — must pass to merge |
| API tests (Vitest) | Every PR (api path filter) | Blocking |
| Web RTL + shared unit (Vitest) | Local only | **Not in CI** |
| Lint + typecheck | Every PR | Blocking |

**Documented follow-ups (deferred):**

1. Add web RTL + shared unit Vitest to CI as a cheap, fast gate that runs before E2E.
2. Split the E2E suite into `@smoke` (PR gate, ~5 min) vs. full (runs on main, ~60 min).
3. Set a flakiness budget: if E2E flake rate exceeds 5% in a rolling 7-day window, no new E2E tests may be added until the budget recovers.
4. Consider enabling Playwright tracing-on-failure for CI artifacts.

## Running E2E tests

All commands run inside the devcontainer:

```bash
make test-up                          # Start container + auto-setup
make test-exec CMD="pnpm test:e2e"    # Full suite (~15-20 min)

# Single spec
make test-exec CMD="pnpm --filter @journiful/web exec playwright test --grep=auth"

# Parse check (spec compiles, no run)
make test-exec CMD="pnpm --filter @journiful/web exec playwright test --grep=auth --list"

# Headed/UI mode (for debugging)
make test-exec CMD="pnpm --filter @journiful/web exec playwright test --grep=messaging --headed"
make test-exec CMD="pnpm --filter @journiful/web exec playwright test --ui"

make test-down                        # Tear down
```

## Test data

When `ENABLE_FIXED_VERIFICATION_CODE=true` (default in dev), SMS verification uses a fixed code **`123456`** — no real SMS is sent. Any phone number containing "555" passes validation.

| Purpose | Phone | Code |
|---------|-------|------|
| Admin user (pre-seeded) | `+15550000001` | `123456` |
| New test user | `+1555` + any 9 digits | `123456` |

## Manual browser testing (playwright-cli)

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

## Spec details

### auth-journey.spec.ts
1. `@smoke` — Signup: login page → enter phone → verify code → complete profile → lands on trips
2. Logout: clears session → redirects to login → cannot access protected routes
3. `@regression` — Route guards: unauthenticated redirects, existing user skips complete-profile, auth redirect dance

### trip-journey.spec.ts
1. `@smoke` — CRUD chain: create trip via API → detail verification (section presence, edit/detail-settings buttons) → list presence → delete (cancel then confirm) → removed from list
2. `@regression` — Promote/demote co-organizer via phone: invite → promote → co-org edits trip → demote → edit button hidden
3. `@regression` — FAB navigation + travel card rendering: travel card appears on itinerary → FAB opens My Travel dialog

### invitation-journey.spec.ts
1. `@smoke` — RSVP journey: invite sent → member receives invite link → RSVP (accept/decline)
2. `@smoke` — Unauthenticated deep-link: click invite link while logged out → login → complete profile → join trip
3. `@smoke` — Authenticated deep-link (wrong phone): click invite on account A while logged in as account B → correct phone mismatch → sign in as account A → join
4. `@regression` — Re-click accepted invitation: accepted invite redirects to trip page instead of re-processing

### itinerary-journey.spec.ts
1. `@smoke` — Event CRUD chain: create trip → create meal event (location, detail sheet, Google Maps link) → edit (rename, relocate, verify update) → delete (cancel, then confirm, verify gone after reload)
2. `@regression` — Deleted items restore: create trip → create event → delete → Deleted Items dialog → restore → verify reappearance

### messaging.spec.ts
1. `@smoke` — Send+receive: organizer posts a message → member switches accounts → sees the message (cross-user wire check)
2. `@regression` — Organizer moderation: member posts message → organizer navigates → sees it → deletes the member message

### settle-journey.spec.ts
1. `@smoke` — Balance accuracy: two users, create trip, invite+accept, POST $50.00 expense split evenly → API confirms $25.00 balance → UI shows "owes $25.00" on Settle tab

### notifications.spec.ts
1. Bell badge → notification center → tap notification → navigate → mark as read. Notification *triggers* (badge appearance after invite, message, etc.) are asserted inline within the auth, trip, invitation, itinerary, and messaging specs.

## Debugging

- Screenshots and videos are captured on failure in `test-results/`
- View HTML report after test run: `make test-exec CMD="npx playwright show-report"`
- Use `--headed` to see the browser actions
- Use `--ui` for interactive Playwright UI debugging
