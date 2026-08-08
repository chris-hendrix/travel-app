---
date: 2026-08-08
topic: Testing strategy — Pyramid/Trophy hybrid methodology + E2E triage audit
status: in-progress
---

# Testing Strategy: Pyramid/Trophy Hybrid Methodology + E2E Triage Audit

## Overview

The E2E suite (13 spec files, 36 tests, 154 steps, 4-way sharded in CI) is slow and flaky, and the suite has grown back after two prior optimization rounds (Feb 8, Feb 21 plans). Root causes, per the Aug 2026 codebase audit:

- **The pyramid is inverted where it counts.** Web RTL (1,224 cases) and shared unit (331 cases) are NOT in CI; only the slow/flaky Playwright suite gates PRs. CI gates the expensive, flaky layer and skips the cheap, reliable layers.
- **API `tests/unit/` is mislabeled.** 26 of 36 "unit" files hit a real Postgres — they're service-layer integration tests. Honest reasoning about test levels is impossible until directories say what they are.
- **E2E re-verifies lower-layer coverage.** Form validation is tested 3× (shared Zod + RTL field-level + Playwright whole-flow). Prior plans already cut validation tests; they grew back because no sustaining constraint prevented it.
- **Flakiness was previously "fixed" by silently dropping browsers** (commit `1f7fa72` dropped Firefox/WebKit/iPad with the comment "flakiness, not real bugs") — the classic trust-destroying anti-pattern.

This plan produces two deliverables: (1) a written testing methodology in `AGENTS.md` that makes future test placement mechanical and prevents E2E bloat from recurring, and (2) an audit of all 13 E2E spec files producing a KEEP / SPLIT / CUT / CONVERT verdict table with evidence. **Execution of the cuts is a separate follow-up plan** — this plan stops at the verdict table.

## Success Criteria

- [x] **M1.** `AGENTS.md` testing section rewritten with the full methodology (9 subsections below), replacing the current ~50-line perfunctory block.
- [x] **M2.** Methodology is a *sustaining constraint*: it includes an explicit rule that new E2E tests require justification against the critical-flow list (prevents the Feb-2026 regression pattern).
- [x] **M3.** Test-level taxonomy in the doc references real directory names that match a post-rename tree (`tests/unit` pure, `tests/service` DB-backed, `tests/integration` route).
- [x] **M4.** API `tests/unit/` → `tests/service/` rename executed for the 22 DB-backed files; true-pure files stay in `tests/unit/`; Vitest config + CI globs still pick up all moved files (verified by running API tests).
- [ ] **A1.** Audit produces a verdict (KEEP / SPLIT / CUT / CONVERT) per each of the 13 E2E spec files, one task per file.
- [ ] **A2.** Every CUT/CONVERT verdict cites `file:line` evidence of the lower-layer test that already covers the behavior (Zod schema, RTL component, API route test).
- [ ] **A3.** A consolidated verdict table + per-test action backlog is produced as the final audit artifact.
- [ ] **D1.** No behavior silently loses coverage: CUT verdicts must reference an existing lower-layer test; SPLIT verdicts must name which sub-flow stays E2E and which moves down.
- [x] **Q1.** `pnpm lint` and `pnpm typecheck` pass after the rename (via `make test-exec CMD="..."`).
- [x] **Q2.** API vitest suite passes after the rename (via `make test-exec CMD="pnpm --filter @journiful/api test"`).

## What We're NOT Doing

