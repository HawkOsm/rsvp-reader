# The reader

`src/features/reader/`, plus the engine in `src/core/`.

## Pieces

```
ReaderScreen
 ├─ useLoadedBook(bookId, at)    loads book + tokens + progress through api/book.ts; a
 │                               bookmark link's ?at=<word> overrides where it starts
 ├─ createEngine(tokens)         one engine per opened book, destroyed on unmount
 └─ <EngineProvider>             engine-context.tsx: components subscribe to one value each
     ├─ RsvpCanvas               the word, drawn on a canvas, ORP letter pinned
     ├─ PagePanel                paged → PdfPagePanel/PdfPageView, reflow → TextReflowPanel
     │   └─ inside PageOverlay   in RSVP mode, the page shown over the reading area
     ├─ BookmarkButton           marks the current word (the library lists the marks)
     ├─ ContentsPanel            a book with chapters: jump to one, current marked; beside
     │                               the page in book mode on a wide screen, over it otherwise
     ├─ TransportBar / BookControls   play, seek, WPM / page turn, scale, spread; chapter
     │                               ticks on the bar and the time left in the chapter
     └─ ReaderHints              the shortcut strip
```

## The engine (`core/engine.ts`)

A plain object, not React state: `play`, `pause`, `seek`, `skip`, `setWpm`, and `on(event)` for
`word`, `playing`, `wpm` and `finished`. It schedules each word with `delayFor(token, wpm)`
(`core/pacing.ts`) and corrects for timer drift, so playback doesn't slowly fall behind the WPM.
The clock and timers are injectable, which is how the tests run it deterministically.

The token list never goes into React state. Components read one value through
`useEngineIndex()`, `useEnginePlaying()` and `useEngineWpm()` (`useSyncExternalStore`), so a new
word re-renders only what draws it.

Pacing and ORP were ported from the original Python engine (`rsvp_engine.py`, tag `v-legacy`)
and are meant to match it word for word. Change them deliberately.

## Two modes, one position

`mode` (in the app store) is `'rsvp'` or `'book'`. Both read and write the engine's index:

- **RSVP**: one word at a time. The page overlay (key `P`) shows the current page above or below
  the word, never over it. `page-overlay.ts` computes the box from the reading area's size and the
  font size, and returns `null` when there is no room. It's a pure function with its own tests.
- **Book**: pages. `book-nav.ts` is the pure paging maths (page ↔ token index, spreads, which
  word is at a point). `book-scroll.ts` does the DOM scrolling. Entering book mode pauses
  playback.

The reflowed view (`TextReflowPanel`) renders a window of words, not the whole book:
`reflow-window.ts` places it around the current word, keeps it while the word stays well inside,
and grows it (trimming the far side) as the reader scrolls toward an edge. It follows the word
only when the word changes, so scrolling away to read on is never undone.

Where the reader is among the chapters (`chapterAt`, the bar's ticks, words left in the chapter)
is pure maths in `chapters.ts`. Chapters come from `book.chapters`, which is empty for a book
without them, so nothing chapter-shaped is drawn for it.

Page geometry shared with the store (scale limits, fit-to-page and fit-to-width) is in
`src/lib/book-layout.ts`.

## State

| State                                                  | Lives in                         | Persisted?                     |
| ------------------------------------------------------ | -------------------------------- | ------------------------------ |
| Word index, playing, WPM                               | the engine                       | via `useAutosaveProgress`      |
| Theme, fonts, default WPM, panel open, spread, scale   | `stores/app-store.ts`            | yes, `settings` table          |
| Mode, fit scales, pending fit, "arrive at bottom" flag | `stores/app-store.ts`            | no                             |
| The open PDF                                           | `usePdfDocument` (a `PdfHandle`) | no; reopened from stored bytes |

The app store holds some reader-only view state (mode, fits, `arriveAtBottom`). Splitting it
into a reader store is a possible future cleanup. It's in the shared store today because
`setBookScale` and the fit logic share it.

## Shortcuts

`hooks/useReaderKeyboardShortcuts.ts` has one key map per mode, and ignores keys typed into
inputs (`lib/keyboard.ts`). The one global shortcut (Ctrl/Cmd+L, back to the library) is in
`app/hooks/useGlobalShortcuts.ts`. The README's shortcut tables are the user-facing
specification; keep them in step.

## Known fragile spots

These broke most often in October 2026. Each one now has a browser test in `tests/e2e/reader.spec.ts`;
each test was checked by breaking the code on purpose and confirming the test fails.

- **The page overlay at small or short windows.** It was redesigned three times. The test sweeps
  nine window sizes, from a sideways phone to 320x480, and checks that the overlay never overlaps
  the word, stays inside the window and draws the page. Its rule is in `page-overlay.ts`; change
  the rule there, with a unit test, not in the component.
- **Book-mode fitting.** `pendingFit` is applied once page sizes arrive (`setBookFits`). Getting
  the order wrong gives a page at the wrong size, or a blank one. The test checks that "Fit"
  leaves nothing to scroll, before and after the window shrinks.
- **The PDF worker dying.** `pdf/client.ts` reports it through `onLost`, and `usePdfDocument`
  reopens the book (at most three times a minute). The test throws inside the real worker and
  checks that a new worker takes over and the pages draw again.
