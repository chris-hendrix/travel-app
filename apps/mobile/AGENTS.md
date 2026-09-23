# Journiful mobile — AGENTS.md

## WHAT

`apps/mobile` is the Expo 57 app: React Native, NativeWind v5 (Tailwind 4), expo-router, with a static web build for review. It is wired to the backend: server state lives in TanStack Query behind the store hooks, and the session persists in `lib/session.ts` (SecureStore on native, localStorage on web), so a reload keeps you signed in. The flight lookup still POSTs `/flights/lookup` through the same boundary.

It is also where the product is going. `apps/web` is being deprecated in its favour (see the root `AGENTS.md`), and the backend wiring happens here — screen by screen, in the order the screens were designed.

It is also the design system. The system is the components plus the lab that documents them, not a document about them.

## HOW

### Start from the design system

Read `apps/mobile/app/design/index.tsx` (the lab) before building a screen. It carries the tokens, every primitive with its contract and a note explaining why it is the way it is, the screens list, the plumbing, the feedback rule and the parking lot.

Then use what is there. `components/ui` is the primitive layer; `components/trip` and `components/notification` compose it. If the piece you need does not exist:

1. Add it to `components/ui`, with a doc comment that explains **why** it is the way it is, not what it does.
2. Add it to the lab as a `Specimen` with a `contract` and a `note`, and link any new screen from the lab's Screens section.

A component that is not in the lab does not exist to the next person. The lab is dev-only, so its specimen is what makes a primitive discoverable at all.

### Rules that are easy to get wrong

- **Feedback is state, not a message.** There is no toast and no component for one; the lab's Feedback section carries the reasoning. An answer inverts the control that gave it, an authored thing appears in the list you were reading, a failure belongs at the field that caused it.
- **Copy is held to what the app does.** No em dashes, sentence case for titles, and the app's own vocabulary: "the run" for the itinerary, "doors" for quiet actions onto dialogs, "the band" for the header. If the app does not do it, the copy does not say it.
- **The web build is a static export.** No `[id]` dynamic routes and no server components. Screens read their parameters with `useLocalSearchParams` inside a `Suspense`.
- **Colours live in `global.css` `@theme`**, hex only, never `hsl()`. For a prop that cannot take a class, an icon's `color` or a field's placeholder, use `lib/theme.ts`.
- **Instants go through `lib/timezone.ts`.** Never format a `Date` directly: the trip's zone and the device's are different questions.
- **Accessible state is `role` + `aria-*`, never `aria-pressed`.** The `role` prop and the `aria-*` state props are cross-platform: React Native maps them to the native accessibility role and state, and the web export renders them as DOM attributes — so write them and both surfaces announce. `accessibilityRole`/`accessibilityState` are the legacy spelling: leave them where they already are, and let them disappear as files are touched. `aria-pressed` does not exist in React Native at all (it is web-only), so on a phone it is a silent no-op — a choice among visible options is `role="radio"` + `aria-selected` inside `role="radiogroup"`, never `aria-pressed`.
- **Server state comes from a query key, never a `@/mocks` import.** The seam is `lib/queries/*`: each domain exposes a query-key factory (`tripKeys`, `eventKeys`, …) plus `queryOptions` and a mapping `select()` from the API shape to the mobile shape, consumed behind the store hooks (`useTrips`/`useTrip`/`useMembers`/`useEvents`/`useStays`/`useTravel`/`useNotifications`/auth). Screens call hooks and never value-import `@/mocks` — type-only imports for shared types are fine, and `app/design/*` keeps the fixtures for the lab. Mutations are optimistic with rollback + invalidate.
- **Placeholders come from one file, and backend gaps are named where they bite.** All event/stay images come from `lib/placeholder.ts` (`placeholderPhoto`); a screen that needs a backend column or field it does not have says so in a comment at the call site, naming the missing field. There is no central ledger of such comments — the wiring plan tracks the remaining backend work, not the comments.
- **Never a bare `fetch` — everything goes through `lib/api.ts`.** The base URL, the ~10s timeout, the bearer header from `lib/session.ts`, and the typed errors (`ApiError` carrying the status, `TimeoutError`, `NetworkError`) live in the one wrapper, so the wiring inherits a single contract instead of re-deriving one per store. The wrapper fails loudly with no base URL outside development, and `lib/flights.ts` is the reference client: it keeps its `null`-for-unknown contract at its own boundary and propagates transport and timeout failures instead of collapsing them into `null`.
- **A font-load failure renders, never hangs.** The root layout hides the splash on `loaded || error`, catches the `hideAsync()` promise, and logs the failure; `global.css` already declares system fallbacks, so a failed font becomes a degraded screen rather than a stuck splash.
- **Every string renders inside a `<Text>`.** A bare string child of a `<View>` is a text node with no class of its own: it takes the browser's default font instead of the app's, warns in the web console (`Unexpected text node … A text node cannot be a child of a <View>`), and throws on native. A component that owns a text row passes `<Text>` children, never a string — `Fact` in `app/trips/stay/detail.tsx` is the one that had this wrong, in the check-in and check-out rows.
- **Every interactive target is at least 44x44pt.** This is the measured form of the lab's own rule — "a twenty-pixel box is not something a thumb can be asked to hit." A lone target (header buttons, the zone token, the sign-in word, the month arrows) gets there by growing its own box to 44x44 with padding and no negative margin, so the box sits inside its row and the icon or text inside it does not move. The surface grows where it must: the AppHeader band is 16 + 44 + 12 = 72, the title row is 16 + 44 + 16 + 1 = 77, the calendar header is 8 + 44 + 8 = 60. Grid cells (`DatePicker` day cells, `TimeField` rows) grow the same way, so the calendar is ~28pt taller. Never `hitSlop` for this: it leaves the element's box unchanged on the web build and is therefore unverifiable in a browser. Never padding plus a matching negative margin either: the margin pulls the box back out of its row and the row's content overflows its own box.

### Commands

Everything runs in the devcontainer:

```bash
make test-exec CMD="cd apps/mobile && pnpm test"
make test-exec CMD="cd apps/mobile && pnpm test:e2e"
make test-exec CMD="cd apps/mobile && pnpm typecheck"
make test-exec CMD="cd apps/mobile && pnpm lint"
```

E2E runs take file paths, not `--grep`: the flag is swallowed through test-exec's bash -c, so pass the spec path (`pnpm test:e2e tests/e2e/auth-journey.spec.ts`). The Expo web build serves on `http://localhost:8081`, which must be present in the API's `FRONTEND_URL` or the browser's CORS preflight fails. The E2E suite drives the Expo web export, so it covers the web localStorage session path — SecureStore and native deep links are not covered by it.

On this branch a commit needs the mobile suite only.

### Looking at it

```bash
make mockup     # from the repo root, on the host — not in the devcontainer
```

Then open the route you want: the app at `http://localhost:8081`, the design system at `http://localhost:8081/design`, or any other route by its path.

Two traps, both of which have cost real time:

- It has to run **on the host**. The devcontainer publishes only 3000 and 8000, so a server started inside it is invisible to the browser.
- It has to be the **dev server**. A static export (`npx expo export --platform web`) compiles `__DEV__` to false, and the lab's first line is `if (!__DEV__) return <Redirect href="/+not-found" />` — so in any export `/design` lands on "Nothing here", which reads as a broken route rather than as a guarded one.
