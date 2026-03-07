# Tasks: Frontend Design Polish

## Phase 1: Trim Unused Fonts

- [ ] Task 1.1: Remove Nunito, Caveat, Oswald from font pipeline
  - Implement: Remove `nunito`, `caveat`, `oswald` declarations and imports from `apps/web/src/lib/fonts.ts`
  - Implement: Remove `nunito`, `caveat`, `oswald` imports and `.variable` entries from `apps/web/src/app/layout.tsx`
  - Test: Grep codebase for `--font-nunito`, `--font-caveat`, `--font-oswald`, `nunito.variable`, `caveat.variable`, `oswald.variable` to confirm zero references
  - Verify: run `pnpm typecheck` and `pnpm lint` — no errors
  - Verify: run full test suite

## Phase 2: Dark Mode

- [ ] Task 2.1: Add dark mode CSS overrides and fix hardcoded colors in globals.css
  - Implement: Add `@media (prefers-color-scheme: dark) { :root { ... } }` block with full dark palette to `apps/web/src/app/globals.css`
  - Implement: Replace hardcoded `#faf5e8` in `.airmail-stripe`, `.airmail-border-top`, `.airmail-border-bottom` with `var(--color-card)`
  - Implement: Add dark variant for `.gradient-mesh` with adjusted rgba values for dark backgrounds
  - Implement: Add dark variants for `.linen-texture` (reduce opacity) and `.card-noise` (reduce opacity)
  - Implement: Add dark variant for `.postcard` shadow with lighter shadow colors
  - Test: run `pnpm typecheck` — no errors
  - Verify: run full test suite

- [ ] Task 2.2: Update Sonner theme and global-error.tsx for dark mode
  - Implement: Change `theme="light"` to `theme="system"` in `apps/web/src/components/ui/sonner.tsx`
  - Implement: Update `apps/web/src/app/global-error.tsx` body to use `bg-background text-foreground` classes
  - Test: run existing sonner tests — ensure they still pass
  - Verify: run full test suite

- [ ] Task 2.3: Manual dark mode visual verification
  - Seed: Ensure test data exists (trips, messages, itinerary, notifications)
  - Verify: Open browser with Playwright, emulate `prefers-color-scheme: dark`
  - Verify: Screenshot trips list, trip detail, itinerary, messages, notifications, auth pages, global error
  - Verify: Check PostmarkStamp SVG colors, trip card scrims, airmail stripes, gradient mesh
  - Verify: Screenshot same pages in light mode for comparison
  - Verify: run full test suite (ensure no regressions from dark mode CSS)

## Phase 3: Page Transitions

- [ ] Task 3.1: Enable CSS View Transitions with reduced-motion support
  - Implement: Add `viewTransition: true` to `experimental` in `apps/web/next.config.ts`
  - Implement: Add `@view-transition { navigation: auto; }` rule to `apps/web/src/app/globals.css`
  - Implement: Add `::view-transition-old(root)` and `::view-transition-new(root)` fade keyframes
  - Implement: Add `@media (prefers-reduced-motion: reduce)` to disable view transition animations
  - Test: run `pnpm typecheck` — no errors
  - Verify: Open browser with Playwright, navigate between pages, verify smooth crossfade
  - Verify: run full test suite

## Phase 4: Empty States & Success Animations

- [ ] Task 4.1: Create EmptyState component and refactor all empty state locations
  - Implement: Create `apps/web/src/components/ui/empty-state.tsx` with `EmptyStateProps` (icon, title, description, optional action)
  - Implement: Refactor `apps/web/src/components/trip/trips-content.tsx` — replace existing empty state with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/messaging/trip-messages.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/itinerary/itinerary-view.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/notifications/notification-dropdown.tsx` — replace with `<EmptyState>`
  - Implement: Refactor `apps/web/src/components/trip/mutuals-content.tsx` — replace with `<EmptyState>`
  - Test: run existing component tests to ensure empty states still render
  - Verify: Open browser with Playwright, verify empty state rendering in both light and dark modes
  - Verify: run full test suite

- [ ] Task 4.2: Add success toast animation
  - Implement: Add `@keyframes checkPop` animation to `apps/web/src/app/globals.css`
  - Implement: Update Sonner `toastOptions.classNames` in `apps/web/src/components/ui/sonner.tsx` to apply checkPop animation to success icons
  - Test: Trigger a success toast via Playwright, verify animation renders
  - Verify: run full test suite

## Phase 5: Cleanup

- [ ] Task 5.1: Triage PROGRESS.md for unaddressed items
  - Review: Read entire PROGRESS.md
  - Identify: Find FAILURE, BLOCKED, reviewer caveats, or deferred items across ALL phases
  - Fix: Create individual fix tasks in TASKS.md for each outstanding issue
  - Verify: run full test suite

## Phase 6: Final Verification

- [ ] Task 6.1: Full regression check
  - Verify: all unit tests pass (`pnpm test`)
  - Verify: all integration tests pass
  - Verify: all E2E tests pass (`pnpm test:e2e`)
  - Verify: linting passes (`pnpm lint`)
  - Verify: type checking passes (`pnpm typecheck`)
  - Verify: final visual screenshots in both light and dark modes
