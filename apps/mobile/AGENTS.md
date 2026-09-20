# Journiful mobile — AGENTS.md

## WHAT

`apps/mobile` is the Expo 57 app: React Native, NativeWind v5 (Tailwind 4), expo-router, with a static web build for review. It is a **design mockup**: every store is in-memory mock data, there is no backend wiring, and the one real network call is the flight lookup. A reload signs you out, because nothing persists.

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
- **A store's data comes from an injected source, never a module-level mock import.** The seam lives in `lib/sources.ts`: the provider takes a `source` prop defaulting to the mock, and the wiring swaps in an API source without touching the screens.
- **Every interactive target is at least 44x44pt.** This is the measured form of the lab's own rule — "a twenty-pixel box is not something a thumb can be asked to hit." A lone target (header buttons, the zone token, the sign-in word, the month arrows) gets there with `hitSlop`, or with padding plus a matching negative margin (`p-2 -m-2`), so the screenshot does not change: if the picture moves, the fix is wrong. Grid cells (`DatePicker` day cells, `TimeField` rows) cannot borrow a neighbour's hit area, so the cell itself grows to 44pt and the surface gets taller — the calendar by ~28pt, the open time column with it. That shift is intended, not a regression.

### Commands

Everything runs in the devcontainer:

```bash
make test-exec CMD="cd apps/mobile && pnpm test"
make test-exec CMD="cd apps/mobile && pnpm typecheck"
make test-exec CMD="cd apps/mobile && pnpm lint"
```

On this branch a commit needs the mobile suite only.

### Looking at it

```bash
make mockup     # from the repo root, on the host — not in the devcontainer
```

Then open the route you want: the app at `http://localhost:8081`, the design system at `http://localhost:8081/design`, or any other route by its path.

Two traps, both of which have cost real time:

- It has to run **on the host**. The devcontainer publishes only 3000 and 8000, so a server started inside it is invisible to the browser.
- It has to be the **dev server**. A static export (`npx expo export --platform web`) compiles `__DEV__` to false, and the lab's first line is `if (!__DEV__) return <Redirect href="/+not-found" />` — so in any export `/design` lands on "Nothing here", which reads as a broken route rather than as a guarded one.
