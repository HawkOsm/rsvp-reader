# UI and the design system

Every screen is built from a few shared pieces, so the app looks the same everywhere and a layout
fix is made once. `src/components/` is the design system.

## Colours

Colours are **tokens**, never hex values or raw variables in a component:

| Token       | Use                                                           | Utility examples               |
| ----------- | ------------------------------------------------------------- | ------------------------------ |
| `bg`        | the page                                                      | `bg-bg`, `text-bg` (on accent) |
| `bg-raised` | panels, dialogs, controls                                     | `bg-bg-raised`                 |
| `bg-hover`  | hovered rows                                                  | `hover:bg-bg-hover`            |
| `border`    | every border                                                  | `border-border`                |
| `text`      | body text                                                     | `text-text`                    |
| `text-dim`  | secondary text, hints, links                                  | `text-text-dim`                |
| `accent`    | the one action, the ORP letter, danger                        | `bg-accent`, `accent-accent`   |
| `guide`     | the RSVP guide ticks and lines                                | (canvas only)                  |
| `shelf-*`   | shelf dots: `blue`, `green`, `amber`, `violet` (and `accent`) | `bg-shelf-blue`                |

They are defined in `src/index.css` (dark, light, paper, and light-following-the-system), registered
with Tailwind by its `@theme inline` block, and copied into `src/lib/theme.ts` for the canvas,
which needs plain colours. `tests/lib/theme-css.test.ts` fails if the copies differ. Lint rejects
`[var(--color-…)]` in class names: use the utility.

To add a colour, add it to all four CSS blocks, the `@theme inline` block, and every palette in
`theme.ts`.

## Components

| Component                 | For                                                                      |
| ------------------------- | ------------------------------------------------------------------------ |
| `Page`                    | a full screen with a title row (`back`, `title`, `actions`, `sidebar`)   |
| `Icon`                    | the stroke icons buttons and links use; decorative, the control is named |
| `Centered`                | a full screen with one message: loading, or an error                     |
| `Dialog`, `DialogActions` | every modal question. Closes on Escape and on the backdrop               |
| `Button`                  | `default`, `primary` (the one action), `link`, `danger`                  |
| `Field`, `CONTROL`        | a label with its control; `CONTROL` is the look of inputs and selects    |
| `WpmInput`                | the words-per-minute box (commits on blur or Enter, not per key)         |

The reader is the exception: its chrome (header, transport bar, page overlay) is built around
the word and lives in `features/reader/components/`.

## Rules

- **Build screens from these components.** If two screens need the same new thing, it becomes a
  component here first.
- **Layout maths goes in pure functions with tests** (like `page-overlay.ts` and
  `book-layout.ts`), not in JSX.
- **Every interactive element has an accessible name** (`aria-label`, or visible text), so tests
  can find it the way a person would, by role and name.
- **It works at phone width.** The browser tests run at a phone size; a new screen should too.
