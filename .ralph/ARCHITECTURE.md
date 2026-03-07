# Architecture: Frontend Design Polish

Four visual improvements to the Tripful web frontend: font cleanup, dark mode, page transitions, and empty state standardization.

## Phase 1: Trim Unused Fonts

Remove 3 unused Google Font families (Nunito, Caveat, Oswald) that are imported but never referenced in any component.

**Files:**
- `apps/web/src/lib/fonts.ts` — Remove `nunito`, `caveat`, `oswald` exports and their imports from `next/font/google`
- `apps/web/src/app/layout.tsx` — Remove imports of `nunito`, `caveat`, `oswald` and their `.variable` entries from the `<html>` className

**Verification:** Grep the codebase for `--font-nunito`, `--font-caveat`, `--font-oswald`, `nunito`, `caveat`, `oswald` to confirm no references remain.

## Phase 2: Dark Mode

System-preference-based dark theme using CSS `@media (prefers-color-scheme: dark)` on `:root`. No manual toggle.

### Approach

Tailwind v4's `@theme` block defines the light palette. Dark overrides go in a `@media (prefers-color-scheme: dark) { :root { ... } }` block in `globals.css`, overriding the same CSS custom properties.

**CRITICAL**: All colors in `@theme` must remain hex (Tailwind v4 bug). The dark overrides in `@media` go outside `@theme` so `hsl()` would technically work, but use hex for consistency.

### Dark Palette — "Night Travel" Aesthetic

Warm charcoal base (`#1a1814`), linen cream foreground (`#e8dcc8`), brighter airmail blue (`#5a9fd4`), brighter rust accent (`#d4613e`). Full palette specified in the PRD.

### Files to Modify

1. **`apps/web/src/app/globals.css`**:
   - Add `@media (prefers-color-scheme: dark) { :root { ... } }` block with all color overrides
   - Replace hardcoded `#faf5e8` in `.airmail-stripe`, `.airmail-border-top`, `.airmail-border-bottom` with `var(--color-card)`
   - Add dark variant for `.gradient-mesh` using `@media (prefers-color-scheme: dark)` with adjusted rgba values
   - Adjust `.linen-texture` opacity for dark (reduce from 0.045 to ~0.025)
   - Adjust `.card-noise` opacity for dark (reduce from 0.03 to ~0.015)
   - Add dark variant for `.postcard` shadow (lighter shadow for dark backgrounds)

2. **`apps/web/src/components/ui/sonner.tsx`**:
   - Change `theme="light"` to `theme="system"`

3. **`apps/web/src/app/global-error.tsx`**:
   - Uses its own `<html>` tag — ensure it uses `bg-background text-foreground` classes on the body so dark CSS variables apply

### Components to Manually Verify in Dark Mode

- PostmarkStamp SVG text colors (may use hardcoded fills)
- Trip card image overlay scrims (`bg-black/50` etc. — probably fine)
- Auth layout pages (login, verify, complete-profile)
- Loading skeletons (should use `bg-muted` which auto-adapts)

## Phase 3: Page Transitions

CSS-only View Transitions using `@view-transition { navigation: auto; }`. Progressive enhancement — unsupported browsers get instant navigation (current behavior).

### Files to Modify

1. **`apps/web/next.config.ts`**:
   - Add `viewTransition: true` to the `experimental` block

2. **`apps/web/src/app/globals.css`**:
   - Add `@view-transition { navigation: auto; }` rule
   - Add `::view-transition-old(root)` and `::view-transition-new(root)` with fade animations
   - Add `@media (prefers-reduced-motion: reduce)` to disable animations

No `<ViewTransition>` React component needed — CSS-only approach.

## Phase 4: Empty States & Success Animations

### EmptyState Component

Create `apps/web/src/components/ui/empty-state.tsx` — a unified component for all empty states.

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
}
```

Styling: centered layout, muted icon (size-12), Playfair heading (`font-playfair`), muted description, optional CTA button. Uses `card-noise` background.

### Locations to Refactor

| File | Current State | New Props |
|------|---------------|-----------|
| `apps/web/src/components/trip/trips-content.tsx` | Rich PostmarkStamp layout | `icon=Plane, title="No postcards yet", description="Start planning your next adventure", action={href="/trips/new"}` |
| `apps/web/src/components/messaging/trip-messages.tsx` | Simple icon + text | `icon=MessageCircle, title="No messages yet", description="Start the conversation..."` |
| `apps/web/src/components/itinerary/itinerary-view.tsx` | Icon + heading + desc | `icon=CalendarDays, title="No itinerary yet", description="Add events, accommodations..."` |
| `apps/web/src/components/notifications/notification-dropdown.tsx` | Icon + text | `icon=Bell, title="All caught up", description="You'll see trip updates..."` |
| `apps/web/src/components/trip/mutuals-content.tsx` | Icon + heading + desc + topo | `icon=Users, title="No mutuals yet", description="Mutuals are people who share trips..."` |

### Success Toast Animation

Add `@keyframes checkPop` animation in `globals.css`. Style via Sonner's `toastOptions.classNames` in `sonner.tsx` to add a subtle scale animation to success toast icons.

## Testing Strategy

### Automated
- **Typecheck**: `pnpm typecheck` — no new errors
- **Lint**: `pnpm lint` — no new errors
- **Unit/Integration**: `pnpm test` — all existing tests pass
- **E2E**: `pnpm test:e2e` — all existing tests pass

### Manual (Playwright browser)
- **Light mode**: Visual verification of all pages
- **Dark mode**: Emulate `prefers-color-scheme: dark` via Playwright, verify all pages
- **Page transitions**: Navigate between pages, verify crossfade animation
- **Empty states**: Verify all 5 empty state locations render correctly in both modes
- **Success toasts**: Trigger a success action, verify animation
- **Reduced motion**: Emulate `prefers-reduced-motion: reduce`, verify transitions are disabled
