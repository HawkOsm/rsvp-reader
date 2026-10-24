# Contributing

How to set up, make a change that doesn't break something else, and ship it. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first; it explains where code goes and why.

## Setup

You need Node 22 or newer and pnpm (the version is pinned in `package.json`'s `packageManager`;
`corepack enable` picks it up).

```bash
pnpm install
```

```bash
pnpm dev
```

The dev server runs on port 5180, which Tauri's `devUrl` expects. `predev` and `prebuild` copy
the OCR data into `public/ocr/`.

For the desktop and Android shells, see the README's "Building it yourself".

## Scripts

| Script           | Does                                                      |
| ---------------- | --------------------------------------------------------- |
| `pnpm dev`       | Vite dev server                                           |
| `pnpm test`      | Vitest, the whole suite (`pnpm test:watch` while working) |
| `pnpm lint`      | ESLint, including the layer rules                         |
| `pnpm typecheck` | `tsc -b`: app, node config **and tests**                  |
| `pnpm format`    | Prettier, writes; `pnpm format:check` only checks         |
| `pnpm build`     | type-check and build the web app into `dist/`             |

## Definition of done

A change is done when **all of these pass locally**, in this order (CI runs the same):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && node tools/check-bundle-size.mjs
```

If the change touches anything you can see, also run the **smoke test** below in `pnpm dev`. The
unit tests can't catch layout and worker problems, and those are what broke most in the past.

### Smoke test (two minutes)

1. The library lists books. Add a `.txt` and a `.pdf` from `tests/fixtures/`.
2. Open the PDF. **Book mode** shows pages; the arrows and PgUp/PgDn turn them; "Fit page"
   fits.
3. Press `B` for **RSVP**. `Space` plays and pauses; the word changes; `←`/`→` step.
4. Press `P`: the **page overlay** appears and does not cover the word. Make the window short
   and narrow, then check it still doesn't cover the word (or is hidden).
5. Open the `.txt`: RSVP works and the page panel shows reflowed text.
6. Reload the page. You're back where you left off.
7. The browser console shows no errors.

## Where does my code go?

| You are writing…                               | Put it in                                     |
| ---------------------------------------------- | --------------------------------------------- |
| A screen, or a component only one feature uses | `src/features/<feature>/components/`          |
| A hook only one feature uses                   | `src/features/<feature>/hooks/`               |
| A call that reads or writes storage, or parses | `src/features/<feature>/api/`                 |
| A component two features use                   | `src/components/`                             |
| A pure helper two features use                 | `src/lib/`                                    |
| Pacing, tokenizing, anything about words       | `src/core/` (pure: no DOM, no I/O)            |
| A new file format                              | `src/parse/<format>/`, see formats-and-pdf.md |
| Anything that calls MuPDF                      | `src/pdf/document.ts` only                    |
| A schema change                                | a new Dexie version, see storage.md           |

If lint says an import is not allowed, the fix is to move code, not to silence the rule. Ask:
"which layer does this belong to?"

## Tests

- `tests/` mirrors `src/`: `src/features/reader/book-nav.ts` is tested in
  `tests/features/reader/book-nav.test.ts`.
- Test pure logic directly (book-nav, page-overlay, pacing). It's cheap and exact. Prefer moving
  logic out of a component into a pure function you can test, over testing it through the
  component.
- Storage tests use fake-indexeddb with a fresh database name per test.
- A bug fix comes with a test that fails without the fix.
- Fixtures go in `tests/fixtures/` and are small. Generated ones keep their generator script.

## Commits and branches

- `main` is the only long-lived branch. Work on a short-lived branch, open a PR, and merge once CI
  is green. Don't keep two long-running branches that restructure the same code; that's how this
  repo once ended up with two incompatible restructures.
- One logical change per commit. Moving files and changing behaviour go in **separate** commits,
  so a move can be reviewed as "nothing changed".
- Commit subjects are a plain imperative sentence saying what changes for the user or the code,
  for example "Show crashes instead of a blank screen". No `feat:`-style prefixes.
- Record a decision someone will ask "why?" about in `docs/architecture/decisions.md`, in the
  same PR.

## Releasing

Versions are kept in step in `package.json`, `src-tauri/tauri.conf.json` and
`android/app/build.gradle` (`versionName`, plus a `versionCode` that only goes up).

1. Bump the three versions on `main` and merge.
2. **Create a draft GitHub release for the tag first.** The Actions token isn't allowed to
   create releases, so the workflow uploads into a draft that already exists.
3. Push the version tag (a `v` prefix, for example `v0.3`). `.github/workflows/release.yml`
   builds the AppImage, the Windows installer, the macOS dmg and the APK, and attaches them to
   the draft.
4. Check the downloads, then publish the draft by hand.

`deploy-app.yml` publishes the web build to GitHub Pages.

## Licence

Contributions are under GPL-3.0-or-later. New dependencies must be permissive or
GPL-compatible, and must be listed in `THIRD_PARTY.md`.
