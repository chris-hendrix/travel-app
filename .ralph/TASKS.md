# Tasks: Frontend Design Polish

## Phase 1: Trim Unused Fonts

- [x] Task 1.1: Remove Nunito, Caveat, Oswald from font pipeline
  - Implement: Remove `nunito`, `caveat`, `oswald` declarations and imports from `apps/web/src/lib/fonts.ts`
  - Implement: Remove `nunito`, `caveat`, `oswald` imports and `.variable` entries from `apps/web/src/app/layout.tsx`
  - Test: Grep codebase for `--font-nunito`, `--font-caveat`, `--font-oswald`, `nunito.variable`, `caveat.variable`, `oswald.variable` to confirm zero references
  - Verify: run `pnpm typecheck` and `pnpm lint` — no errors
  - Verify: run full test suite

## Phase 2: Dark Mode

- [x] Task 2.1: Add dark mode CSS overrides and fix hardcoded colors in globals.css
  - Implement: Add `@media (prefers-color-scheme: dark) { :root { ... } }` block with full dark palette to `apps/web/src/app/globals.css`
  - Implement: Replace hardcoded `#faf5e8` in `.airmail-stripe`, `.airmail-border-top`, `.airmail-border-bottom` with `var(--color-card)`
  - Implement: Add dark variant for `.gradient-mesh` with adjusted rgba values for dark backgrounds
  - Implement: Add dark variants for `.linen-texture` (reduce opacity) and `.card-noise` (reduce opacity)
  - Implement: Add dark variant for `.postcard` shadow with lighter shadow colors
  - Test: run `pnpm typecheck` — no errors
  - Verify: run full test suite

- [x] Task 2.2: Update Sonner theme and global-error.tsx for dark mode
  - Implement: Change `theme="light"` to `theme="system"` in `apps/web/src/components/ui/sonner.tsx`
  - Implement: Update `apps/web/src/app/global-error.tsx` body to use `bg-background text-foreground` classes
  - Test: run existing sonner tests — ensure they still pass
  - Verify: run full test suite

- [x] Task 2.3: Manual dark mode visual verification
  - Seed: Ensure test data exists (trips, messages, itinerary, notifications)
  - Verify: Open browser with Playwright, emulate `prefers-color-scheme: dark`
  - Verify: Screenshot trips list, trip detail, itinerary, messages, notifications, auth pages, global error
  - Verify: Check PostmarkStamp SVG colors, trip card scrims, airmail stripes, gradient mesh
  - Verify: Screenshot same pages in light mode for comparison
  - Verify: run full test suite (ensure no regressions from dark mode CSS)

## Phase 3: Page Transitions

- [x] Task 3.1: Enable CSS View Transitions with reduced-motion support
  - Implement: Add `viewTransition: true` to `experimental` in `apps/web/next.config.ts`
  - Implement: Add `@view-transition { navigation: auto; }` rule to `apps/web/src/app/globals.css`
  - Implement: Add `::view-transition-old(root)` and `::view-transition-new(root)` fade keyframes
  - Implement: Add `@media (prefers-reduced-motion: reduce)` to disable view transition animations
  - Test: run `pnpm typecheck` — no errors
  - Verify: Open browser with Playwright, navigate between pages, verify smooth crossfade
  - Verify: run full test suite

## Phase 4: Empty States & Success Animations