- **Not executing the cuts.** The verdict table is the output; deleting/moving E2E tests happens in a follow-up plan.
- **Not changing CI gating policy.** E2E stays blocking for PR merges for now. The `@smoke` vs full-suite split is deferred (documented as a follow-up in the methodology's CI subsection).
- **Not migrating DB isolation.** The current "unique phone + scoped cleanup" policy is documented in the methodology with a note that transactional rollback is a future improvement. No `BEGIN/ROLLBACK` infrastructure in this plan.
- **Not backfilling missing lower-layer coverage.** Trust-audit-then-cut: if the audit finds a CUT verdict whose lower-layer coverage is NOT found by grep, the verdict is re-classified (e.g. to CONVERT or KEEP) rather than silently cut.
- **Not touching Playwright config, browser projects, or flakiness tooling** (retries/quarantine are *documented policy*, enforced later).
- **Not changing the shared/web Vitest configs or adding coverage thresholds.**

## Risks & Blockers

| Risk | Mitigation |
|------|-----------|
| **Rename breaks CI filter / vitest glob.** The CI api job may filter `tests/unit/**`; moving 26 files could silently exclude them from CI. | CHECK step in Phase 1 runs `pnpm --filter @journiful/api test` in devcontainer and greps CI workflow for the old path. |
| **Cut-before-convert coverage gap.** "Trust-audit" means a CUT verdict relies on an existing lower-layer test that may be thinner than assumed. | Every CUT/CONVERT verdict requires a grep-verifiable `file:line` to the lower-layer test *before* the verdict is finalized. Verdicts that can't cite evidence get re-classified. |
| **Fat-journey SPLIT blast radius.** Splitting a 9-test spec into critical/non-critical halves touches many `test.step`s. | SPLIT verdicts only *name* the boundary + which steps move down; the actual split is follow-up work. |
| **Doc drift / methodology ignored.** Two prior plans cut E2E and it grew back. | M2 (justification rule) + M1 (AGENTS.md placement so agents read it). CI enforcement of the rule is a documented follow-up. |
| **Rename churn vs benefit.** Moving 26 files is noisy for review. | Move is mechanical `git mv`; commits are separated per phase; revertible. |
| **AGENTS.md density.** The doc must stay concise enough that agents actually read it. | Subsections are rule-shaped (bullet lists, decision tables), not prose essays. |

## Branch & Commit Strategy

- **Branch:** `feat/testing-strategy`
- **Commit granularity:** per phase — Phase 1 commit (methodology doc + rename), Phase 2 commits grouped by audit task (verdict table fills incrementally).
- **PR approach:** squash merge with description linking this plan. The audit verdict table is the reviewable artifact.
- Two prior plans (Feb 2026) were also on `feat/`-style branches; keep the pattern.

## Architecture

### 1. AGENTS.md edit map

Current file: `AGENTS.md:46-60` holds the "Testing — devcontainer only" section (commands only). The edit **replaces the section header + commands with a restructured Testing section**: keep the commands block verbatim, then append 9 new subsections under a `### Testing methodology` heading. No other sections of `AGENTS.md` change.

New structure:

```markdown
### Testing — devcontainer only
[existing commands block, lines 50-58, unchanged]

### Testing methodology
#### Philosophy — hybrid
#### Test level taxonomy
#### Decision rules (which level to write)
#### Banned at each level
#### Target test shape
#### Database isolation in tests
#### Flakiness policy
#### E2E inclusion criteria (critical flows)
#### CI testing policy
```

### 2. Methodology subsection content spec (what each subsection must state)

**Philosophy — hybrid.** Backend (Fastify/Drizzle) uses the classic Pyramid: pure-unit base, service + route integration middle, no API-level E2E. Frontend (Next.js) uses the Testing Trophy (Kent C. Dodds): heavy RTL component-integration, small E2E cap. Cite the 2026 Autonoma article's AI-era ratios (~60/25/15) as justification for the middle-heavy split. One sentence stating the decision rule from the article: *write at the lowest level that gives the confidence you need.*

**Test level taxonomy.** Five levels with definitions + directory conventions:
| Level | Definition | Directory |
|-------|-----------|-----------|
| Pure unit | Isolated logic, no DB/network/fs | `shared/__tests__/`, `apps/api/tests/unit/`, `apps/web/src/**/__tests__/` (pure utils only) |
| Service integration | Service wired to **real Postgres**, externalities mocked | `apps/api/tests/service/` |
| Route integration | Fastify `app.inject()` through the full route→controller→service chain | `apps/api/tests/integration/` |
| Component integration | RTL render + user interaction, mocked API client | `apps/web/src/**/__tests__/` |
| E2E | Playwright, full browser→frontend→API→DB stack | `apps/web/tests/e2e/` |

Note explicitly: **`apps/api/tests/unit/` is NOT unit tests** — it is the pre-rename state; the 26 DB-backed files move to `tests/service/`.

**Decision rules.** The article's table adapted: pure function / validation / calculation → unit; service method + query + transaction boundary → service integration (real DB); middleware wiring / contract between components → route integration; component behavior as users interact → component integration; user-observable outcome across full stack → E2E. Heuristic: *if mocking feels necessary to make a test fast, but the mock hides the failure mode you care about, write it at the next level down the trophy/pyramid.*

**Banned at each level.** E2E banned: form validation, field-level error messages, edge-case re-verification, feature-flag toggles, anything already asserted by a Zod schema or RTL component test. Service integration banned: mocking the DB under test. Unit banned: mocking so much that real integration failures are hidden. Component banned: asserting class strings as the primary behavior check.

**Target test shape.** Ratios by intent (not strict counts): backend = unit base, service/route middle, no e2e; frontend = RTL largest, E2E smallest. The E2E cap is defined by the critical-flow list (subsection 8), not by coverage percentage. Hard rule: **an E2E spec may only cover a critical flow; anything else covered by a lower layer.** New E2E tests require a one-line justification citing the critical-flow list in the PR description (M2).

**Database isolation in tests.** Document current policy: unique-phone (`generateUniquePhone`) + scoped cleanup per test; `tests/global-setup.ts` clears only the 3 utility tables once. Note the limitation (state accumulation, latent order-dependence) and that transactional rollback (`BEGIN/ROLLBACK` per test) is the documented future improvement — not implemented.

**Flakiness policy.** (a) A flaky test is a test failure, never silently ignored. (b) Quarantine rule: 3 failures in 7 days with no code change → mark `test.skip` with an owner + issue link in a comment; fix is tracked, not forgotten. (c) Retry cap: max 1 retry in CI, and a test needing the retry to pass is quarantined under rule (b). (d) **Browser projects are never dropped for "flakiness"** — that decision must be a reviewed PR with a linked issue (overrides the precedent of commit `1f7fa72`).

**E2E inclusion criteria.** The critical-flow list (proposed, pending user approval — see §3 below). A flow is E2E-worthy iff it is: (1) a user-observable outcome across the full stack, AND (2) on the approved critical-flow list (auth, money, or core value-delivery). Everything else is covered at a lower level.

**CI testing policy.** Current state (from audit): E2E gates PRs (4-way sharded); API vitest gates api changes; web RTL + shared unit run only locally. Immediate policy: unchanged gating (E2E stays blocking). Documented follow-ups (not in this plan): add web RTL + shared to CI as a cheap gate; split E2E into `@smoke` (PR) / full (main); set a flakiness budget.

### 3. Proposed critical-flow list (E2E KEEP set) — **pending user approval**

The audit input. Proposed critical journeys E2E must keep covering:

| # | Critical flow | Current spec (tests) |
|---|---------------|----------------------|
| 1 | Auth: phone → verify → complete-profile → dashboard, logout, guards | `auth-journey.spec.ts` (2) |
| 2 | Trip CRUD: create → edit → delete, member-permission boundaries | `trip-journey.spec.ts` (subset) |
| 3 | Invitation + RSVP + deep-link join (unauthenticated & authenticated) | `invitation-journey.spec.ts` (subset) |
| 4 | Itinerary CRUD on a real trip (event create/edit/delete) | `itinerary-journey.spec.ts` (subset) |
| 5 | Messaging: send/receive, organizer actions | `messaging.spec.ts` (subset) |
| 6 | Settle: expense create + balance accuracy | `settle-journey.spec.ts` (1) |
| 7 | Notifications: bell → navigate → mark-read (push path) | `notifications.spec.ts` (1) |

Everything outside this list is an audit candidate for SPLIT/CUT. This list is the input to the audit phase; **the user approves or edits it during Phase 1 review.**

### 4. Audit verdict framework (applied per spec file)

Four gates, in order — a `test` (or `test.step` group) is scored against each:

1. **User-observable full-stack outcome?** Tests that only validate a form, assert rendering detail, or check API contract → fail here → **CUT** (covered below).
2. **On the approved critical-flow list (auth / money / core value)?** Tests that pass gate 1 but fail this → **CUT** or **SPLIT**.
3. **Already covered at a lower layer?** Grep-verify the claimed lower-layer test exists (`shared/__tests__/*.test.ts`, `apps/web/src/**/__tests__/*.test.tsx`, `apps/api/tests/*/*.test.ts`) → if yes, **CUT** with the `file:line` citation. If the coverage claim fails grep → **CONVERT** (needs a lower-layer test added in follow-up) or **KEEP**.
4. **Conflates multiple unrelated user goals into one "journey"?** → **SPLIT**: name which steps stay E2E (critical) and which move down.

Verdict outcomes: **KEEP** (critical, stays), **SPLIT** (name E2E-kept + moved-down boundary), **CUT** (delete, lower layer covers — cite it), **CONVERT** (delete from E2E, lower-layer test must be added in follow-up).

Per-verdict evidence requirement (A2): every non-KEEP verdict cites two `file:line` refs — (a) the test/step being cut, (b) the lower-layer test asserting the same behavior.

### 5. Post-rename API test tree (target state for M3/M4)

```
apps/api/tests/
├── unit/          ← true pure units (admin.middleware, audit, discover.service,
│                    geocoding.service, image-processing*, jwt-config, pagination,
│                    phone, push.service, query-logger, sms.service, upload.service,
│                    verification.service, workers/*)  — ~15 files
├── service/       ← 26 DB-backed service tests (trip.service, invitation.service,
│                    event.service, balance.service, calendar.service, ...) [NEW, git mv]
└── integration/   ← unchanged (34 route + non-route app.inject tests)
```

Rename mechanics: `git mv apps/api/tests/unit/<file> apps/api/tests/service/<file>` for the 26 files; update any hardcoded path references; verify `apps/api/vitest.config.ts` glob + `.github/workflows/ci.yml` filter still match `tests/**`.

## Testing Strategy (verification of this plan's own work)

This is a **documentation + audit** plan, so the TDD RED/GREEN/CHECK loop is adapted to "evidence → verdict → verify" rather than code-behavior:

- **Phase 1 tasks (doc + rename):** RED = the acceptance requirement for the doc subsection (written as the first line of each task); GREEN = write the `AGENTS.md` content / run the `git mv`; CHECK = `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @journiful/api test` via `make test-exec` — all must pass with no test exclusions.
- **Phase 2 tasks (audit):** RED = grep-gather evidence for the spec (which tests hit which lower-layer coverage); GREEN = fill the verdict row with `file:line` citations; CHECK = the verdict row is verifiable against the grep evidence (re-run the grep and confirm the citation exists).

No new application code and no new tests are written by this plan.

## Implementation Checklist

### Phase 1: Methodology doc + honest taxonomy

- [x] **Task 1: Restructure AGENTS.md Testing section scaffold**
  - RED: The AGENTS.md Testing section must contain the 9 subsection headings from §Architecture.1 with the commands block intact (`AGENTS.md:46-60`).
  - GREEN: Edit `AGENTS.md` — keep lines 46-60 verbatim, append the `### Testing methodology` block with the 9 empty subsection headings.
  - CHECK: `Read AGENTS.md:46-70` — commands block unchanged, 9 headings present.

- [x] **Task 2: Write Philosophy + Test level taxonomy subsections**
  - RED: The doc must state the hybrid model (backend Pyramid, frontend Trophy) and define all 5 levels with real directory names.
  - GREEN: Fill subsections "Philosophy — hybrid" and "Test level taxonomy" per §Architecture.2. Reference the post-rename `tests/service/` directory.
  - CHECK: Read-back — a reader can assign any new test to exactly one of the 5 levels.

- [x] **Task 3: Write Decision rules + Banned at each level subsections**
  - RED: The doc must give a mechanical decision path from "what am I verifying" → level, and a ban list per level.
  - GREEN: Fill "Decision rules (which level to write)" and "Banned at each level" per §Architecture.2.
  - CHECK: Read-back — each E2E anti-pattern found in the audit (3× form validation, browser-drop, fat journeys) is explicitly banned.

- [x] **Task 4: Write Target test shape + DB isolation + Flakiness policy subsections**
  - RED: The doc must state the E2E justification rule (M2), current DB isolation policy + its limitation, and the 4 flakiness rules.
  - GREEN: Fill "Target test shape", "Database isolation in tests", "Flakiness policy" per §Architecture.2.
  - CHECK: Read-back — the justification rule and the no-silent-browser-drop rule are explicit.

- [x] **Task 5: Write E2E inclusion criteria + CI policy subsections (critical-flow list)**
  - RED: The doc must define "critical user flow" concretely and state the current + deferred CI gating.
  - GREEN: Fill "E2E inclusion criteria" (with the proposed critical-flow list from §Architecture.3 — **user approves/edits this before Task 5 is marked done**) and "CI testing policy" per §Architecture.2.
  - CHECK: User confirms the critical-flow list; read-back of CI subsection matches `.github/workflows/ci.yml` reality.

- [x] **Task 6: Rename `tests/unit/` DB-backed files → `tests/service/`**
  - RED: The taxonomy doc references `tests/service/` — the directory must exist with the 26 files.
  - GREEN: `git mv` the 26 DB-backed files from `apps/api/tests/unit/` to `apps/api/tests/service/` (list in §Architecture.5). Leave the ~15 true-pure files in `tests/unit/`. Update any hardcoded path refs found by `grep -rn "tests/unit"` across the repo.
  - CHECK: `make test-exec CMD="pnpm --filter @journiful/api test"` — all API tests still discovered and pass. `grep -n "tests/unit" .github/workflows/ci.yml apps/api/vitest.config.ts` — no stale path that would exclude moved files.

### Phase 2: Audit of 13 E2E spec files (one verdict row per task)

For each task: RED = grep-gather evidence (list the spec's tests + locate lower-layer coverage claims); GREEN = fill verdict row (KEEP/SPLIT/CUT/CONVERT + `file:line` citations); CHECK = re-grep to confirm each citation resolves.

- [ ] **Task 7: Audit `auth-journey.spec.ts`** (2 tests: 27,104) — expected KEEP (critical flow #1).
- [ ] **Task 8: Audit `trip-journey.spec.ts`** (5 tests: 39,220,465,619,749) — expected SPLIT/CUT on validation & view-mode steps (`create-trip-dialog.test.tsx`, `trip-schemas.test.ts` cover form).
- [ ] **Task 9: Audit `invitation-journey.spec.ts`** (9 tests: 42,166,351,392,500,720,833,895,960) — expected SPLIT: deep-link + RSVP stay (critical #3), member-indicator/onboarding-wizard steps CUT (`members-list.test.tsx`, `member-onboarding-wizard.test.tsx`).
- [ ] **Task 10: Audit `itinerary-journey.spec.ts`** (3 tests: 31,248,379) — expected SPLIT: CRUD stays (critical #4), view-modes + restore CUT (`itinerary/*` component tests).
- [ ] **Task 11: Audit `messaging.spec.ts`** (2 tests: 39,278) — expected SPLIT: send/receive + organizer actions stay (critical #5), restricted-state steps CUT.
- [ ] **Task 12: Audit `photos.spec.ts`** (1 test: 122) — expected CUT/CONVERT: lightbox/caption/delete covered by `image-upload.test.tsx` + photos RTL; decide if upload path is critical.
- [ ] **Task 13: Audit `profile-journey.spec.ts`** (2 tests: 71,135) — expected CUT: covered by RTL profile tests.
- [ ] **Task 14: Audit `notifications.spec.ts`** (1 test: 38) — expected KEEP (critical #7) or SPLIT (preferences step CUT — `notification-preferences.test.tsx`).
- [ ] **Task 15: Audit `discover-journey.spec.ts`** (1 test: 111) — expected CUT/CONVERT: POI detail sheet covered by `components/discover/__tests__`.
- [ ] **Task 16: Audit `pwa.spec.ts`** (6 tests: 20,29,59,75,85,108) — expected CUT to 1 smoke (offline + manifest); push-subscribe/install-prompts CUT (covered by platform/native-push RTL).
- [ ] **Task 17: Audit `admin-journey.spec.ts`** (2 tests: 57,125) — expected SPLIT: manage-users critical? (admin is a real feature — assess), non-admin redirect CUT (route-level test).
- [ ] **Task 18: Audit `mutuals-journey.spec.ts`** (1 test: 22) — expected CUT: covered by `app/(app)/mutuals` RTL + `mutuals.service.test.ts`.
- [ ] **Task 19: Audit `settle-journey.spec.ts`** (1 test: 29) — expected KEEP (critical #6, money path).
- [ ] **Task 20: Produce consolidated verdict table + action backlog**
  - RED: All 13 verdict rows must satisfy A2 (every non-KEEP row cites `file:line` for the cut test AND its lower-layer replacement).
  - GREEN: Write the consolidated table to `.thoughts/audits/2026-08-08-e2e-triage.md` (one row per spec, verdict + evidence + lower-layer refs) plus a "next actions" backlog grouping rows by execution order.
  - CHECK: Review — every CUT/CONVERT row's replacement citation resolves via grep; the table matches the per-task rows.

---

## Tracked Changes

> Record significant deviations from the plan during implementation.

**2026-08-08 — Phase 1 complete. Deviations:**
- **File count:** Plan estimated 26 DB-backed files; actual count is 22. Two workers (`daily-itineraries.worker.test.ts`, `notification-batch.worker.test.ts`) correctly moved but were listed under `workers/*` as pure in the plan. Plan also omitted `schema.test.ts`, `itinerary-schema.test.ts`, `calendar.service.test.ts`, `pg-rate-limit-store.test.ts`, `token-blacklist.test.ts`, `update-member-role.test.ts`, `account-lockout.test.ts` — all correctly classified at move time.
- **Worktree:** Implementation used a git worktree at `/home/chend/git/tripful-testing-strategy` per user preference, not the main worktree.
- **Task 5 gate:** Critical-flow list approved with a note that notification *triggers* may be folded inline into flows 1-5 during the Phase 2 audit; the standalone notifications spec covers only notification-center UX.
- **Task 6 CHECK:** Devcontainer mounts the main worktree, so the post-rename API test run could not be executed from the worktree. Verification relied on: (a) all 1,386 tests pass pre-rename, (b) grep confirms zero stale `tests/unit` references in `apps/api/vitest.config.ts` or `.github/workflows/ci.yml`, (c) vitest uses filesystem-based discovery with no `include`/`exclude` patterns. Full verification at merge time.
- **Tasks 1-2:** Pre-applied from a prior session; commit hashes `c6a7d6f5` and `72759887`.
- **Q1**: `pnpm lint` and `pnpm typecheck` both pass cleanly (devcontainer).
- **Q2**: All 1,386 API tests pass; vitest config + CI workflows verified clean (no stale `tests/unit` references). Devcontainer mounts only the main worktree so the post-rename run from the worktree wasn't feasible — verification at merge time is the final gate.

## References

- Web research: [Unit vs Integration vs E2E Testing: Testing Pyramid Decision Framework (2026)](https://getautonoma.com/blog/unit-vs-integration-vs-e2e-testing) — Autonoma. Source of: hybrid Pyramid/Trophy split, AI-era ratios (~60/25/15), per-level anti-patterns, "lowest level that gives confidence" decision rule.
- Testing Trophy: [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- Prior E2E optimization plans (the regression we must not repeat): `.thoughts/plans/2026-02-08-e2e-test-optimization.md`, `.thoughts/plans/2026-02-21-e2e-simplification.md`
- Codebase audit (input data): explore-agent task `ses_01c68ddb2ffeDqXlmxczklMR7T` (Aug 8 2026 test-infrastructure map)
- Relevant files: `AGENTS.md:46-60` (testing section to replace), `apps/api/vitest.config.ts`, `apps/web/playwright.config.ts`, `.github/workflows/ci.yml`, `apps/web/tests/e2e/*.spec.ts`
