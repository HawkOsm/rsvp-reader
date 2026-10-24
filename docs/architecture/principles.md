# Engineering principles

The rules this codebase follows so that one person can ship one app to every device without it
breaking. They are the same principles large cross-platform apps (Discord, Facebook) use, scaled
down to a single maintainer. Each one has a **mechanism** in this repo that enforces it. A
principle with no mechanism is only a wish, so when you add a principle, add how it's checked.

Check a change against this list before merging it.

## 1. One core, thin shells

The app is written once, as a web app. Tauri (desktop) and Capacitor (Android) are thin shells
around the same build. Logic never forks per platform.

- **Mechanism:** one `pnpm build` feeds all three; `build-apps.yml` builds every shell from it.

## 2. Platform code behind one interface

The app never asks "am I on Android?". It asks the platform to do something (keep the screen on,
handle the back button), and each platform does it in its own way, or does nothing.

- **Mechanism:** `src/platform/` (`Platform` interface; `web`, `tauri`, `capacitor`
  implementations). Lint rejects `@tauri-apps/*` and `@capacitor/*` imports anywhere else.
- **Adding a native capability:** add a method to `Platform`, implement it in all three (a no-op
  is a valid implementation), and test each.

## 3. Layers, and one-way imports

Code depends downward only: `core` ← backend ← shared ← features ← app. Features don't know about
each other. See [ARCHITECTURE.md](../../ARCHITECTURE.md).

- **Mechanism:** ESLint `no-restricted-imports` per layer. Its messages say where code should go.

## 4. One-way data flow

State lives in one place for each kind of state: the engine (position, playback), the app store
(settings), IndexedDB (the library). Components read state and call actions; they don't keep
copies.

- **Mechanism:** `useSyncExternalStore` subscriptions (`engine-context.tsx`, `flags.ts`). See the
  state table in [reader.md](reader.md).

## 5. A design system

Screens are assembled from shared components and colour tokens, so a layout fix is made once.

- **Mechanism:** `src/components/`, the colour utilities, a lint rule against raw colour
  variables, and a test that keeps the two palette copies identical. See [ui.md](ui.md).

## 6. Tests in layers, gating every change

Many fast unit tests for logic, browser tests for what users do, and native builds for what
ships. Nothing should merge while CI is red (see 7).

| Layer   | What                                            | Where              | Runs           |
| ------- | ----------------------------------------------- | ------------------ | -------------- |
| Unit    | pure logic, hooks, storage on fake-indexeddb    | `tests/`           | every push     |
| Browser | the built app at desktop, short and phone sizes | `tests/e2e/`       | every push     |
| Native  | Linux, Windows, macOS and Android builds        | `native-check.yml` | native changes |

- **Rule:** a bug fix comes with the test that would have caught it. If it escaped the unit
  tests, add a browser check too.
- **Rule:** a new test must be seen to fail against broken code before it is trusted.

## 7. `main` is always releasable

Anything on `main` could ship today. Work that takes more than one PR goes behind a feature
flag, off by default.

- **Mechanism:** `src/lib/flags.ts` and Settings → Experimental; CI on every PR.
- **Enforced by:** GitHub branch protection on `main`: the `test` check must pass on code that
  is up to date with `main`, and nothing is pushed straight to it. The native builds are not
  required, because they only run when native files change.

## 8. Failures leave a record

A breakage nobody can see doesn't get fixed. Unexpected errors are logged on the device, never
sent anywhere, and the user can copy them into a bug report.

- **Mechanism:** `src/lib/error-log.ts`; Settings → Error log; the crash screen's copy button.
- **Rule:** never swallow an unexpected error with an empty `catch`. Log it, or explain in a
  comment why it is expected (a cancelled render, for example).

## 9. Data is versioned

A user's library outlives every version of the code. Stored data changes only through numbered
migrations, tested against the old shape.

- **Mechanism:** Dexie versions in `storage/schema.ts`; migration tests. See
  [storage.md](storage.md).

## 10. Use it every day

The best test is reading with the app. If it breaks, that's the most important bug there is.
Everything above exists to keep the daily build working.

- **Rule:** when something breaks while reading, first write a test that shows it, then fix it.

## Changing these principles

They can change, deliberately: append the reason to [decisions.md](decisions.md), and update
the mechanism in the same change.
