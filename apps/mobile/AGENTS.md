# Journiful mobile — AGENTS.md

## WHAT

`apps/mobile` is the Expo 57 app: React Native, NativeWind v5 (Tailwind 4), expo-router. It ships **two ways**: as the Android app (`com.journiful.app`, built with expo prebuild + gradle, distributed through Firebase App Distribution) and as the static web export (`pnpm export:web`) served by `scripts/serve-static.mjs` (`pnpm serve:web`) at `journiful.app` and `beta.journiful.app`. It is wired to the backend: server state lives in TanStack Query behind the store hooks, and the session persists in `lib/session.ts` (SecureStore on native, localStorage on web), so a reload keeps you signed in. Push is FCM: `lib/push.ts` registers the raw device token against the API's `POST /push/subscribe`, and `lib/pushRoutes.ts` maps the API's web urls onto app routes on tap. The flight lookup still POSTs `/flights/lookup` through the same boundary.

It is the product surface (native and web). `apps/web` is frozen in its favour (see the root `AGENTS.md`): it remains the rollback target and the home of `/admin` on its own Railway hostname. The backend wiring is done.

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

### Android

```bash
# Host, not the devcontainer: prebuild and gradle need JAVA_HOME and ANDROID_HOME
make android-apk       # expo prebuild -p android --clean + ./gradlew assembleRelease
make android-install   # adb install -r the release APK + launch
make android-dev       # prebuild if android/ is missing, then expo run:android
make android-logs      # native logcat
make adb-reverse       # forward 8000/3000 for a device build against make dev
```

Signing is a config plugin (`plugins/withAndroidSigning.js`) so it survives `prebuild --clean`: it reads `JOURNIFUL_KEYSTORE` / `JOURNIFUL_KEY_ALIAS` / `JOURNIFUL_STORE_PASSWORD` / `JOURNIFUL_KEY_PASSWORD` from `~/.gradle/gradle.properties`. `android/` is gitignored and regenerated; `google-services.json` is gitignored and copied from `apps/web/android/app/` locally, written in CI from a secret.

Push notes that are easy to get wrong: the FCM payload's `data.url` is a **web url** and `lib/pushRoutes.ts` maps it (`/trips?id=x` → `/trips/detail?id=x`); `data.url` is the only routing signal, since the API no longer sets a `clickAction`; the notification small icon must stay the monochrome asset or Android renders a white square; registration is best-effort everywhere and must never block a sign-in; the channel id the API sends is `"default"`, which is why `ensureChannel()` creates exactly that one. A device holding the old Capacitor APK must be uninstalled first (same package, different signing key).

### Driving the WSL2 emulator, which is where the friction is

The emulator and Android Studio live on Windows; the build lives in WSL2. Two facts save the loop:

- **`adb` in WSL2 must be the Windows one.** Expo and gradle resolve `adb` from `$ANDROID_HOME/platform-tools/adb`, and the Linux adb server cannot see an emulator the Windows adb server owns. A wrapper that `exec`s `adb.exe`, symlinked as `$ANDROID_HOME/platform-tools/adb`, is what makes `npx expo run:android` find the device. `adb reverse tcp:8000 tcp:<host-port>` then maps the *device's* `localhost:8000` to the host port the devcontainer actually publishes (the container maps 8000 to `6898` and 3000 to `6899`), so a local-API build reaches `http://localhost:8000/api` from the app. For Metro in dev builds, `adb reverse tcp:8081 tcp:8081` reaches Windows, not WSL2 — run the bundle from a release/preview APK instead of a dev build, or point the app at the WSL2 address, rather than assuming the reverse works.
- **When `adb shell input text` silently does nothing, the IME has a dead input connection** — not the app. `dumpsys input_method` shows `mServedView=null` with a `BaseInputConnection` fallback, the keyboard is visibly shown, and `input text`, digit keyevents and `input keyboard text` all no-op. `adb shell am force-stop com.google.android.inputmethod.latin`, then tap the field again and type; a device reboot is the fallback when that stops working (both happened in one session). Taps on a themed `Checkbox` land on the label's centre, not its glyph. And the UI automator dump (`adb shell uiautomator dump`) is the readable source of truth for what is on screen, because `screencap` from WSL2 has come back blank while the tree was fully rendered.

### Production web build

`pnpm export:web` (`expo export --platform web --clear`) writes `dist/`; `pnpm serve:web` serves it through `scripts/serve-static.mjs`, a dependency-free static server that returns real 404s. `--clear` is load-bearing rather than hygiene: `EXPO_PUBLIC_API_URL` is inlined at transform time and is not part of Metro's cache key, so without it an export can ship the API origin of an earlier build. `MOBILE_WEB_TARGET=export` points the E2E suite at the built export instead of the dev server, so the same specs verify the artifact that ships.

`public/` is copied into `dist/` verbatim, which is how `manifest.json`, `icons/` and `.well-known/assetlinks.json` reach the served site; the manifest link itself comes from `app/+html.tsx`. `scripts/check-export.mjs` is the gate on that artifact (shape, legal text, manifest, assetlinks), run by the `Mobile Web Export` CI job — it is a script rather than a test because `dist/` is gitignored and a clean checkout has nothing to assert against.

### PWA, deliberately minimal

The export ships a manifest and icons, so Chrome offers Install; there is **no service worker**, and that is the decision: the app holds no offline data (everything is read from the API at runtime), a worker would add bundle-staleness and update UX to own forever, and Chrome is dropping the service-worker install requirement. `lib/queries/*` persistence is the thing that would make a worker worth having, and it would benefit native too — it is not in scope.

On this branch a commit needs the mobile suite only.

### Looking at it

```bash
make mockup     # from the repo root, on the host — not in the devcontainer
```

Then open the route you want: the app at `http://localhost:8081`, the design system at `http://localhost:8081/design`, or any other route by its path.

Two traps, both of which have cost real time:

- It has to run **on the host**. The devcontainer publishes only 3000 and 8000, so a server started inside it is invisible to the browser.
- It has to be the **dev server**. A static export (`npx expo export --platform web`) compiles `__DEV__` to false, and the lab's first line is `if (!__DEV__) return <Redirect href="/+not-found" />` — so in any export `/design` lands on "Nothing here", which reads as a broken route rather than as a guarded one.
