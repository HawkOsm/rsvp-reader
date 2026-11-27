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
     ├─ ReaderMenu               on a phone, the "⋯" holding the mode switch, Contents, page
     │                               view and bookmark, which the header has no room for
     ├─ PositionOffer            once Drive is connected: another device's newer place, offered under
     │                               the header ("Jump there?"); never applied unasked
     ├─ NotesPanel               add a note on the word being read,
     │                               list, jump, edit, delete, settle a conflict, export
     │                               (copy as Markdown; save as .md where `savesFiles`)
     ├─ ContentsPanel            a book with chapters: jump to one, current marked; beside
     │                               the page in book mode on a wide screen, over it otherwise
     ├─ TransportBar             RSVP: play, seek, WPM; chapter ticks on the bar and the time
     │                               left in the chapter
     ├─ BookNav                  book mode: one line under the page (where the reader is, an
     │                               arrow each side) that opens the jump panel
 └─ ReaderHints              the shortcut strip, only where there is a keyboard to use
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
  - **Page size** is one stored number, the PDF scale. Each time the pages or their area
    change, the panel reports the scales that fit the whole page and the width, and a page that
    was at one of those fits follows the new one (a window resized, a tablet turned, a page of
    another size); a size the reader set by hand stays. Pages smaller than their area sit in its
    middle.
  - **Small screens** (`ROOM_FOR_SPREAD` in `lib/media.ts` is false: a phone, either way up) get
    one page at a time whatever layout was chosen (`useBookSpread`), fitted to the width each
    time a book is opened there (`useSmallScreenFit`), and no size slider or two-page button.
  - **Touch** (`book-gestures.ts` for the arithmetic, `useBookGestures` for the listening;
    fingers only, a mouse selects text as before). A tap at the left or right
    edge (30% of the width each, as in KOReader and Foliate) turns the page, scrolling a tall
    one first as the arrow keys do; a tap in the middle is for the controls; a sideways swipe
    turns the page while it is no wider than its area (a wider one scrolls sideways instead);
    a pinch stretches the page with a CSS transform and redraws it at the new scale when the
    fingers lift, no smaller than the whole page; a double tap in the middle switches between
    the two fits. A finger's tap never jumps to the word under it. Vertical scrolling stays the
    browser's (`touch-action`). Checked with synthetic pointer events, not yet on a phone.
  - **The whole screen for the page**, however it is read. The header starts in its place and
    goes away as soon as the reader moves through the book (any `word` event). After that it
    is laid over the page and taken off again by a tap in the middle, by Enter, or by a mouse
    reaching the top edge (`REVEAL_PX`) and leaving it (`LEAVE_MS`): `bookControls` in
    `ReaderScreen`. Over, not beside, so the page keeps its size and is not drawn again.
  - **No bar under the page.** `BookNav` is one line: the page and how far through (for a book
    without pages, how far and the chapter), with an arrow each side to turn a paged book.
    Pressing it, or G, opens the jump panel over the page: a page number (or a percent) to
    type, a drag along the whole book with the chapters marked, back and forward a chapter,
    Back and Forward through the jumps made, and for a paged book one or two pages, the fit
    and the size. The jumps are `jump-history.ts` (pure) kept by `useJumps`; the chapter list
    and Alt+← / Alt+→ use them too.
  - **Mouse wheel and trackpad** (`wheel-turn.ts` for the arithmetic, the listener in
    `PdfPagePanel`): a page with more to scroll scrolls; one with nothing left that way turns,
    once per flick however long the flick, and not at the end of a flick that was scrolling.
    A sideways swipe turns it. With Ctrl, which is also how a trackpad pinch arrives, it
    zooms: stretched at once, drawn again when the wheel rests.
  - **A menu for selected words.** A selection over the book's words brings up a small menu
    under it (`SelectionNote`), as a right-click would: "Add note" makes a note on
    the words, and when one word is selected "Read from here" moves the reader's place to
    it. That is the only way to pick a word in book mode: a click or a tap on a word picks
    nothing there (beside the RSVP word, in the page panel, a click still does). The mark on the current
    word, and a selection anywhere in the app, are drawn in `--reader-mark`: the reader's
    focus-letter colour if one was chosen, else the theme's accent (`applyMarkColor`). `selection-words.ts`
    finds the words: reflowed text marks each with `data-word`; a PDF page's selectable text
    lies over a picture, so each `PdfPageView` registers a locator that says which word is
    at a point. That text (`PdfTextLayer`) is a span a line and in it a span a word, each
    letter-spaced to the width the word has on the page, with the space after it as wide
    as the gap to the next: a selection then covers exactly the words it shows. The note's anchor is the first word and its quote the words
    selected (80 at most). Nothing new is stored: a note still has one word and a quote.
  - **A zoom keeps its spot.** A pinch is made about the point between the fingers, a wheel
    zoom about the pointer (`zoomHold`). The page stays stretched about that point until it
    has been drawn at its new size; then `PdfPagePanel` takes the stretch off and scrolls so
    the same part of the page is where it was (`holdShift`). A page smaller than its area is
    centred and cannot be scrolled, so there the spot can move.
  - **Pages with no words** (blank, or one whole picture) are shown apart from the reader's
    place. The page shown is otherwise the current word's, and no word is on such a page, so
    `goToPage` sets the store's `blankPage` instead of seeking, and `turn` steps from the page
    on screen (`shownStart`). The place stays where it was: RSVP goes on from there. Any move
    of the place puts the blank page away. (`tests/fixtures/blank-middle-page.pdf` was made
    with MuPDF: three pages, the middle one empty.)

The reflowed view (`TextReflowPanel`) renders a window of words, not the whole book:
`reflow-window.ts` places it around the current word, keeps it while the word stays well inside,
and grows it (trimming the far side) as the reader scrolls toward an edge. It follows the word
only when the word changes, so scrolling away to read on is never undone.

In book mode the reflowed view is read by scrolling, so the place follows the scroll: once a
scroll has rested (`SETTLE_MS`), the first word in view becomes the engine's index, which is
what gets saved and where RSVP goes on. A place set that way is not marked on the page and
moves nothing: the window is not placed again around it and the page is not scrolled to it.
A word picked with a mouse is marked, and the page scrolls only if it is out of sight. When
the page scrolls itself to a word that was jumped to, the place does not follow that scroll
(`ownScroll`); it would slide back to the top of the screen. At the very bottom the place is the
book's last word. Space
and the paging keys scroll a screen. A finger's tap is for the controls and picks no word, and
a finger's scroll hides the header (see "The whole screen for the page").

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

Escape, and Android's back button (`app/hooks/useBackButton.ts`), first close whatever lies
over the page: the chapter list when it is laid over, the notes. Each registers how to close
itself while it is open (`whileOpen` in `lib/dismiss.ts`), and the key or button asks
`dismissTop()` before doing what it usually does. The jump panel and the popovers catch Escape
themselves.

The progress bar (`ScrubBar`) pauses playback while it is dragged and goes on afterwards, so
the words don't move the knob from under the finger.

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
