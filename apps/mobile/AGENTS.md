# Journiful mobile — AGENTS.md

## WHAT

`apps/mobile` is the Expo 57 app: React Native, NativeWind v5 (Tailwind 4), expo-router, with a static web build for review. It is a **design mockup**: every store is in-memory mock data, there is no backend wiring, and the one real network call is the flight lookup. A reload signs you out, because nothing persists.

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

### Commands

Everything runs in the devcontainer:

```bash
make test-exec CMD="cd apps/mobile && pnpm test"
make test-exec CMD="cd apps/mobile && pnpm typecheck"
make test-exec CMD="cd apps/mobile && pnpm lint"
```

On this branch a commit needs the mobile suite only. To look at the app: `cd apps/mobile && pnpm web`, then open the route you want, the lab included.