- [x] Task 4.1: Create EmptyState component and refactor all empty state locations
  - Implement: Create `apps/web/src/components/ui/empty-state.tsx` with `EmptyStateProps` (icon, title, description, optional action)
  - Implement: Refactor `apps/web/src/components/trip/trips-content.tsx` — replace existing empty state with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/messaging/trip-messages.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/itinerary/itinerary-view.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/notifications/notification-dropdown.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/trip/mutuals-content.tsx` — replace with `<EmptyState>`
  - Test: run existing component tests to ensure empty states still render
  - Verify: Open browser with Playwright, verify empty state rendering in both light and dark modes
  - Verify: run full test suite

- [x] Task 4.2: Add success toast animation
  - Implement: Add `@keyframes checkPop` animation to `apps/web/src/app/globals.css`
  - Implement: Update Sonner `toastOptions.classNames` in `apps/web/src/components/ui/sonner.tsx` to apply checkPop animation to success icons
  - Test: Trigger a success toast via Playwright, verify animation renders
  - Verify: run full test suite

## Phase 5: Cleanup

- [x] Task 5.1: Triage PROGRESS.md for unaddressed items
  - Review: Read entire PROGRESS.md
  - Identify: Find FAILURE, BLOCKED, reviewer caveats, or deferred items across ALL phases
  - Fix: Create individual fix tasks in TASKS.md for each outstanding issue
  - Verify: run full test suite

- [x] Task 5.2: Fix test failures — missing QueryClientProvider wrapping (68 failures)
  - Fix: `apps/web/src/app/(app)/trips/[id]/trip-detail-content.test.tsx` (54 failures) — RsvpBadgeDropdown uses useQuery but tests don't wrap in QueryClientProvider
  - Fix: `apps/web/src/components/notifications/__tests__/notification-preferences.test.tsx` (14 failures) — CalendarTripSection uses useQuery but tests don't wrap in QueryClientProvider
  - Implement: Add QueryClientProvider wrapper to test setup for both files
  - Verify: run affected tests and confirm they pass

- [x] Task 5.3: Fix test failures — outdated assertions after component changes (11 failures)
  - Fix: `apps/web/src/components/trip/__tests__/trip-card.test.tsx` (11 failures) — component rendering changed but test assertions not updated
  - Implement: Update test assertions to match current component output
  - Verify: run affected tests and confirm they pass

- [x] Task 5.4: Fix test failures — missing schema field in fixture (1 failure)
  - Fix: `shared/__tests__/invitation-schemas.test.ts` (1 failure) — test fixture missing `calendarExcluded` field
  - Implement: Add `calendarExcluded` to the test fixture object
  - Verify: run affected test and confirm it passes

- [x] Task 5.5: Fix test failure — upload route 404 (1 failure)
  - Fix: `apps/api/tests/integration/trip.routes.test.ts` (1 failure) — upload route returns 404 but test expects 200
  - Investigate: Determine if the route was removed/renamed or if the test needs updating
  - Verify: run affected test and confirm it passes

- [x] Task 5.6: Fix remaining scattered test failures (5 failures)
  - Fix: `apps/web/src/hooks/__tests__/use-invitations.test.tsx` (1 failure)
  - Fix: `apps/web/src/components/ui/__tests__/button.test.tsx` (1 failure) — class name changed to rounded-xl
  - Fix: `apps/web/src/components/ui/__tests__/input.test.tsx` (1 failure)
  - Fix: `apps/web/src/components/__tests__/app-header.test.tsx` (1 failure)
  - Fix: `apps/web/src/components/itinerary/__tests__/itinerary-header.test.tsx` (1 failure)
  - Implement: Update assertions to match current component output
  - Verify: run affected tests and confirm they pass

- [x] Task 5.7: Fix lint warning — no-explicit-any in calendar.service.test.ts
  - Fix: `apps/api/tests/unit/calendar.service.test.ts` line 7 — `const service = new CalendarService(null as any)`
  - Implement: Use the same pattern applied to verification.service.test.ts in iteration 28
  - Verify: run `pnpm lint` with no warnings on that file

- [x] Task 5.8: Verify no DB rows reference removed fonts (nunito/caveat/oswald)
  - Investigate: Query the database for any trip/theme rows where the font column contains `nunito`, `caveat`, or `oswald`
  - If rows exist: Write and apply a migration to update them to a valid ThemeFont value
  - If no rows exist: Document the result and close
  - Verify: run `pnpm typecheck` to confirm schema consistency

## Phase 6: Final Verification

- [x] Task 6.1: Full regression check
  - Verify: all unit tests pass (`pnpm test`)
  - Verify: all integration tests pass
  - Verify: all E2E tests pass (`pnpm test:e2e`)
  - Verify: linting passes (`pnpm lint`)
  - Verify: type checking passes (`pnpm typecheck`)
  - Verify: final visual screenshots in both light and dark modes
